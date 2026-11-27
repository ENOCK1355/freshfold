import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import type { DB } from "./database.js";

import { BusinessClock, feeRules } from "./clock.js";
import { AppError, ensure, requireValue, type Config } from "./config.js";
import { FileService, pdfScannerConfigured } from "./files.js";
import { AdmissionsService } from "./admissions.js";
import { FinanceService } from "./finance.js";
import { IdentityService, registrationSchema } from "./identity.js";
import { JobService } from "./jobs.js";
import { MarketplaceService, bookingSchema } from "./marketplace.js";
import { NotificationService } from "./notifications.js";
import { OperationsService, companyUpdateSchema } from "./operations.js";
import { PaymentService } from "./payments.js";
import { initializeReferenceData } from "./reference-data.js";
import {
  AuthService,
  RateLimiter,
  audit,
  credentialsSchema,
  equal,
  type Actor,
} from "./security.js";
import { seed } from "./seed.js";

export function createApplication(db: DB, config: Config) {
  const auth = new AuthService(db, config),
    clock = new BusinessClock(db, config),
    notifications = new NotificationService(db);
  const market = new MarketplaceService(db, clock, auth, notifications),
    identity = new IdentityService(db, auth, market),
    finance = new FinanceService(db, clock),
    payments = new PaymentService(db, config, clock, notifications),
    ops = new OperationsService(
      db,
      config,
      auth,
      clock,
      notifications,
      finance,
    ),
    files = new FileService(db, config, auth),
    jobs = new JobService(db, config, clock, payments, notifications, files),
    admissions = new AdmissionsService(
      db,
      config,
      clock,
      payments,
      notifications,
    ),
    limiter = new RateLimiter();
  const app = {
    db,
    config,
    auth,
    clock,
    notifications,
    market,
    identity,
    finance,
    payments,
    ops,
    jobs,
    files,
    admissions,
    limiter,
    async initialize() {
      if (config.env === "production" || config.env === "staging") {
        const fixtures = await db.setting.findUnique({
          where: { key: "demo.seed_version" },
        });
        const syntheticCompanies = await db.company.count({
          where: { demo: true },
        });
        const syntheticUsers = await db.user.count({
          where: { demoScenario: { not: null } },
        });
        ensure(
          !fixtures && !syntheticCompanies && !syntheticUsers,
          500,
          "Production requires a clean, separate database. Sample accounts and business records cannot be published as live services.",
        );
      }
      await initializeReferenceData(db, config);
      if (config.mode !== "simulator")
        await db.refund.updateMany({
          where: {
            payment: { mode: "simulator" },
            providerId: null,
            status: "attention_required",
          },
          data: {
            status: "failed",
            failureReason:
              "The original payment was never charged by Paystack. No provider refund was created.",
          },
        });
      if (config.mode !== "simulator")
        await db.job.updateMany({
          where: {
            kind: { in: ["simulator_payment", "simulator_refund"] },
            status: { in: ["pending", "processing"] },
          },
          data: { status: "cancelled", lastError: null },
        });
      await db.authToken.updateMany({
        where: { kind: { in: ["verify", "recover"] }, usedAt: null },
        data: { usedAt: new Date() },
      });
      await db.job.updateMany({
        where: {
          kind: "email",
          status: { in: ["pending", "processing", "failed"] },
        },
        data: { status: "cancelled", lastError: null },
      });
      if (config.env === "demo" || config.env === "test") {
        const result = await seed(db, config);
        await jobs.fillSlots(await clock.now());
        if (result.seeded && config.mode === "simulator") {
          const u = await db.user.findUniqueOrThrow({
            where: { id: "student-pending" },
          });
          const a = {
            ...u,
            verifiedAt: u.verifiedAt!,
            permissions: [],
            csrf: "",
            sessionId: "",
          } as Actor;
          const slot = requireValue(
            (await market.slots("campus-linen")).find((s) => s.available > 0),
          );
          const order = await market.book(a, {
            companyId: "campus-linen",
            items: [{ serviceId: "campus-linen-wash", quantity: 2 }],
            slotId: slot.id,
            method: "pickup",
            address: {
              areaId: "amamoma",
              detail: "DEMO · sample collection at Valco Hall",
            },
            idempotencyKey: "seed-pending-booking",
          });
          const p = await payments.checkout(a, {
            kind: "order",
            orderId: order.id,
            idempotencyKey: "seed-pending-payment",
          });
          await db.order.update({
            where: { id: order.id },
            data: { source: "seed", runId: "seed-history" },
          });
          await db.payment.update({
            where: { id: p.id },
            data: { source: "seed", runId: "seed-history" },
          });
          await payments.refund({ id: "demo-admin", role: "admin" } as Actor, {
            orderId: "history-fold-finish",
            full: true,
            reason: "Seeded pending-refund demonstration. No real money moved.",
            idempotencyKey: "seed-pending-refund",
            outcome: "pending",
          });
          await db.ticket.update({
            where: { id: "demo-dispute" },
            data: { orderId: "history-greenbasket" },
          });
        }
      }
    },
    async handle(req: Request, res: Response) {
      res.setHeader("Cache-Control", "no-store");
      try {
        const p = req.path.replace(/^\/api\/?/, "").replace(/\/$/, "");
        const method = req.method;
        if (p === "maintenance" && method === "GET") {
          const secret = process.env.CRON_SECRET;
          ensure(
            secret &&
              secret.length >= 32 &&
              equal(req.get("authorization") || "", `Bearer ${secret}`),
            401,
            "Not authorised.",
          );
          await jobs.reconcile();
          return res.json(await jobs.tick());
        }
        if (p === "webhooks/paystack" && method === "POST") {
          const raw = (req as Request & { rawBody?: Buffer }).rawBody;
          ensure(raw, 400, "Raw webhook body is required.");
          return res.json(
            await payments.webhook(
              raw.toString(),
              req.get("paystack-signature"),
              req.get("x-paystack-signature"),
            ),
          );
        }
        limiter.check(
          `${req.method === "GET" ? "read" : "write"}:${req.ip}`,
          req.method === "GET" ? 600 : 120,
        );
        const actor = await auth.actor(req);
        auth.csrf(req, actor);
        const q = Object.fromEntries(
          Object.entries(req.query).filter(
            (v): v is [string, string] => typeof v[1] === "string",
          ),
        );
        const body = req.body || {};
        const need = (roles?: string[]) => auth.need(actor, roles);
        const demo = () =>
          ensure(
            (config.env === "demo" || config.env === "test") &&
              config.mode === "simulator",
            404,
            "Demo tools are disabled in production.",
          );
        let result: unknown;
        if (method === "GET" && (p === "health" || p === "ready")) {
          await db.$queryRaw`SELECT 1`;
          result = {
            status: "ok",
            database: "postgresql",
            environment: config.env,
          };
        } else if (method === "GET" && p === "config")
          result = {
            environment: config.env,
            paymentMode: config.mode,
            demo:
              (config.env === "demo" || config.env === "test") &&
              config.mode === "simulator",
            now: await clock.now(),
            companyEmail: config.companyEmail,
            uploads: { maxBytes: 3 * 1024 * 1024, pdf: pdfScannerConfigured() },
            whatsapp: config.whatsapp,
            paymentTesting:
              config.mode === "simulator" && config.env !== "production",
            areas: await db.area.findMany({
              where: { active: true },
              orderBy: { name: "asc" },
            }),
            plans: await db.plan.findMany({
              where: { active: true },
              orderBy: { price: "asc" },
            }),
            rules: await feeRules(db),
          };
        else if (method === "GET" && p === "auth/me")
          result = await identity.me(actor);
        else if (method === "POST" && p === "auth/register") {
          await limiter.shared(db, `register:${req.ip}`, 10);
          result = await identity.register(
            registrationSchema.parse(body),
            res,
            actor,
          );
        } else if (method === "POST" && p === "auth/login") {
          await limiter.shared(db, `login:${req.ip}`, 15);
          const b = credentialsSchema.parse(body);
          await limiter.shared(db, `email:${b.email}`, 10);
          result = await identity.login(b.email, b.password, res, actor);
        } else if (method === "POST" && p === "auth/logout") {
          await auth.logout(actor, res);
          result = { signedOut: true };
        } else if (method === "POST" && p === "auth/recovery-complete") {
          await limiter.shared(db, `recover:${req.ip}`, 10);
          const b = z
            .object({
              token: z.string().regex(/^[a-f0-9]{64}$/),
              password: credentialsSchema.shape.password,
            })
            .parse(body);
          result = await identity.recover(b.token, b.password, res, actor);
        } else if (method === "POST" && p === "account/password") {
          await limiter.shared(db, `password:${req.ip}`, 10);
          const b = z
            .object({
              current: z.string().min(1).max(128),
              password: credentialsSchema.shape.password,
            })
            .parse(body);
          result = await identity.changePassword(
            need(),
            b.current,
            b.password,
            res,
          );
        } else if (method === "GET" && p === "companies")
          result = await market.companies(q);
        else if (method === "GET" && /^companies\/[^/]+$/.test(p))
          result = await market.company(p.split("/")[1]);
        else if (method === "GET" && /^companies\/[^/]+\/slots$/.test(p))
          result = await market.slots(p.split("/")[1]);
        else if (method === "POST" && p === "bookings/quote")
          result = await market.quote(need(), bookingSchema.parse(body));
        else if (method === "POST" && p === "bookings")
          result = await market.book(need(), bookingSchema.parse(body));
        else if (method === "GET" && p === "orders")
          result =
            q.paged === "true"
              ? await market.orderPage(need(), q)
              : await market.orders(need(), q);
        else if (method === "GET" && p === "account/overview")
          result = await market.accountOverview(need());
        else if (method === "GET" && /^orders\/[^/]+$/.test(p))
          result = await market.order(need(), p.split("/")[1]);
        else if (method === "POST" && /^orders\/[^/]+\/status$/.test(p)) {
          const b = z
            .object({
              status: z.string(),
              reason: z.string().min(3).max(500),
              code: z.string().optional(),
            })
            .parse(body);
          result = await market.transition(
            need(),
            p.split("/")[1],
            b.status,
            b.reason,
            b.code,
          );
        } else if (method === "POST" && /^orders\/[^/]+\/review$/.test(p)) {
          const b = z
            .object({
              rating: z.number().int().min(1).max(5),
              text: z.string().min(10).max(2000),
            })
            .parse(body);
          result = await market.review(
            need(),
            p.split("/")[1],
            b.rating,
            b.text,
          );
        } else if (method === "POST" && /^orders\/[^/]+\/messages$/.test(p))
          result = await market.message(
            need(),
            p.split("/")[1],
            z.string().trim().min(1).max(2000).parse(body.body),
          );
        else if (method === "POST" && /^orders\/[^/]+\/adjustment$/.test(p)) {
          const b = z
            .object({
              weight: z.number().positive().max(100),
              reason: z.string().min(5).max(500),
            })
            .parse(body);
          result = await market.proposeAdjustment(
            need(),
            p.split("/")[1],
            b.weight,
            b.reason,
          );
        } else if (
          method === "POST" &&
          /^orders\/[^/]+\/approve-adjustment$/.test(p)
        ) {
          const a = need();
          const id = p.split("/")[1];
          const o = requireValue(await db.order.findUnique({ where: { id } }));
          ensure(
            o.userId === a.id,
            403,
            "Only the customer can approve the quote.",
          );
          const adj = o.quoteAdjustment as any;
          ensure(
            adj && adj.status === "awaiting_customer",
            409,
            "No price adjustment is awaiting approval.",
          );
          await db.order.update({
            where: { id },
            data: {
              quoteApprovedAt: await clock.now(),
              quoteAdjustment: { ...adj, status: "approved" },
            },
          });
          await audit(
            db,
            a.id,
            "quote.approved",
            id,
            "Customer approved a lower confirmed weight. Administrator refund required.",
          );
          result = { approved: true, refundDue: adj.refundDue };
        } else if (method === "POST" && p === "payments/checkout") {
          const b = z
            .object({
              kind: z.enum(["order", "student", "hosting", "sponsored"]),
              orderId: z.string().optional(),
              planId: z.string().optional(),
              companyId: z.string().optional(),
              idempotencyKey: z.string().min(8).max(100),
              method: z.enum(["card", "mobile_money"]).optional(),
              autoRenew: z.boolean().optional(),
            })
            .parse(body);
          result = await payments.checkout(need(), b);
        } else if (method === "GET" && /^payments\/[^/]+$/.test(p))
          result = await payments.get(need(), p.split("/")[1]);
        else if (method === "POST" && /^payments\/[^/]+\/simulate$/.test(p))
          result = await payments.simulate(
            need(),
            p.split("/")[1],
            z.string().parse(body.scenario),
          );
        else if (method === "POST" && p === "payments/verify")
          result = await payments.verify(
            need(),
            z.string().parse(body.reference),
          );
        else if (method === "POST" && /^payments\/[^/]+\/retry$/.test(p))
          result = await payments.retry(need(), p.split("/")[1]);
        else if (method === "GET" && p === "profile")
          result = await identity.profile(need());
        else if (method === "POST" && p === "account/reset-test") {
          ensure(
            identity.testAccountsEnabled,
            404,
            "That resource was not found.",
          );
          limiter.check(`account-test-reset:${req.ip}`, 10);
          const b = z
            .object({ password: z.string().min(1).max(128) })
            .parse(body);
          result = await identity.resetTestAccount(
            need(["student", "owner"]),
            b.password,
            res,
          );
        } else if (method === "PATCH" && p === "profile") {
          const b = z
            .object({
              name: z.string().min(2).max(100),
              phone: z
                .string()
                .regex(/^(?:\+233|0)[235]\d{8}$/)
                .optional(),
              preferences: z
                .object({
                  notifications: z.boolean(),
                  detergent: z.string().max(80),
                })
                .optional(),
            })
            .parse(body);
          result = await identity.saveProfile(need(), b);
        } else if (method === "POST" && p === "addresses") {
          const a = need();
          const b = z
            .object({
              label: z.string().min(2).max(50),
              detail: z.string().min(5).max(500),
              areaId: z.string(),
              instructions: z.string().max(500).optional(),
            })
            .parse(body);
          requireValue(
            await db.area.findUnique({ where: { id: b.areaId } }),
            "Choose a configured area.",
          );
          result = await db.address.create({ data: { ...b, userId: a.id } });
        } else if (method === "DELETE" && /^addresses\/[^/]+$/.test(p)) {
          const a = need();
          result = await db.address.deleteMany({
            where: { id: p.split("/")[1], userId: a.id },
          });
        } else if (method === "POST" && p === "favorites") {
          const a = need(),
            companyId = z.string().parse(body.companyId);
          requireValue(
            await db.company.findUnique({ where: { id: companyId } }),
          );
          const f = await db.favorite.findUnique({
            where: { userId_companyId: { userId: a.id, companyId } },
          });
          if (f)
            await db.favorite.delete({
              where: { userId_companyId: { userId: a.id, companyId } },
            });
          else await db.favorite.create({ data: { userId: a.id, companyId } });
          result = { saved: !f };
        } else if (method === "POST" && p === "schedules") {
          const a = need();
          ensure(
            await market.premium(a.id),
            403,
            "Recurring schedules require an active Student Plus membership.",
          );
          const b = z
            .object({
              companyId: z.string(),
              day: z.number().int().min(0).max(6),
              frequency: z.enum(["weekly", "fortnightly"]),
            })
            .parse(body);
          requireValue(
            await db.company.findUnique({
              where: { id: b.companyId, status: "approved" },
            }),
          );
          result = await db.recurringSchedule.create({
            data: { ...b, userId: a.id },
          });
        } else if (method === "DELETE" && /^schedules\/[^/]+$/.test(p))
          result = await db.recurringSchedule.deleteMany({
            where: { id: p.split("/")[1], userId: need().id },
          });
        else if (method === "GET" && p === "subscriptions")
          result = await identity.subscriptions(need());
        else if (method === "POST" && /^subscriptions\/[^/]+\/cancel$/.test(p))
          result = await identity.cancelSubscription(need(), p.split("/")[1]);
        else if (method === "GET" && p === "notifications")
          result = await notifications.list(need().id, q);
        else if (method === "POST" && p === "notifications/read")
          result = await db.notification.updateMany({
            where: { userId: need().id, readAt: null },
            data: { readAt: new Date() },
          });
        else if (method === "GET" && p === "account/export") {
          const a = need();
          result = {
            profile: await identity.profile(a),
            orders: await market.orders(a, {}),
            subscriptions: await identity.subscriptions(a),
            tickets: await ops.tickets(a),
          };
          res.setHeader(
            "Content-Disposition",
            'attachment; filename="fresh-fold-account.json"',
          );
        } else if (method === "POST" && p === "account/delete") {
          const a = need();
          result = await ops.ticket(a, {
            name: a.name,
            subject: "Account deletion request",
            category: "privacy",
            body: "Please review my account for deletion and apply the documented retention policy. Financial history must be retained or pseudonymised as required.",
          });
        } else if (method === "GET" && p === "business")
          result = await ops.business(need(["owner", "staff"]));
        else if (method === "GET" && p === "business/overview")
          result = await ops.businessOverview(need(["owner", "staff"]));
        else if (method === "GET" && p === "business/customers")
          result = await ops.customers(need(["owner", "staff"]));
        else if (method === "PATCH" && p === "business")
          result = await ops.updateBusiness(
            need(["owner"]),
            companyUpdateSchema.parse(body),
          );
        else if (method === "GET" && p === "business/settlement-banks") {
          need(["owner", "admin"]);
          result = await admissions.banks();
        } else if (method === "POST" && p === "business/settlement-account") {
          result = await admissions.settlementRequest(
            need(["owner"]),
            z
              .object({
                bankCode: z.string().min(1).max(30),
                bankName: z.string().max(100).default(""),
                accountNumber: z.string().regex(/^\d{6,20}$/),
                accountName: z.string().trim().min(3).max(150),
              })
              .parse(body),
          );
        } else if (method === "POST" && p === "business/photo") {
          result = await files.photo(
            need(["owner", "staff"]),
            z
              .object({
                base64: z.string().max(7100000),
                name: z.string().max(200),
                kind: z.enum(["photo", "coverPhoto"]),
              })
              .parse(body),
          );
        } else if (method === "POST" && p === "business/publish") {
          result = await ops.publish(need(["owner"]));
          await jobs.fillSlots(await clock.now());
        } else if (method === "POST" && p === "business/services") {
          const b = z
            .object({
              id: z.string().optional(),
              name: z.string().min(3).max(100),
              category: z.enum(["wash-fold", "ironing", "bedding"]),
              description: z.string().min(10).max(1000),
              unit: z.enum(["item", "kg", "load", "package"]),
              price: z.number().int().min(100).max(1000000),
              active: z.boolean(),
              estimated: z.boolean().optional(),
            })
            .parse(body);
          result = await ops.service(need(), b);
        } else if (method === "POST" && p === "business/staff") {
          const b = z
            .object({
              name: z.string().min(2),
              email: z.email().transform((s) => s.toLowerCase()),
              password: z.string().min(12).max(128),
              permissions: z.array(z.string()),
            })
            .parse(body);
          result = await ops.staff(need(["owner"]), b);
        } else if (method === "PUT" && p === "business/hours") {
          const a = need();
          auth.company(a, a.companyId!, "profile.write");
          const hours = z
            .array(
              z.object({
                day: z.number().int().min(0).max(6),
                open: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
                close: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
              }),
            )
            .max(7)
            .parse(body.hours);
          ensure(
            new Set(hours.map((h) => h.day)).size === hours.length &&
              hours.every((h) => h.open < h.close),
            400,
            "Use unique days and an opening time before closing time.",
          );
          await db.$transaction(async (tx) => {
            await tx.operatingHour.deleteMany({
              where: { companyId: a.companyId },
            });
            await tx.operatingHour.createMany({
              data: hours.map((h) => ({ ...h, companyId: a.companyId! })),
            });
          });
          result = { updated: true };
          await jobs.fillSlots(await clock.now());
        } else if (method === "POST" && p === "business/closures") {
          const a = need();
          auth.company(a, a.companyId!, "profile.write");
          const b = z
            .object({ date: z.iso.date(), reason: z.string().min(3).max(200) })
            .parse(body);
          result = await db.closure.create({
            data: {
              companyId: a.companyId!,
              date: new Date(b.date),
              reason: b.reason,
            },
          });
        } else if (method === "POST" && p === "business/branches") {
          const a = need();
          auth.company(a, a.companyId!, "profile.write");
          const b = z
            .object({
              name: z.string().min(3).max(100),
              address: z.string().min(5).max(300),
            })
            .parse(body);
          const s = requireValue(
            await db.subscription.findFirst({
              where: {
                companyId: a.companyId,
                status: "active",
                endsAt: { gt: await clock.now() },
              },
              include: { plan: true },
            }),
          );
          ensure(
            (await db.branch.count({ where: { companyId: a.companyId } })) <
              s.plan.branches,
            409,
            "Your hosting plan has no remaining branch seats.",
          );
          result = await db.branch.create({
            data: { ...b, companyId: a.companyId! },
          });
        } else if (method === "POST" && /^reviews\/[^/]+\/response$/.test(p)) {
          const a = need();
          const r = requireValue(
            await db.review.findUnique({ where: { id: p.split("/")[1] } }),
          );
          auth.company(a, r.companyId, "profile.write");
          result = await db.review.update({
            where: { id: r.id },
            data: {
              response: z.string().min(5).max(2000).parse(body.response),
            },
          });
        } else if (method === "POST" && p === "contact") {
          limiter.check(`contact:${req.ip}`, 8);
          const b = z
            .object({
              name: z.string().min(2).max(100),
              subject: z.string().min(5).max(200),
              body: z.string().min(10).max(4000),
              category: z
                .enum([
                  "general",
                  "booking",
                  "payment",
                  "garment-care",
                  "privacy",
                  "business",
                ])
                .default("general"),
              orderId: z.string().optional(),
            })
            .parse(body);
          result = await ops.ticket(actor, b);
        } else if (method === "GET" && p === "tickets")
          result = await ops.tickets(need(), q);
        else if (method === "POST" && /^tickets\/[^/]+\/reply$/.test(p)) {
          const b = z
            .object({
              body: z.string().min(3).max(4000),
              status: z.enum(["open", "investigating", "resolved"]).optional(),
            })
            .parse(body);
          result = await ops.replyTicket(
            need(),
            p.split("/")[1],
            b.body,
            b.status,
          );
        } else if (method === "GET" && p === "content")
          result = await db.contentPage.findMany({
            select: { slug: true, title: true, updatedAt: true },
          });
        else if (method === "GET" && p.startsWith("content/"))
          result = requireValue(
            await db.contentPage.findUnique({
              where: { slug: decodeURIComponent(p.slice(8)) },
            }),
          );
        else if (method === "GET" && /^files\/[^/]+\/photo$/.test(p)) {
          const bytes = await files.publicPhoto(actor, p.split("/")[1]);
          return res.type("image/webp").send(bytes);
        } else if (method === "POST" && p === "files")
          result = await files.upload(
            need(),
            z
              .object({
                name: z.string().max(200),
                mime: z.string(),
                base64: z.string().max(7500000),
                companyId: z.string().optional(),
              })
              .parse(body),
          );
        else if (method === "GET" && /^files\/[^/]+\/link$/.test(p))
          result = await files.link(need(), p.split("/")[1]);
        else if (method === "GET" && /^files\/[^/]+\/download$/.test(p)) {
          const r = await files.download(
            need(),
            p.split("/")[1],
            q.expires || "",
            q.signature || "",
          );
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${r.file.name}"`,
          );
          return res.send(r.bytes);
        } else if (method === "GET" && p === "finance")
          result = await finance.report(need(), q);
        else if (method === "GET" && /^finance\/journals\/[^/]+$/.test(p))
          result = await finance.journal(need(), p.split("/")[2]);
        else if (method === "GET" && p === "finance/export") {
          const report = await finance.report(need(), q);
          const csv = (v: unknown) => {
            let s = String(v ?? "");
            if (/^[=+@-]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          };
          const rows = [
            [
              "Reference",
              "Stream",
              "Amount GHS",
              "Status",
              "Mode",
              "Data source",
              "Gateway costs GHS",
              "UTC date",
            ],
            ...report.payments.map((r) => [
              r.reference,
              r.kind,
              (r.amount / 100).toFixed(2),
              r.status,
              r.mode,
              r.source,
              (r.providerFees / 100).toFixed(2),
              r.createdAt.toISOString(),
            ]),
          ];
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader(
            "Content-Disposition",
            'attachment; filename="fresh-fold-transactions.csv"',
          );
          return res.send(rows.map((r) => r.map(csv).join(",")).join("\r\n"));
        } else if (method === "GET" && p === "admin/overview")
          result = await ops.overview(need(["admin", "support"]));
        else if (method === "GET" && p === "admin/companies") {
          need(["admin"]);
          result = await ops.companies();
        } else if (
          method === "POST" &&
          /^admin\/companies\/[^/]+\/status$/.test(p)
        ) {
          const b = z
            .object({
              status: z.string(),
              reason: z.string().min(10).max(1000),
            })
            .parse(body);
          result = await ops.application(
            need(["admin"]),
            p.split("/")[2],
            b.status,
            b.reason,
          );
          if (b.status === "approved") await jobs.fillSlots(await clock.now());
        } else if (method === "GET" && p === "admin/payments") {
          need(["admin"]);
          result = await admissions.paymentsList(q);
        } else if (method === "GET" && p === "admin/subscriptions") {
          need(["admin"]);
          result = await admissions.subscriptionsList(q);
        } else if (
          method === "POST" &&
          /^admin\/payments\/[^/]+\/(verify|review)$/.test(p)
        ) {
          const a = need(["admin"]),
            id = p.split("/")[2];
          result = p.endsWith("/verify")
            ? await admissions.verify(a, id)
            : await admissions.reviewPayment(
                a,
                id,
                z.string().trim().min(10).max(1000).parse(body.reason),
              );
        } else if (
          method === "POST" &&
          /^admin\/subscriptions\/[^/]+\/status$/.test(p)
        ) {
          const b = z
            .object({
              action: z.enum(["approve", "suspend", "restore"]),
              reason: z.string().trim().min(10).max(1000),
            })
            .parse(body);
          result = await admissions.subscription(
            need(["admin"]),
            p.split("/")[2],
            b.action,
            b.reason,
          );
        } else if (
          method === "POST" &&
          /^admin\/companies\/[^/]+\/settlement-account$/.test(p)
        ) {
          result = await admissions.approveSettlement(
            need(["admin"]),
            p.split("/")[2],
            z
              .object({
                code: z
                  .string()
                  .regex(/^ACCT_[a-zA-Z0-9]+$/)
                  .optional(),
                reason: z.string().trim().min(10).max(1000),
              })
              .parse(body),
          );
        } else if (
          method === "POST" &&
          /^admin\/companies\/[^/]+\/publish$/.test(p)
        ) {
          const a = need(["admin"]),
            id = p.split("/")[2];
          const publish = z.boolean().parse(body.published);
          if (publish) {
            result = await ops.publish({
              ...a,
              companyId: id,
              permissions: ["profile.write"],
            });
            await jobs.fillSlots(await clock.now());
          } else {
            await db.company.update({
              where: { id },
              data: { published: false },
            });
            await audit(db, a.id, "company.unpublished", id);
            result = { published: false };
          }
        } else if (method === "POST" && /^admin\/files\/[^/]+\/scan$/.test(p)) {
          need(["admin"]);
          await files.scan(p.split("/")[2]);
          result = { scanned: true };
        } else if (
          method === "POST" &&
          /^admin\/users\/[^/]+\/recovery$/.test(p)
        ) {
          result = await identity.recoveryLink(
            need(["admin"]),
            p.split("/")[2],
            z.string().trim().min(10).max(1000).parse(body.reason),
          );
        } else if (method === "GET" && p === "admin/users") {
          need(["admin"]);
          result = await db.user.findMany({
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              deletedAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          });
        } else if (method === "GET" && p === "admin/settings") {
          need(["admin"]);
          result = {
            rules: await feeRules(db),
            plans: await db.plan.findMany(),
            setup: ops.setup(),
          };
        } else if (method === "PATCH" && p === "admin/rules")
          result = await ops.rules(need(["admin"]), body);
        else if (method === "PATCH" && /^admin\/plans\/[^/]+$/.test(p)) {
          const a = need(["admin"]);
          const b = z
            .object({
              price: z.number().int().min(100).max(1000000),
              active: z.boolean(),
              staffSeats: z.number().int().min(1).max(100),
              branches: z.number().int().min(1).max(50),
            })
            .parse(body);
          result = await db.plan.update({
            where: { id: p.split("/")[2] },
            data: b,
          });
          await audit(
            db,
            a.id,
            "plan.updated",
            p.split("/")[2],
            "Future subscription purchases use the updated price and limits.",
          );
        } else if (method === "POST" && p === "admin/refunds") {
          const b = z
            .object({
              orderId: z.string(),
              full: z.boolean().optional(),
              amount: z.number().int().positive().optional(),
              reason: z.string().min(10).max(1000),
              idempotencyKey: z.string().min(8).max(100),
              outcome: z.enum(["success", "failed", "pending"]).optional(),
            })
            .parse(body);
          result = await payments.refund(need(["admin"]), b);
        } else if (method === "GET" && p === "admin/refund-options") {
          result = await payments.refundOptions(need(["admin"]), q.orderId);
        } else if (
          method === "POST" &&
          /^admin\/refunds\/[^/]+\/(check|retry)$/.test(p)
        ) {
          result = await payments.manageRefund(
            need(["admin"]),
            p.split("/")[2],
            p.endsWith("/retry"),
          );
        } else if (method === "GET" && p === "admin/refunds") {
          need(["admin"]);
          result = await db.refund.findMany({
            where: { payment: { mode: config.mode } },
            include: { order: { select: { reference: true } } },
            orderBy: { createdAt: "desc" },
          });
        } else if (method === "POST" && p === "admin/settlements") {
          const b = z
            .object({
              companyId: z.string(),
              amount: z.number().int().positive(),
              outcome: z.enum(["success", "failed"]),
            })
            .parse(body);
          result = await finance.settlement(
            need(["admin"]),
            b.companyId,
            b.amount,
            b.outcome,
          );
        } else if (method === "GET" && p === "admin/audit") {
          need(["admin"]);
          result = await db.auditEvent.findMany({
            orderBy: { createdAt: "desc" },
            take: 200,
          });
        } else if (method === "GET" && p === "admin/jobs") {
          need(["admin"]);
          result = await db.job.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
          });
        } else if (method === "POST" && p === "admin/jobs/run") {
          need(["admin"]);
          result = await jobs.tick();
        } else if (method === "POST" && p === "admin/jobs/reconcile") {
          need(["admin"]);
          await jobs.reconcile();
          result = await jobs.tick();
        } else if (method === "PUT" && p.startsWith("admin/content/")) {
          const a = need(["admin"]);
          const b = z
            .object({
              title: z.string().min(5).max(200),
              body: z.string().min(20).max(20000),
            })
            .parse(body);
          const slug = decodeURIComponent(p.slice(14));
          result = await db.contentPage.upsert({
            where: { slug },
            create: { slug, ...b },
            update: b,
          });
          await audit(db, a.id, "content.updated", slug);
        } else if (method === "GET" && p === "demo/accounts") {
          demo();
          result = await db.user.findMany({
            where: { demoScenario: { not: null }, deletedAt: null },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              demoScenario: true,
              memberships: {
                select: {
                  companyId: true,
                  role: true,
                  company: { select: { name: true } },
                },
              },
            },
            orderBy: { role: "asc" },
          });
        } else if (method === "POST" && p === "demo/login") {
          demo();
          limiter.check(`demo-login:${req.ip}`, 60);
          const user = requireValue(
            await db.user.findUnique({
              where: { id: z.string().parse(body.userId) },
            }),
          );
          ensure(
            user.demoScenario && !user.deletedAt,
            403,
            "One-click entry is restricted to demo accounts.",
          );
          await auth.session(user.id, res, actor);
          await audit(db, user.id, "demo.role_entry", user.id);
          result = { signedIn: true, role: user.role };
        } else if (method === "GET" && p === "demo/status") {
          demo();
          need(["admin"]);
          result = {
            now: await clock.now(),
            runId: await clock.runId(),
            setup: ops.setup(),
            renewalOutcome:
              (
                await db.setting.findUnique({
                  where: { key: "demo.renewal_outcome" },
                })
              )?.value || "success",
          };
        } else if (method === "POST" && p === "demo/start-run") {
          demo();
          need(["admin"]);
          result = { runId: await clock.startRun() };
        } else if (method === "POST" && p === "demo/clock") {
          demo();
          result = await jobs.advance(
            need(["admin"]),
            z.number().int().positive().parse(body.minutes),
          );
        } else if (method === "POST" && p === "demo/renewal") {
          demo();
          need(["admin"]);
          ensure(
            config.mode === "simulator",
            404,
            "This setting only applies to the simulator.",
          );
          const value = z.enum(["success", "failed"]).parse(body.outcome);
          result = await db.setting.upsert({
            where: { key: "demo.renewal_outcome" },
            create: { key: "demo.renewal_outcome", value },
            update: { value },
          });
        } else if (method === "GET" && p === "setup") {
          need(["admin"]);
          result = ops.setup();
        } else throw new AppError(404, "That resource was not found.");
        return res.json(result);
      } catch (e) {
        if (e instanceof z.ZodError)
          return res.status(400).json({
            message: e.issues
              .map((i) => `${i.path.join(".") || "Form"}: ${i.message}`)
              .join(" "),
            issues: e.issues,
          });
        if (e instanceof AppError)
          return res
            .status(e.status)
            .json({ message: e.message, details: e.details });
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          if (e.code === "P2002")
            return res.status(409).json({
              message: "This record already exists. Refresh and try again.",
            });
          if (e.code === "P2003")
            return res
              .status(400)
              .json({ message: "A related record is missing or invalid." });
          if (e.code === "P2025")
            return res
              .status(404)
              .json({ message: "That record could not be found." });
        }
        console.error(
          JSON.stringify({
            event: "api_error",
            path: req.path,
            error: e instanceof Error ? e.name : "Unknown",
            code:
              e instanceof Prisma.PrismaClientKnownRequestError
                ? e.code
                : undefined,
          }),
        );
        return res.status(500).json({
          message:
            "We could not complete that request. Your existing records are safe; please try again.",
        });
      }
    },
  };
  return app;
}
export type Application = ReturnType<typeof createApplication>;
