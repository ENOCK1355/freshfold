import type { Payment, Prisma } from "@prisma/client";
import { paymentScenarios } from "../../../packages/shared/src/index.js";
import { BusinessClock, DAY, feeRules } from "./clock.js";
import type { Config } from "./config.js";
import { AppError, ensure, requireValue } from "./config.js";
import type { DB } from "./database.js";
import { atomic, json } from "./database.js";
import { post } from "./finance.js";
import type { NotificationService } from "./notifications.js";
import {
  type Actor,
  audit,
  equal,
  hmac,
  hash,
  token,
  verifyPaystackSignature,
} from "./security.js";

type Target = {
  planId?: string;
  companyId?: string;
  renewalId?: string;
  autoRenew?: boolean;
  periodDays?: number;
};
export class PaymentService {
  simulatorKey = token();
  constructor(
    public db: DB,
    public config: Config,
    public clock: BusinessClock,
    public notifications: NotificationService,
  ) {}
  async provider(path: string, method = "GET", body?: unknown) {
    ensure(
      this.config.paystackSecret,
      503,
      "Paystack is not configured. Add your actual test secret key and webhook configuration in the server environment.",
    );
    const response = await fetch(`https://api.paystack.co${path}`, {
      method,
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${this.config.paystackSecret}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = (await response.json()) as {
      status: boolean;
      message?: string;
      data: any;
      code?: string;
    };
    if (!response.ok || !result.status)
      throw new AppError(
        502,
        result.message ||
          "The payment provider could not complete this request.",
        { providerStatus: response.status, providerCode: result.code },
      );
    return result.data;
  }
  async checkout(
    actor: Actor,
    input: {
      kind: string;
      orderId?: string;
      planId?: string;
      companyId?: string;
      idempotencyKey: string;
      method?: string;
      autoRenew?: boolean;
    },
  ) {
    ensure(
      this.config.mode === "simulator" ||
        this.config.paystackSecret?.startsWith(
          this.config.mode === "paystack_live" ? "sk_live_" : "sk_test_",
        ),
      503,
      "Online payments are being configured. Please try again shortly.",
    );
    ensure(
      !input.autoRenew || this.config.mode === "simulator",
      503,
      "Provider automatic renewal is not enabled. Use a fresh authorised checkout for each renewal.",
    );
    if (this.config.env === "production") {
      const r = await feeRules(this.db);
      ensure(
        r.productionPricesApproved,
        503,
        "Production pricing and commission rules require administrator approval before checkout.",
      );
    }
    const existing = await this.db.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      ensure(
        existing.userId === actor.id,
        403,
        "This checkout belongs to another account.",
      );
      return this.safe(existing);
    }
    let amount = 0;
    let target: Target = {};
    let orderId: string | undefined;
    if (input.kind === "order") {
      const order = requireValue(
        await this.db.order.findUnique({
          where: { id: input.orderId },
          include: { company: true },
        }),
      );
      ensure(
        order.userId === actor.id,
        403,
        "This order belongs to another customer.",
      );
      ensure(
        !["paid", "partially_refunded", "refunded", "refund_required"].includes(
          order.paymentStatus,
        ),
        409,
        "This order has already been paid.",
      );
      ensure(
        order.status !== "requested" && order.status !== "cancelled",
        409,
        "The company must accept this request before payment.",
      );
      const now = await this.clock.now();
      ensure(
        order.reservedUntil && order.reservedUntil > now,
        409,
        "This booking reservation expired. Please choose another collection slot.",
      );
      ensure(
        order.company.status === "approved",
        409,
        "This company cannot currently accept new payments.",
      );
      if (this.config.mode !== "simulator")
        ensure(
          order.company.paymentAccountApproved &&
            order.company.paystackSubaccount,
          503,
          "The company needs an approved Paystack settlement account before accepting provider payments.",
        );
      const pending = await this.db.payment.findFirst({
        where: { orderId: order.id, status: "pending" },
      });
      if (pending) return this.safe(pending);
      amount = order.total;
      orderId = order.id;
    } else if (input.kind === "student" || input.kind === "hosting") {
      if (input.kind === "student")
        ensure(
          actor.role === "student",
          403,
          "Student Plus is available to student accounts.",
        );
      const plan = requireValue(
        await this.db.plan.findUnique({ where: { id: input.planId } }),
        "Choose an available subscription plan.",
      );
      ensure(
        plan.active && plan.kind === input.kind,
        400,
        "This plan is not available for this purchase.",
      );
      if (input.kind === "hosting") {
        ensure(
          input.companyId &&
            actor.companyId === input.companyId &&
            actor.permissions.includes("subscription.write"),
          403,
          "Only an authorised company owner can purchase hosting.",
        );
        const company = requireValue(
          await this.db.company.findUnique({ where: { id: input.companyId } }),
        );
        ensure(
          company.status === "approved",
          409,
          "Your company must be approved before purchasing hosting.",
        );
        target.companyId = company.id;
      }
      const active = await this.db.subscription.findFirst({
        where: {
          ...(input.kind === "student"
            ? { userId: actor.id, companyId: null }
            : { companyId: input.companyId }),
          OR: [
            { status: "active", endsAt: { gt: await this.clock.now() } },
            { status: "pending_approval" },
          ],
        },
      });
      ensure(
        !active,
        409,
        "A subscription is already active or awaiting approval. Check your billing page.",
      );
      target = {
        ...target,
        planId: plan.id,
        periodDays: plan.periodDays,
        autoRenew: !!input.autoRenew && input.method !== "mobile_money",
      };
      amount = plan.price;
    } else if (input.kind === "sponsored") {
      ensure(
        input.companyId === actor.companyId &&
          actor.permissions.includes("promotions.write"),
        403,
        "Only an authorised owner can promote this company.",
      );
      const company = requireValue(
        await this.db.company.findUnique({ where: { id: input.companyId } }),
      );
      ensure(
        company.status === "approved" && company.published,
        409,
        "Publish an approved company before sponsoring its placement.",
      );
      const active = await this.db.campaign.findFirst({
        where: {
          companyId: company.id,
          status: "active",
          endsAt: { gt: await this.clock.now() },
        },
      });
      ensure(
        !active,
        409,
        "This company already has an active sponsored campaign.",
      );
      amount = (await feeRules(this.db)).sponsoredPrice;
      target = { companyId: company.id };
    } else throw new AppError(400, "Unknown payment type.");
    const runId = await this.clock.runId();
    const createdAt = await this.clock.now();
    const prepared = await atomic(this.db, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${actor.id} FOR UPDATE`;
      if (target.companyId)
        await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id"=${target.companyId} FOR UPDATE`;
      const prior = await tx.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (prior) {
        ensure(
          prior.userId === actor.id,
          403,
          "This checkout belongs to another account.",
        );
        return { payment: prior, created: false };
      }
      const pending = await tx.payment.findFirst({
        where: {
          userId: actor.id,
          kind: input.kind,
          status: "pending",
          ...(orderId ? { orderId } : {}),
        },
      });
      if (pending) return { payment: pending, created: false };
      if (orderId) {
        const order = requireValue(
          await tx.order.findUnique({ where: { id: orderId } }),
        );
        ensure(
          order.paymentStatus === "unpaid" && order.status !== "cancelled",
          409,
          "This order is already paid or its reservation was cancelled.",
        );
      }
      if (input.kind === "student" || input.kind === "hosting") {
        const active = await tx.subscription.findFirst({
          where: {
            ...(input.kind === "student"
              ? { userId: actor.id, companyId: null }
              : { companyId: target.companyId }),
            OR: [
              { status: "active", endsAt: { gt: createdAt } },
              { status: "pending_approval" },
            ],
          },
        });
        ensure(!active, 409, "This subscription is already active.");
      }
      const payment = await tx.payment.create({
        data: {
          reference: `FF-${this.config.env}-${runId.slice(-8)}-${token().slice(0, 12)}`,
          userId: actor.id,
          orderId,
          kind: input.kind,
          targetId: JSON.stringify(target),
          amount,
          mode: this.config.mode,
          source:
            this.config.mode === "simulator"
              ? "interactive"
              : this.config.mode === "paystack_live"
                ? "paystack_live"
                : "paystack_test",
          runId,
          idempotencyKey: input.idempotencyKey,
          method: input.method === "mobile_money" ? "mobile_money" : "card",
          createdAt,
        },
      });
      return { payment, created: true };
    });
    const { payment } = prepared;
    if (!prepared.created) return this.safe(payment);
    if (this.config.mode !== "simulator") {
      try {
        const email =
          this.config.mode === "paystack_test"
            ? this.config.testEmail || actor.email
            : actor.email;
        ensure(
          email && !email.endsWith(".test"),
          503,
          "Use a valid account email address for the payment receipt.",
        );
        const order = orderId
          ? await this.db.order.findUnique({
              where: { id: orderId },
              include: { company: true },
            })
          : null;
        const data = await this.provider("/transaction/initialize", "POST", {
          email,
          amount,
          currency: "GHS",
          reference: payment.reference,
          callback_url: `${this.config.appUrl}/payment/return?reference=${encodeURIComponent(payment.reference)}`,
          channels: ["card", "mobile_money"],
          metadata: { paymentId: payment.id, runId: payment.runId },
          ...(order?.company.paystackSubaccount
            ? {
                subaccount: order.company.paystackSubaccount,
                transaction_charge: order.commission + order.convenienceFee,
                bearer: "account",
              }
            : {}),
        });
        ensure(
          typeof data.authorization_url === "string" &&
            new URL(data.authorization_url).protocol === "https:" &&
            (new URL(data.authorization_url).hostname === "paystack.com" ||
              new URL(data.authorization_url).hostname.endsWith(
                ".paystack.com",
              )),
          502,
          "The provider returned an unexpected checkout URL.",
        );
        return this.safe(
          await this.db.payment.update({
            where: { id: payment.id },
            data: { checkoutUrl: data.authorization_url },
          }),
        );
      } catch (e) {
        await this.db.payment.update({
          where: { id: payment.id },
          data: {
            status: "failed",
            failureReason:
              e instanceof Error
                ? e.message
                : "Checkout could not be initialised",
          },
        });
        throw e;
      }
    }
    return this.safe(payment);
  }
  safe(p: Payment) {
    return {
      id: p.id,
      reference: p.reference,
      kind: p.kind,
      amount: p.amount,
      status: p.status,
      mode: p.mode,
      checkoutUrl: p.checkoutUrl,
      failureReason: p.failureReason,
      orderId: p.orderId,
      verifiedAt: p.verifiedAt,
    };
  }
  async retry(actor: Actor, id: string) {
    let payment = requireValue(
      await this.db.payment.findUnique({ where: { id } }),
    );
    ensure(
      payment.userId === actor.id,
      403,
      "This payment belongs to another account.",
    );
    ensure(
      payment.mode === this.config.mode && payment.mode !== "simulator",
      409,
      "This payment is not available for online checkout.",
    );
    if (payment.status === "success") return this.safe(payment);
    if (payment.checkoutUrl) {
      await this.verifyProvider(payment.reference);
      const fresh = await this.db.payment.findUniqueOrThrow({ where: { id } });
      if (fresh.status === "success" || fresh.status === "pending")
        return this.safe(fresh);
      payment = fresh;
    }
    ensure(
      ["failed", "cancelled"].includes(payment.status),
      409,
      "Check the status of this payment before starting another checkout.",
    );
    const target: Target = JSON.parse(payment.targetId || "{}");
    return this.checkout(actor, {
      kind: payment.kind,
      orderId: payment.orderId || undefined,
      planId: target.planId,
      companyId: target.companyId,
      method: payment.method,
      idempotencyKey: crypto.randomUUID(),
    });
  }
  async get(actor: Actor, id: string) {
    const p = requireValue(
      await this.db.payment.findFirst({
        where: { OR: [{ id }, { reference: id }] },
      }),
    );
    ensure(
      p.userId === actor.id || actor.role === "admin",
      403,
      "This payment belongs to another account.",
    );
    return this.safe(p);
  }
  async simulate(actor: Actor, id: string, scenario: string) {
    ensure(
      this.config.mode === "simulator" && this.config.env !== "production",
      404,
      "Simulator is unavailable.",
    );
    let p = requireValue(await this.db.payment.findUnique({ where: { id } }));
    ensure(
      p.userId === actor.id || actor.role === "admin",
      403,
      "This payment belongs to another account.",
    );
    ensure(
      (paymentScenarios as readonly string[]).includes(scenario),
      400,
      "Choose a valid simulator scenario.",
    );
    ensure(
      p.status !== "refunded",
      409,
      "This payment has already been refunded.",
    );
    if (p.status === "success") return this.safe(p);
    if (["failed", "cancelled"].includes(p.status))
      p = await this.db.payment.update({
        where: { id },
        data: { status: "pending", failureReason: null },
      });
    if (scenario === "pending") return this.safe(p);
    if (scenario === "delayed") {
      await this.db.job.upsert({
        where: { key: `delayed-${p.id}` },
        create: {
          key: `delayed-${p.id}`,
          kind: "simulator_payment",
          payload: { paymentId: p.id, scenario: "success" },
          dueAt: new Date((await this.clock.now()).getTime() + 60000),
        },
        update: {},
      });
      return this.safe(p);
    }
    if (scenario === "late_success" && p.orderId) {
      await this.db.order.update({
        where: { id: p.orderId },
        data: {
          reservedUntil: new Date((await this.clock.now()).getTime() - 1000),
        },
      });
    }
    const event = {
      id: `sim-${p.id}-${scenario === "duplicate" ? "success" : scenario}${["declined", "insufficient_funds", "cancelled"].includes(scenario) ? "-" + token() : ""}`,
      paymentId: p.id,
      amount: p.amount,
      currency: "GHS",
      status: ["declined", "insufficient_funds", "cancelled"].includes(scenario)
        ? scenario
        : "success",
    };
    const raw = JSON.stringify(event),
      signature = hmac(this.simulatorKey, raw);
    await this.simulatorEvent(raw, signature);
    if (scenario === "duplicate") await this.simulatorEvent(raw, signature);
    return this.safe(
      await this.db.payment.findUniqueOrThrow({ where: { id } }),
    );
  }
  async simulatorEvent(raw: string, signature: string) {
    ensure(
      this.config.mode === "simulator" &&
        this.config.env !== "production" &&
        equal(hmac(this.simulatorKey, raw), signature),
      401,
      "Invalid simulator event authentication.",
    );
    const event = JSON.parse(raw);
    const key = `simulator:${event.id}`;
    const row = await this.db.webhookEvent.upsert({
      where: { key },
      create: { key, adapter: "simulator", payload: event },
      update: {},
    });
    if (row.status === "processed") return;
    try {
      if (event.status === "success") {
        await this.applySuccess(
          event.paymentId,
          event.amount,
          event.currency,
          0,
          `sim_${event.id}`,
        );
      } else
        await this.db.payment.updateMany({
          where: { id: event.paymentId, status: "pending" },
          data: {
            status: event.status === "cancelled" ? "cancelled" : "failed",
            failureReason: event.status.replaceAll("_", " "),
          },
        });
      await this.db.webhookEvent.update({
        where: { key },
        data: {
          status: "processed",
          processedAt: await this.clock.now(),
          attempts: { increment: 1 },
        },
      });
    } catch (e) {
      await this.db.webhookEvent.update({
        where: { key },
        data: {
          status: "failed",
          error: e instanceof Error ? e.message : "Processing failed",
          attempts: { increment: 1 },
        },
      });
      throw e;
    }
  }
  async verify(actor: Actor, reference: string) {
    const p = requireValue(
      await this.db.payment.findUnique({ where: { reference } }),
    );
    ensure(
      p.userId === actor.id || actor.role === "admin",
      403,
      "This payment belongs to another account.",
    );
    ensure(
      this.config.mode !== "simulator",
      409,
      "Simulator transactions are confirmed by the simulator adapter, not by Paystack.",
    );
    await this.verifyProvider(reference);
    return this.safe(
      await this.db.payment.findUniqueOrThrow({ where: { id: p.id } }),
    );
  }
  async verifyProvider(reference: string) {
    const payment = requireValue(
      await this.db.payment.findUnique({ where: { reference } }),
    );
    const data = await this.provider(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    ensure(
      data.reference === reference &&
        data.currency === "GHS" &&
        data.amount === payment.amount,
      400,
      "Provider reference, amount, or currency did not match the server checkout.",
    );
    ensure(
      data.domain === (this.config.mode === "paystack_live" ? "live" : "test"),
      400,
      "Provider environment mismatch.",
    );
    ensure(
      payment.mode === this.config.mode,
      409,
      "This payment belongs to a different payment environment.",
    );
    if (data.status === "success") {
      await this.db.payment.update({
        where: { id: payment.id },
        data: {
          method: data.channel === "mobile_money" ? "mobile_money" : "card",
        },
      });
      await this.applySuccess(
        payment.id,
        data.amount,
        data.currency,
        Number(data.fees || 0),
        String(data.id),
        data.authorization,
      );
    } else if (["failed", "abandoned", "reversed"].includes(data.status))
      await this.db.payment.updateMany({
        where: { id: payment.id, status: "pending" },
        data: { status: "failed", failureReason: `Provider: ${data.status}` },
      });
  }
  async webhook(raw: string, header?: string, legacy?: string) {
    ensure(
      this.config.mode !== "simulator" &&
        verifyPaystackSignature(raw, header, legacy, this.config),
      401,
      "Invalid Paystack webhook signature.",
    );
    const data = JSON.parse(raw);
    const resource = data.data || {};
    const key = `paystack:${data.event}:${resource.id || resource.reference || resource.refund_reference || hash(raw)}:${resource.status || data.event}`;
    await this.db.webhookEvent.upsert({
      where: { key },
      create: { key, adapter: "paystack", payload: json(data) },
      update: {},
    });
    await this.db.job.upsert({
      where: { key: `webhook-${key}` },
      create: {
        key: `webhook-${key}`,
        kind: "paystack_webhook",
        payload: { eventKey: key },
        dueAt: new Date(),
      },
      update: {},
    });
    return { received: true };
  }
  async processWebhook(key: string) {
    const event = await this.db.webhookEvent.findUniqueOrThrow({
      where: { key },
    });
    if (event.status === "processed") return;
    const data = event.payload as any;
    if (data.event === "charge.success")
      await this.verifyProvider(data.data.reference);
    if (String(data.event).startsWith("refund.")) {
      const resource = data.data || {},
        identifiers: any[] = [];
      if (resource.id != null)
        identifiers.push({ providerId: String(resource.id) });
      for (const reference of [resource.reference, resource.refund_reference])
        if (typeof reference === "string" && reference)
          identifiers.push({ reference });
      const transactionReference =
        resource.transaction_reference || resource.transaction?.reference;
      if (typeof transactionReference === "string")
        identifiers.push({ payment: { reference: transactionReference } });
      const refunds = identifiers.length
        ? await this.db.refund.findMany({
            where: { OR: identifiers, payment: { mode: this.config.mode } },
          })
        : [];
      for (const refund of refunds) await this.checkRefund(refund.id);
    }
    await this.db.webhookEvent.update({
      where: { key },
      data: {
        status: "processed",
        processedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  }
  async applySuccess(
    id: string,
    amount: number,
    currency: string,
    providerFees: number,
    providerId: string,
    authorization?: unknown,
  ) {
    ensure(
      Number.isSafeInteger(providerFees) && providerFees >= 0,
      400,
      "Invalid provider processing cost.",
    );
    const result = await atomic(this.db, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id"=${id} FOR UPDATE`;
      const payment = requireValue(
        await tx.payment.findUnique({ where: { id } }),
      );
      ensure(
        payment.amount === amount &&
          payment.currency === currency &&
          payment.mode === this.config.mode,
        400,
        "Payment did not match its server record.",
      );
      if (payment.status === "success") return { payment, late: false };
      ensure(
        !["refunded"].includes(payment.status),
        409,
        "This payment has already been reversed.",
      );
      const now = await this.clock.now(tx);
      const rules = await feeRules(tx);
      const fee =
        this.config.mode === "simulator"
          ? Math.round((amount * rules.gatewayBps) / 10000)
          : providerFees;
      const p = await tx.payment.update({
        where: { id },
        data: {
          status: "success",
          verifiedAt: now,
          providerId,
          providerFees: fee,
          authorization: authorization ? json(authorization) : undefined,
          failureReason: null,
        },
      });
      const lines = [{ accountCode: "cash", debit: amount, credit: 0 }];
      let companyId: string | undefined;
      let late = false;
      if (payment.kind === "order") {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${payment.orderId!} FOR UPDATE`;
        const order = requireValue(
          await tx.order.findUnique({ where: { id: payment.orderId! } }),
        );
        companyId = order.companyId;
        // A second independently paid reference must not credit an order twice.
        ensure(
          ![
            "paid",
            "partially_refunded",
            "refunded",
            "refund_required",
          ].includes(order.paymentStatus),
          409,
          "Another payment has already paid this order. Contact support to reconcile the additional transaction.",
        );
        late =
          (!!order.reservedUntil && order.reservedUntil < now) ||
          order.status === "cancelled";
        lines.push(
          {
            accountCode: "company_payable",
            debit: 0,
            credit: order.companyShare + order.deliveryFee,
          },
          {
            accountCode: "commission_deferred",
            debit: 0,
            credit: order.commission,
          },
          {
            accountCode: "convenience_revenue",
            debit: 0,
            credit: order.convenienceFee,
          },
        );
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: late ? "refund_required" : "paid",
            ...(late ? { status: "cancelled" } : {}),
          },
        });
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            status: late ? "cancelled" : order.status,
            actorId: "payment-adapter",
            reason: late
              ? "Payment arrived after capacity reservation expired. A full refund is required."
              : "Payment verified by the server.",
            createdAt: now,
          },
        });
        if (late && !order.reservationReleased && order.slotId) {
          await tx.slot.update({
            where: { id: order.slotId },
            data: { reserved: { decrement: 1 } },
          });
          await tx.order.update({
            where: { id: order.id },
            data: { reservationReleased: true },
          });
        }
      } else {
        const target: Target = JSON.parse(payment.targetId || "{}");
        companyId = target.companyId;
        if (payment.kind === "sponsored") {
          const days = rules.sponsoredDays;
          await tx.campaign.create({
            data: {
              companyId: target.companyId!,
              paymentId: id,
              status: "active",
              startsAt: now,
              endsAt: new Date(now.getTime() + days * DAY),
              amount,
            },
          });
          lines.push({
            accountCode: "advertising_deferred",
            debit: 0,
            credit: amount,
          });
        } else {
          const plan = requireValue(
            await tx.plan.findUnique({ where: { id: target.planId } }),
          );
          if (target.renewalId)
            await tx.subscription.update({
              where: { id: target.renewalId },
              data: { status: "renewed" },
            });
          await tx.subscription.create({
            data: {
              userId: payment.userId,
              companyId: target.companyId,
              planId: plan.id,
              paymentId: id,
              status:
                this.config.mode === "simulator"
                  ? "active"
                  : "pending_approval",
              startsAt: now,
              endsAt: new Date(
                now.getTime() + (target.periodDays || plan.periodDays) * DAY,
              ),
              periodDaysSnapshot: target.periodDays || plan.periodDays,
              priceSnapshot: amount,
              renewalMethod:
                target.autoRenew && payment.method === "card"
                  ? "card_auto"
                  : "manual",
            },
          });
          lines.push({
            accountCode:
              payment.kind === "student"
                ? "student_deferred"
                : "hosting_deferred",
            debit: 0,
            credit: amount,
          });
        }
      }
      await post(
        tx,
        {
          key: `collection-${id}`,
          description: `${this.config.mode === "simulator" ? "Simulated" : "Provider-verified"} ${payment.kind} collection`,
          paymentId: id,
          companyId,
          source: payment.source,
          runId: payment.runId,
          createdAt: now,
        },
        lines,
      );
      if (fee)
        await post(
          tx,
          {
            key: `gateway-${id}`,
            description: "Platform-borne gateway processing cost",
            paymentId: id,
            companyId,
            source: payment.source,
            runId: payment.runId,
            createdAt: now,
          },
          [
            { accountCode: "gateway_expense", debit: fee },
            { accountCode: "cash", credit: fee },
          ],
        );
      await this.notifications.notify(
        payment.userId,
        "Payment confirmed",
        late
          ? "Your reservation expired; a full refund is being arranged."
          : ["hosting", "student"].includes(payment.kind) &&
              this.config.mode !== "simulator"
            ? "Your payment has been received. Your subscription is awaiting administrator approval."
            : "Your receipt is available.",
        payment.orderId
          ? `/account/orders/${payment.orderId}`
          : payment.kind === "student"
            ? "/account/billing"
            : "/business/subscription",
        tx,
      );
      await this.notifications.admins(
        ["hosting", "student"].includes(payment.kind)
          ? "Subscription payment received"
          : "Order payment received",
        `${payment.kind === "student" ? "Student Plus" : payment.kind === "hosting" ? "Business hosting" : "Laundry order"}: GHS ${(amount / 100).toFixed(2)}. Review the verified transaction.`,
        ["hosting", "student"].includes(payment.kind)
          ? "/admin/subscriptions"
          : "/admin/payments",
        tx,
      );
      if (payment.orderId && companyId)
        await this.notifications.owners(
          companyId,
          "Order payment confirmed",
          "The customer has paid. Your order queue and earnings have been updated.",
          `/business/orders/${payment.orderId}`,
          tx,
        );
      return { payment: p, late };
    });
    if (result.late) {
      const exists = await this.db.refund.findFirst({
        where: { paymentId: id, status: { not: "failed" } },
      });
      if (!exists)
        await this.refund({ id: "system", role: "admin" } as Actor, {
          orderId: result.payment.orderId!,
          full: true,
          reason:
            "Automatic full refund: payment received after booking reservation expiry.",
          idempotencyKey: `late-${id}`,
          outcome: "pending",
        });
    }
    return result.payment;
  }
  async refund(
    actor: Actor,
    input: {
      orderId: string;
      full?: boolean;
      amount?: number;
      reason: string;
      idempotencyKey: string;
      outcome?: string;
    },
  ) {
    ensure(
      actor.role === "admin",
      403,
      "Only an administrator can authorise refunds.",
    );
    const ref = `FF-RF-${input.idempotencyKey}`;
    ensure(
      /^[A-Za-z0-9_-]{8,64}$/.test(ref),
      400,
      "Use a valid refund request reference.",
    );
    const existing = await this.db.refund.findUnique({
      where: { reference: ref },
    });
    if (existing) {
      const original = await this.db.payment.findUniqueOrThrow({
        where: { id: existing.paymentId },
      });
      ensure(
        original.mode === this.config.mode,
        409,
        "This refund belongs to a different payment environment.",
      );
      ensure(
        existing.status !== "failed",
        409,
        existing.failureReason ||
          "This refund request failed. Close the dialog and create a new request after correcting the problem.",
      );
      return existing;
    }
    const refund = await atomic(this.db, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${input.orderId} FOR UPDATE`;
      const order = requireValue(
        await tx.order.findUnique({
          where: { id: input.orderId },
          include: {
            payments: { where: { status: "success" } },
            refunds: true,
          },
        }),
      );
      const payment = requireValue(
        order.payments[0],
        "This order has no verified payment to refund.",
      );
      ensure(
        payment.mode === this.config.mode,
        409,
        "This order was not charged through the current payment provider and cannot be refunded through Paystack.",
      );
      if (this.config.mode !== "simulator")
        ensure(
          payment.providerId && payment.verifiedAt,
          409,
          "A verified Paystack charge is required before requesting a refund.",
        );
      const reserved = order.refunds.filter((r) => r.status !== "failed");
      const refundedLaundry = reserved.reduce((n, r) => n + r.laundryAmount, 0);
      const refundedFees = reserved.reduce(
        (n, r) => n + r.convenienceReversal,
        0,
      );
      const refundedDelivery = reserved.reduce(
        (n, r) => n + r.deliveryReversal,
        0,
      );
      const laundry = input.full
        ? order.subtotal - refundedLaundry
        : input.amount || 0;
      ensure(
        Number.isSafeInteger(laundry) &&
          (input.full ? laundry >= 0 : laundry > 0) &&
          laundry <= order.subtotal - refundedLaundry,
        400,
        "Refund amount exceeds the remaining laundry charge.",
      );
      const prevCommission = reserved.reduce(
        (n, r) => n + r.commissionReversal,
        0,
      );
      const comm =
        Math.round(
          ((refundedLaundry + laundry) * order.commission) / order.subtotal,
        ) - prevCommission;
      const convenience = input.full ? order.convenienceFee - refundedFees : 0;
      const delivery = input.full ? order.deliveryFee - refundedDelivery : 0;
      ensure(
        laundry + convenience + delivery > 0,
        409,
        "This order has no remaining refundable balance.",
      );
      const r = await tx.refund.create({
        data: {
          reference: ref,
          paymentId: payment.id,
          orderId: order.id,
          amount: laundry + convenience + delivery,
          laundryAmount: laundry,
          commissionReversal: comm,
          companyReversal: laundry - comm,
          convenienceReversal: convenience,
          deliveryReversal: delivery,
          reason: input.reason,
          actorId: actor.id,
          status: "pending",
          createdAt: await this.clock.now(tx),
        },
      });
      await audit(tx, actor.id, "refund.authorised", r.id, input.reason);
      return r;
    });
    if (this.config.mode === "simulator") {
      if (input.outcome === "failed")
        return this.db.refund.update({
          where: { id: refund.id },
          data: { status: "failed" },
        });
      if (input.outcome === "pending") {
        await this.db.job.upsert({
          where: { key: `refund-${refund.id}` },
          create: {
            key: `refund-${refund.id}`,
            kind: "simulator_refund",
            payload: { refundId: refund.id },
            dueAt: new Date((await this.clock.now()).getTime() + 60000),
          },
          update: {},
        });
        return refund;
      }
      return this.completeRefund(refund.id);
    }
    return this.submitRefund(refund.id);
  }
  async refundOptions(actor: Actor, orderId?: string) {
    ensure(actor.role === "admin", 403, "Administrator access required.");
    const rows = await this.db.order.findMany({
      where: {
        ...(orderId ? { id: orderId } : {}),
        paymentStatus: {
          in: ["paid", "partially_refunded", "refund_required"],
        },
        payments: {
          some: {
            status: "success",
            mode: this.config.mode,
            ...(this.config.mode !== "simulator"
              ? { providerId: { not: null }, verifiedAt: { not: null } }
              : {}),
          },
        },
      },
      include: { refunds: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows
      .map((order) => {
        const reserved = order.refunds.filter(
          (refund) => refund.status !== "failed",
        );
        return {
          id: order.id,
          reference: order.reference,
          total: order.total,
          remainingAmount:
            order.total - reserved.reduce((n, refund) => n + refund.amount, 0),
          remainingLaundry:
            order.subtotal -
            reserved.reduce((n, refund) => n + refund.laundryAmount, 0),
        };
      })
      .filter((order) => order.remainingAmount > 0);
  }
  async queueRefundCheck(id: string, delay = 30000) {
    const dueAt = new Date(Date.now() + delay);
    const key = `refund-check-${id}-${Math.floor(dueAt.getTime() / 30000)}`;
    await this.db.job.upsert({
      where: { key },
      create: { key, kind: "refund_check", payload: { refundId: id }, dueAt },
      update: {},
    });
  }
  async findProviderRefund(reference: string) {
    const values = await this.provider(
      `/refund?reference=${encodeURIComponent(reference)}&perPage=100`,
    );
    ensure(
      Array.isArray(values),
      502,
      "Paystack returned an unreadable refund list.",
    );
    return values.find(
      (value: any) =>
        String(value.reference || "").toLowerCase() === reference.toLowerCase(),
    );
  }
  private async updatePendingRefund(
    id: string,
    data: Prisma.RefundUpdateManyMutationInput,
  ) {
    await this.db.refund.updateMany({
      where: { id, status: { notIn: ["processed", "failed"] } },
      data,
    });
    return this.db.refund.findUniqueOrThrow({ where: { id } });
  }
  async submitRefund(id: string) {
    const refund = await this.db.refund.findUniqueOrThrow({
      where: { id },
      include: { payment: true },
    });
    ensure(
      refund.payment.mode === this.config.mode &&
        this.config.mode !== "simulator",
      409,
      "This payment is not refundable through the current Paystack environment.",
    );
    if (refund.status === "processed" || refund.providerId)
      return this.checkRefund(id);
    ensure(
      refund.status !== "failed",
      409,
      "Create a new refund request after correcting the recorded failure.",
    );
    let accepted = false;
    try {
      let data =
        refund.lastCheckedAt || refund.failureReason
          ? await this.findProviderRefund(refund.reference)
          : undefined;
      if (!data)
        data = await this.provider("/refund", "POST", {
          transaction: refund.payment.reference,
          amount: refund.amount,
          currency: "GHS",
          merchant_note: refund.reason,
          customer_note: "Fresh Fold laundry refund",
          reference: refund.reference,
        });
      ensure(
        data.id != null,
        502,
        "Paystack did not return a refund identifier.",
      );
      accepted = true;
      const saved = await this.updatePendingRefund(id, {
        providerId: String(data.id),
        status: "processing",
        failureReason: null,
        lastCheckedAt: new Date(),
      });
      if (saved.status === "processed" || saved.status === "failed")
        return saved;
      return await this.checkRefund(id);
    } catch (error) {
      const status =
        error instanceof AppError
          ? (error.details as any)?.providerStatus
          : undefined;
      if (status === 409 && !accepted) {
        const found = await this.findProviderRefund(refund.reference).catch(
          () => undefined,
        );
        if (found?.id != null) {
          await this.updatePendingRefund(id, { providerId: String(found.id) });
          return this.checkRefund(id);
        }
      }
      const definiteFailure =
        !accepted &&
        status >= 400 &&
        status < 500 &&
        status !== 409 &&
        status !== 429;
      const failureReason =
        error instanceof Error
          ? error.message
          : "Paystack has not confirmed this refund. Check its status before requesting another.";
      const result = await this.updatePendingRefund(id, {
        status: definiteFailure ? "failed" : "attention_required",
        failureReason,
        lastCheckedAt: new Date(),
      });
      if (result.status === "processed") return result;
      if (!definiteFailure) await this.queueRefundCheck(id);
      if (definiteFailure) throw error;
      return result;
    }
  }
  async checkRefund(id: string) {
    const refund = await this.db.refund.findUniqueOrThrow({
      where: { id },
      include: { payment: true },
    });
    ensure(
      refund.payment.mode === this.config.mode &&
        this.config.mode !== "simulator",
      409,
      "This refund belongs to a different payment environment.",
    );
    if (refund.status === "processed" || refund.status === "failed")
      return refund;
    const data = refund.providerId
      ? await this.provider(`/refund/${encodeURIComponent(refund.providerId)}`)
      : await this.findProviderRefund(refund.reference);
    if (!data) {
      const result = await this.updatePendingRefund(id, {
        status: "attention_required",
        lastCheckedAt: new Date(),
        failureReason:
          "Paystack has not recorded this refund yet. Retry this saved request instead of creating another.",
      });
      return result;
    }
    const transaction =
      typeof data.transaction === "object"
        ? data.transaction
        : { id: data.transaction };
    const matches =
      data.id != null &&
      (!refund.providerId || String(data.id) === refund.providerId) &&
      Number(data.amount) === refund.amount &&
      data.currency === refund.payment.currency &&
      (data.domain || transaction?.domain) ===
        (this.config.mode === "paystack_live" ? "live" : "test") &&
      (String(transaction?.id) === refund.payment.providerId ||
        transaction?.reference === refund.payment.reference) &&
      (!data.reference ||
        String(data.reference).toLowerCase() ===
          refund.reference.toLowerCase());
    if (!matches) {
      const message =
        "Paystack refund details did not match the authorised transaction, amount, currency, or environment.";
      const result = await this.updatePendingRefund(id, {
        status: "attention_required",
        failureReason: message,
        lastCheckedAt: new Date(),
      });
      if (result.status === "processed" || result.status === "failed")
        return result;
      throw new AppError(409, message);
    }
    const status = String(data.status || "pending").replaceAll("-", "_");
    const allowed = [
      "processed",
      "pending",
      "processing",
      "received",
      "failed",
      "needs_attention",
    ];
    const result = await this.updatePendingRefund(id, {
      providerId: String(data.id),
      status:
        status === "processed"
          ? "processing"
          : allowed.includes(status)
            ? status
            : "attention_required",
      lastCheckedAt: new Date(),
      failureReason:
        status === "failed"
          ? "Paystack could not process this refund. Check the provider dashboard before submitting a new request."
          : status === "needs_attention"
            ? "Paystack needs additional refund details. Review this refund in the Paystack dashboard."
            : null,
    });
    if (result.status === "processed" || result.status === "failed")
      return result;
    if (status === "processed") return this.completeRefund(id);
    if (["pending", "processing", "received"].includes(status))
      await this.queueRefundCheck(id);
    return result;
  }
  async manageRefund(actor: Actor, id: string, retry = false) {
    ensure(actor.role === "admin", 403, "Administrator access required.");
    await audit(
      this.db,
      actor.id,
      retry ? "refund.retry_requested" : "refund.status_checked",
      id,
    );
    return retry ? this.submitRefund(id) : this.checkRefund(id);
  }
  async completeRefund(id: string) {
    return atomic(this.db, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Refund" WHERE "id"=${id} FOR UPDATE`;
      const reservation = requireValue(
        await tx.refund.findUnique({
          where: { id },
          select: { orderId: true },
        }),
      );
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${reservation.orderId} FOR UPDATE`;
      const r = requireValue(
        await tx.refund.findUnique({
          where: { id },
          include: { payment: true, order: true },
        }),
      );
      if (r.status === "processed") return r;
      ensure(
        r.payment.mode === this.config.mode,
        409,
        "This refund belongs to a different payment environment.",
      );
      ensure(
        r.status !== "failed",
        409,
        "A failed refund requires a new authorised request.",
      );
      const now = await this.clock.now(tx);
      const lines = [
        {
          accountCode: "company_payable",
          debit: r.companyReversal + r.deliveryReversal,
        },
        {
          accountCode: r.order.completedAt
            ? "commission_revenue"
            : "commission_deferred",
          debit: r.commissionReversal,
        },
        { accountCode: "convenience_revenue", debit: r.convenienceReversal },
        { accountCode: "cash", credit: r.amount },
      ];
      await post(
        tx,
        {
          key: `refund-${r.id}`,
          description: `${r.payment.mode === "simulator" ? "Simulated" : "Provider-confirmed"} refund: ${r.reason}`,
          paymentId: r.paymentId,
          companyId: r.order.companyId,
          source: r.payment.source,
          runId: r.payment.runId,
          createdAt: now,
        },
        lines,
      );
      const updated = await tx.refund.update({
        where: { id },
        data: {
          status: "processed",
          completedAt: now,
          failureReason: null,
          lastCheckedAt: new Date(),
        },
      });
      const all = await tx.refund.findMany({
        where: { orderId: r.orderId, status: "processed" },
      });
      const total = all.reduce((n, x) => n + x.amount, 0);
      const cancelUnstarted =
        total >= r.order.total &&
        ["requested", "accepted", "collection_scheduled"].includes(
          r.order.status,
        );
      if (cancelUnstarted && r.order.slotId && !r.order.reservationReleased)
        await tx.slot.updateMany({
          where: { id: r.order.slotId, reserved: { gt: 0 } },
          data: { reserved: { decrement: 1 } },
        });
      await tx.order.update({
        where: { id: r.orderId },
        data: {
          paymentStatus:
            total >= r.order.total ? "refunded" : "partially_refunded",
          ...(cancelUnstarted
            ? {
                status: "cancelled",
                reservationReleased: true,
                reservedUntil: null,
              }
            : {}),
        },
      });
      if (cancelUnstarted)
        await tx.orderEvent.create({
          data: {
            orderId: r.orderId,
            status: "cancelled",
            actorId: r.actorId,
            reason: "Order cancelled after its full refund was confirmed.",
            createdAt: now,
          },
        });
      await this.notifications.notify(
        r.order.userId,
        "Refund confirmed",
        "Your refund has been processed. View your order for the updated payment details.",
        `/account/orders/${r.orderId}`,
        tx,
      );
      await this.notifications.owners(
        r.order.companyId,
        "Order refund completed",
        "The customer's refund has completed and your transaction allocation has been updated.",
        `/business/orders/${r.orderId}`,
        tx,
      );
      await this.notifications.admins(
        "Refund completed",
        `GHS ${(r.amount / 100).toFixed(2)} was refunded for ${r.order.reference}.`,
        "/admin/refunds",
        tx,
      );
      return updated;
    });
  }
}
