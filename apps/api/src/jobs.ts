import { BusinessClock, DAY } from "./clock.js";
import { type Config, ensure } from "./config.js";
import type { DB } from "./database.js";
import { atomic } from "./database.js";
import { post } from "./finance.js";
import type { NotificationService } from "./notifications.js";
import type { PaymentService } from "./payments.js";
import type { Actor } from "./security.js";
import { audit, token } from "./security.js";
import type { FileService } from "./files.js";
export class JobService {
  running = false;
  constructor(
    public db: DB,
    public config: Config,
    public clock: BusinessClock,
    public payments: PaymentService,
    public notifications: NotificationService,
    public files?: FileService,
  ) {}
  async advance(actor: Actor, minutes: number) {
    ensure(actor.role === "admin", 403, "Administrator access required.");
    ensure(
      this.config.env !== "production" && this.config.mode === "simulator",
      404,
      "The controlled clock is available only in simulator mode.",
    );
    ensure(
      minutes > 0 && minutes <= 90 * 24 * 60,
      400,
      "Advance between 1 minute and 90 days.",
    );
    const before = await this.clock.now();
    const after = new Date(before.getTime() + minutes * 60000);
    await this.db.setting.upsert({
      where: { key: "demo.clock" },
      create: { key: "demo.clock", value: after.toISOString() },
      update: { value: after.toISOString() },
    });
    await audit(
      this.db,
      actor.id,
      "demo.clock_advanced",
      "demo.clock",
      `${minutes} minutes; provider billing and the operating-system clock are unchanged.`,
    );
    await this.tick();
    return { before, after };
  }
  async tick() {
    if (this.running) return { running: true };
    this.running = true;
    try {
      const now = await this.clock.now();
      await this.db.rateLimit.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      await this.db.job.updateMany({
        where: {
          status: "processing",
          kind: { not: "email" },
          dueAt: { lt: now },
        },
        data: {
          status: "pending",
          lastError: "Recovered an expired worker lease.",
          dueAt: now,
        },
      });
      await this.expireReservations(now);
      await this.subscriptions(now);
      await this.recognize(now);
      await this.campaigns(now);
      await this.fillSlots(now);
      const jobs = await this.db.job.findMany({
        where: {
          status: "pending",
          kind: { not: "email" },
          dueAt: { lte: now },
        },
        orderBy: { dueAt: "asc" },
        take: process.env.VERCEL ? 10 : 50,
      });
      const started = Date.now();
      for (const job of jobs) {
        if (process.env.VERCEL && Date.now() - started > 20000) break;
        const claim = await this.db.job.updateMany({
          where: { id: job.id, status: "pending" },
          data: {
            status: "processing",
            attempts: { increment: 1 },
            dueAt: new Date(now.getTime() + 5 * 60000),
          },
        });
        if (!claim.count) continue;
        try {
          const p = job.payload as any;
          if (job.kind === "simulator_payment")
            await this.payments.simulate(
              {
                id: (
                  await this.db.payment.findUniqueOrThrow({
                    where: { id: p.paymentId },
                  })
                ).userId,
                role: "admin",
              } as Actor,
              p.paymentId,
              p.scenario,
            );
          else if (job.kind === "simulator_refund")
            await this.payments.completeRefund(p.refundId);
          else if (job.kind === "file_scan") {
            ensure(this.files, 503, "The file scanner is not configured.");
            await this.files.scan(p.fileId);
          } else if (job.kind === "paystack_webhook")
            await this.payments.processWebhook(p.eventKey);
          else if (job.kind === "reconcile")
            await this.payments.verifyProvider(p.reference);
          else if (job.kind === "refund_check")
            await this.payments.checkRefund(p.refundId);
          await this.db.job.update({
            where: { id: job.id },
            data: { status: "completed", lastError: null },
          });
        } catch (e) {
          await this.db.job.update({
            where: { id: job.id },
            data: {
              status: job.attempts >= 4 ? "failed" : "pending",
              lastError: e instanceof Error ? e.message : "Job failed",
              dueAt: new Date(
                now.getTime() + Math.pow(2, job.attempts) * 60000,
              ),
            },
          });
        }
      }
      return { processed: jobs.length, now };
    } finally {
      this.running = false;
    }
  }
  async expireReservations(now: Date) {
    const orders = await this.db.order.findMany({
      where: {
        paymentStatus: "unpaid",
        reservationReleased: false,
        reservedUntil: { lt: now },
      },
    });
    for (const order of orders)
      await atomic(this.db, async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${order.id} FOR UPDATE`;
        const o = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
        if (o.reservationReleased || o.paymentStatus !== "unpaid") return;
        await tx.order.update({
          where: { id: o.id },
          data: {
            status: "cancelled",
            reservationReleased: true,
            events: {
              create: {
                status: "cancelled",
                actorId: "reservation-job",
                reason: "Unpaid reservation expired; capacity released.",
                createdAt: now,
              },
            },
          },
        });
        if (o.slotId)
          await tx.slot.update({
            where: { id: o.slotId },
            data: { reserved: { decrement: 1 } },
          });
      });
  }
  async subscriptions(now: Date) {
    const ending = await this.db.subscription.findMany({
      where: {
        status: "active",
        endsAt: { lte: new Date(now.getTime() + 3 * DAY) },
      },
      include: { plan: true, payment: true },
    });
    for (const s of ending) {
      if (s.endsAt > now) {
        const key = `renewal-reminder-${s.id}`;
        if (!(await this.db.job.findUnique({ where: { key } }))) {
          await this.notifications.notify(
            s.userId,
            "Subscription renewal approaching",
            `${s.plan.name} ends on ${s.endsAt.toISOString().slice(0, 10)}. ${s.renewalMethod === "manual" ? "A fresh authorised payment is required." : ""}`,
            s.companyId ? "/business/subscription" : "/account/billing",
          );
          await this.db.job.create({
            data: {
              key,
              kind: "reminder_record",
              payload: {},
              dueAt: now,
              status: "completed",
            },
          });
        }
        continue;
      }
      if (s.cancelAtEnd) {
        await this.db.subscription.update({
          where: { id: s.id },
          data: { status: "expired" },
        });
        continue;
      }
      if (s.renewalMethod === "card_auto" && this.config.mode === "simulator") {
        const outcome = await this.db.setting.findUnique({
          where: { key: "demo.renewal_outcome" },
        });
        const fail = outcome?.value === "failed";
        const key = `renewal-${s.id}`;
        const existing = await this.db.payment.findUnique({
          where: { idempotencyKey: key },
        });
        const p =
          existing ||
          (await this.db.payment.create({
            data: {
              reference: `SIM-RENEW-${token().slice(0, 12)}`,
              idempotencyKey: key,
              userId: s.userId,
              kind: s.plan.kind,
              targetId: JSON.stringify({
                planId: s.planId,
                companyId: s.companyId || undefined,
                renewalId: s.id,
                autoRenew: true,
              }),
              amount: s.plan.price,
              status: "pending",
              mode: "simulator",
              source: "interactive",
              runId: await this.clock.runId(),
              createdAt: now,
            },
          }));
        await this.payments.simulate(
          { id: s.userId, role: "admin" } as Actor,
          p.id,
          fail ? "declined" : "success",
        );
        if (fail) {
          await this.db.subscription.update({
            where: { id: s.id },
            data: {
              status: "past_due",
              graceUntil: new Date(now.getTime() + 3 * DAY),
            },
          });
          await this.notifications.notify(
            s.userId,
            "Renewal payment failed",
            "Your subscription needs a new authorised payment. Benefits are paused after the paid period.",
            s.companyId ? "/business/subscription" : "/account/billing",
          );
        }
      } else {
        await this.db.subscription.update({
          where: { id: s.id },
          data: { status: "expired" },
        });
        await this.notifications.notify(
          s.userId,
          "Your subscription has expired",
          "Renew through billing using a fresh authorised checkout. Mobile money is never charged automatically.",
          s.companyId ? "/business/subscription" : "/account/billing",
        );
      }
    }
    await this.db.subscription.updateMany({
      where: { status: "past_due", graceUntil: { lt: now } },
      data: { status: "expired" },
    });
  }
  async recognize(now: Date) {
    const subscriptions = await this.db.subscription.findMany({
      where: { paymentId: { not: null }, status: { not: "pending_approval" } },
      include: { plan: true, payment: true },
    });
    for (const s of subscriptions) {
      if (!s.payment || s.payment.status !== "success") continue;
      await atomic(this.db, async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id"=${s.id} FOR UPDATE`;
        const current = await tx.subscription.findUniqueOrThrow({
          where: { id: s.id },
        });
        const earned = Math.floor(
          s.priceSnapshot *
            Math.min(
              1,
              Math.max(
                0,
                (now.getTime() - s.startsAt.getTime()) /
                  (s.endsAt.getTime() - s.startsAt.getTime()),
              ),
            ),
        );
        const delta = earned - current.recognized;
        if (delta <= 0) return;
        const kind = s.plan.kind === "student" ? "student" : "hosting";
        await post(
          tx,
          {
            key: `recognize-${s.id}-${earned}`,
            description: `Daily recognition: ${s.plan.name}`,
            paymentId: s.paymentId!,
            companyId: s.companyId,
            source: s.payment!.source,
            runId: s.payment!.runId,
            createdAt: now,
          },
          [
            { accountCode: `${kind}_deferred`, debit: delta },
            { accountCode: `${kind}_revenue`, credit: delta },
          ],
        );
        await tx.subscription.update({
          where: { id: s.id },
          data: { recognized: earned },
        });
      });
    }
  }
  async campaigns(now: Date) {
    const campaigns = await this.db.campaign.findMany({
      include: { payment: true },
    });
    for (const c of campaigns) {
      await atomic(this.db, async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "id"=${c.id} FOR UPDATE`;
        const current = await tx.campaign.findUniqueOrThrow({
          where: { id: c.id },
        });
        const earned = Math.floor(
          c.amount *
            Math.min(
              1,
              Math.max(
                0,
                (now.getTime() - c.startsAt.getTime()) /
                  (c.endsAt.getTime() - c.startsAt.getTime()),
              ),
            ),
        );
        const delta = earned - current.recognized;
        if (delta > 0) {
          await post(
            tx,
            {
              key: `recognize-campaign-${c.id}-${earned}`,
              description:
                "Sponsored placement recognised over purchased period",
              paymentId: c.paymentId,
              companyId: c.companyId,
              source: c.payment.source,
              runId: c.payment.runId,
              createdAt: now,
            },
            [
              { accountCode: "advertising_deferred", debit: delta },
              { accountCode: "advertising_revenue", credit: delta },
            ],
          );
          await tx.campaign.update({
            where: { id: c.id },
            data: { recognized: earned },
          });
        }
        if (c.endsAt <= now && c.status === "active")
          await tx.campaign.update({
            where: { id: c.id },
            data: { status: "expired" },
          });
      });
    }
  }
  async fillSlots(now: Date) {
    const companies = await this.db.company.findMany({
      where: { status: "approved" },
      include: { hours: true, closures: true },
    });
    for (const c of companies)
      for (let d = 1; d <= 7; d++) {
        const date = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + d,
          ),
        );
        if (
          !c.hours.some((h) => h.day === date.getUTCDay()) ||
          c.closures.some(
            (x) =>
              x.date.toISOString().slice(0, 10) ===
              date.toISOString().slice(0, 10),
          )
        )
          continue;
        const hours = c.hours.find((h) => h.day === date.getUTCDay())!;
        const minutes = (value: string) =>
          Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
        const closes = minutes(hours.close);
        for (let minute = minutes(hours.open); minute < closes; minute += 120) {
          const startsAt = new Date(date.getTime() + minute * 60000);
          await this.db.slot.upsert({
            where: { companyId_startsAt: { companyId: c.id, startsAt } },
            create: {
              companyId: c.id,
              startsAt,
              endsAt: new Date(
                date.getTime() + Math.min(minute + 120, closes) * 60000,
              ),
              capacity: c.capacity,
            },
            update: {},
          });
        }
      }
  }
  async reconcile() {
    if (this.config.mode === "simulator") return;
    const refunds = await this.db.refund.findMany({
      where: {
        status: {
          in: ["pending", "processing", "received", "attention_required"],
        },
        payment: { mode: this.config.mode },
      },
      take: 30,
    });
    for (const refund of refunds)
      await this.payments.queueRefundCheck(refund.id, 0);
    const cursorKey = `payments.reconcile.${this.config.mode}.cursor`;
    const cursor = await this.db.setting.findUnique({
      where: { key: cursorKey },
    });
    const where = {
      mode: this.config.mode,
      status: "pending",
      createdAt: { lt: new Date(Date.now() - 60000) },
    };
    let pending = await this.db.payment.findMany({
      where: {
        ...where,
        ...(typeof cursor?.value === "string" && cursor.value
          ? { id: { gt: cursor.value } }
          : {}),
      },
      orderBy: { id: "asc" },
      take: 30,
    });
    if (!pending.length && cursor?.value)
      pending = await this.db.payment.findMany({
        where,
        orderBy: { id: "asc" },
        take: 30,
      });
    const bucket = Math.floor(Date.now() / 60000);
    for (const p of pending)
      await this.db.job.upsert({
        where: {
          key: `reconcile-${p.id}-${bucket}`,
        },
        create: {
          key: `reconcile-${p.id}-${bucket}`,
          kind: "reconcile",
          payload: { reference: p.reference },
          dueAt: new Date(),
        },
        update: {},
      });
    if (pending.length)
      await this.db.setting.upsert({
        where: { key: cursorKey },
        create: { key: cursorKey, value: pending[pending.length - 1].id },
        update: { value: pending[pending.length - 1].id },
      });
  }
}
