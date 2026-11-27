import cookieParser from "cookie-parser";
import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createApplication,
  type Application,
} from "../apps/api/src/application";
import { AppError, loadConfig } from "../apps/api/src/config";
import { openDatabase } from "../apps/api/src/database";
import {
  hash,
  hashPassword,
  hmac,
  verifyPassword,
  verifyPaystackSignature,
  type Actor,
} from "../apps/api/src/security";

import type { BookingInput } from "../apps/api/src/marketplace";
let database: Awaited<ReturnType<typeof openDatabase>>,
  app: Application,
  server: Server,
  origin: string;
const config = loadConfig({
  env: "test",
  mode: "simulator",
  databaseDir: "memory://",
  dataRoot: ".data/test",
  appUrl: "http://localhost:5173",
});
async function actor(id: string): Promise<Actor> {
  const u = await app.db.user.findUniqueOrThrow({
    where: { id },
    include: { memberships: true },
  });
  const m = u.memberships[0];
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    verifiedAt: u.verifiedAt,
    companyId: m?.companyId,
    permissions:
      m?.role === "owner"
        ? [
            "orders.read",
            "orders.write",
            "finance.read",
            "profile.write",
            "catalogue.write",
            "subscription.write",
            "promotions.write",
            "staff.write",
            "files.read",
          ]
        : m?.permissions || [],
    csrf: "test",
    sessionId: "test",
  };
}
async function input(
  overrides: Partial<BookingInput> = {},
): Promise<BookingInput> {
  const slot = (await app.market.slots("campus-linen")).find(
    (s) => s.available > 0,
  )!;
  return {
    companyId: "campus-linen",
    items: [{ serviceId: "campus-linen-wash", quantity: 4 }],
    slotId: slot.id,
    method: "pickup",
    address: {
      areaId: "amamoma",
      detail: "DEMO · integration test collection address",
    },
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  };
}
async function paidOrder(user = "student-free") {
  const a = await actor(user);
  const order = await app.market.book(a, await input());
  const p = await app.payments.checkout(a, {
    kind: "order",
    orderId: order.id,
    idempotencyKey: crypto.randomUUID(),
  });
  await app.payments.simulate(a, p.id, "success");
  return { a, order, p };
}
beforeAll(async () => {
  database = await openDatabase(config, true);
  app = createApplication(database.db, config);
  await app.initialize();
  const http = express();
  http.use(cookieParser());
  http.use(
    express.json({
      limit: "8mb",
      verify: (r, _s, b) => {
        (r as any).rawBody = b;
      },
    }),
  );
  http.all("/api/{*path}", (r, s) => app.handle(r, s));
  server = http.listen(0, "127.0.0.1");
  // Fixture writes can block past Node's five-second HTTP idle timeout.
  server.keepAliveTimeout = 60000;
  await new Promise<void>((r) => server.once("listening", r));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await database.close();
});
describe("identity, sessions, and private records", () => {
  it("hashes passwords with scrypt and rejects wrong values", async () => {
    const h = await hashPassword("a unique passphrase for test");
    expect(h).not.toContain("a unique passphrase");
    expect(await verifyPassword("a unique passphrase for test", h)).toBe(true);
    expect(await verifyPassword("wrong password", h)).toBe(false);
  });
  it("registers with immediate account access and no email side effects while enforcing CSRF", async () => {
    const mailCount = await app.db.capturedEmail.count();
    const tokenCount = await app.db.authToken.count();
    const response = await fetch(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Integration Student",
        email: "integration.student@freshfold.test",
        password: "Integration.Password!2026",
        type: "student",
        companyName: "",
        areaId: "",
      }),
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    const me = (await fetch(`${origin}/api/auth/me`, {
      headers: { Cookie: cookie },
    }).then((r) => r.json())) as any;
    expect(me.user).not.toHaveProperty("verified");
    expect(me.user.role).toBe("student");
    const denied = await fetch(`${origin}/api/addresses`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({
      details: { code: "CSRF_TOKEN_INVALID" },
    });
    const booking = await fetch(`${origin}/api/bookings`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": me.user.csrf,
      },
      body: JSON.stringify(await input()),
    });
    expect(booking.status).toBe(200);
    const order = (await booking.json()) as { id: string };
    const checkout = await fetch(`${origin}/api/payments/checkout`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": me.user.csrf,
      },
      body: JSON.stringify({
        kind: "order",
        orderId: order.id,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    expect(checkout.status).toBe(200);
    expect(await app.db.capturedEmail.count()).toBe(mailCount);
    expect(await app.db.authToken.count()).toBe(tokenCount);
    expect(await app.db.job.count({ where: { kind: "email" } })).toBe(0);
  });
  it("does not allow a forged role during registration", async () => {
    const r = await fetch(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Role Test",
        email: "role.test@freshfold.test",
        password: "Integration.Password!2026",
        type: "student",
        role: "admin",
      }),
    });
    expect(r.status).toBe(200);
    expect(
      (
        await app.db.user.findUniqueOrThrow({
          where: { email: "role.test@freshfold.test" },
        })
      ).role,
    ).toBe("student");
  });
  it("keeps company orders and financial journals inside organisation boundaries", async () => {
    const coast = await actor("owner-coastline");
    await expect(
      app.market.order(coast, "history-campus-linen"),
    ).rejects.toMatchObject({ status: 403 });
    const journal = await app.db.journal.findFirstOrThrow({
      where: { companyId: "campus-linen" },
    });
    await expect(app.finance.journal(coast, journal.id)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("denies financial reporting and profile editing to restricted staff", async () => {
    const staff = await actor("company-staff");
    await expect(app.finance.report(staff, {})).rejects.toMatchObject({
      status: 403,
    });
    expect(() =>
      app.auth.company(staff, "campus-linen", "profile.write"),
    ).toThrow(AppError);
  });
  it("rejects private document access outside the owning company", async () => {
    await expect(
      app.files.link(await actor("student-free"), "document-campus-linen"),
    ).rejects.toMatchObject({ status: 403 });
    const link = await app.files.link(
      await actor("owner-campus-linen"),
      "document-campus-linen",
    );
    expect(link.url).toContain("signature=");
    const parsed = new URL(link.url, origin);
    const result = await app.files.download(
      await actor("owner-campus-linen"),
      "document-campus-linen",
      parsed.searchParams.get("expires")!,
      parsed.searchParams.get("signature")!,
    );
    expect(result.bytes.toString()).toContain("DEMONSTRATION");
    await expect(
      app.files.download(
        await actor("owner-campus-linen"),
        "document-campus-linen",
        "0",
        parsed.searchParams.get("signature")!,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("retires email endpoints, invalidates old tokens, and cancels mail jobs", async () => {
    const a = await actor("student-expired");
    const raw = crypto.randomUUID();
    const old = await app.db.authToken.create({
      data: {
        hash: hash(raw),
        userId: a.id,
        kind: "recover",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const job = await app.db.job.create({
      data: {
        key: "retired-email-job",
        kind: "email",
        payload: { emailId: "retired-message" },
        dueAt: new Date(0),
      },
    });
    await app.initialize();
    expect(
      (await app.db.authToken.findUniqueOrThrow({ where: { id: old.id } }))
        .usedAt,
    ).not.toBeNull();
    expect(
      (await app.db.job.findUniqueOrThrow({ where: { id: job.id } })).status,
    ).toBe("cancelled");
    for (const path of [
      "auth/verify",
      "auth/reset",
      "auth/recover",
      "auth/resend",
      "admin/email",
      "admin/email/test",
    ]) {
      const response = await fetch(`${origin}/api/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Connection: "close",
        },
        body: JSON.stringify({
          token: raw,
          password: "Must.Not.Change!2026",
          email: a.email,
        }),
      });
      const result = await response.json();
      expect(response.status, `${path}: ${JSON.stringify(result)}`).toBe(404);
    }
  });
});
describe("discovery, booking, and server-calculated prices", () => {
  it("publishes only approved companies with active hosting", async () => {
    const list = await app.market.companies({});
    expect(list.companies.map((c) => c.id).sort()).toEqual([
      "campus-linen",
      "cape-fresh",
      "coastline",
      "hallside",
    ]);
    await expect(app.market.company("studybreak")).rejects.toMatchObject({
      status: 404,
    });
    await expect(app.market.company("fold-finish")).rejects.toMatchObject({
      status: 404,
    });
  });
  it("calculates the GHS 103 baseline and applies genuine active Plus entitlements", async () => {
    const q = await app.market.quote(
      await actor("student-free"),
      await input(),
    );
    expect(q).toMatchObject({
      subtotal: 10000,
      convenienceFee: 300,
      deliveryFee: 0,
      total: 10300,
    });
    const plus = await app.market.quote(
      await actor("student-plus"),
      await input(),
    );
    expect(plus.total).toBe(10000);
    expect(plus.premium).toBe(true);
  });
  it("enforces coverage and allows existing accounts without email verification", async () => {
    const a = await actor("student-free");
    await expect(
      app.market.book(
        a,
        await input({
          address: {
            areaId: "not-an-area",
            detail: "invalid service coverage address",
          },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    const order = await app.market.book(
      { ...a, verifiedAt: null },
      await input(),
    );
    expect(
      (await app.db.order.findUniqueOrThrow({ where: { id: order.id } }))
        .userId,
    ).toBe(a.id);
  });
  it("reserves the last slot atomically under concurrent booking requests", async () => {
    const slot = (await app.market.slots("hallside")).find(
      (s) => s.available > 0,
    )!;
    await app.db.slot.update({
      where: { id: slot.id },
      data: { capacity: 1, reserved: 0 },
    });
    const a = await actor("student-free");
    const b = await input({
      companyId: "hallside",
      slotId: slot.id,
      method: "dropoff",
      items: [{ serviceId: "hallside-wash", quantity: 1 }],
    });
    const results = await Promise.allSettled([
      app.market.book(a, b),
      app.market.book(a, { ...b, idempotencyKey: crypto.randomUUID() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await app.db.slot.findUniqueOrThrow({ where: { id: slot.id } }))
        .reserved,
    ).toBe(1);
  });
  it("returns an existing booking for the same idempotency key", async () => {
    const a = await actor("student-free");
    const b = await input();
    const o1 = await app.market.book(a, b);
    const o2 = await app.market.book(a, b);
    expect(o1.id).toBe(o2.id);
  });
  it("requires company acceptance before requesting payment on a manual quote", async () => {
    const a = await actor("student-free");
    const s = (await app.market.slots("coastline")).find(
      (s) => s.available > 0,
    )!;
    const order = await app.market.book(
      a,
      await input({
        companyId: "coastline",
        slotId: s.id,
        items: [{ serviceId: "coastline-wash", quantity: 1 }],
      }),
    );
    expect(order.status).toBe("requested");
    await expect(
      app.payments.checkout(a, {
        kind: "order",
        orderId: order.id,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects forged amounts, currencies, signatures, and illegal fulfilment transitions", async () => {
    const a = await actor("student-free");
    const o = await app.market.book(a, await input());
    const p = await app.payments.checkout(a, {
      kind: "order",
      orderId: o.id,
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      app.payments.applySuccess(p.id, 1, "GHS", 0, "forged"),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      app.payments.applySuccess(p.id, p.amount, "NGN", 0, "forged"),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      app.payments.simulatorEvent("{}", "forged"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      app.market.transition(
        await actor("owner-campus-linen"),
        o.id,
        "completed",
        "Invalid skip",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});
describe("payment verification, accounting, and financial lifecycle", () => {
  it("uses one pending checkout when the same membership is submitted concurrently", async () => {
    const a = await actor("student-history");
    const purchases = await Promise.all([
      app.payments.checkout(a, {
        kind: "student",
        planId: "student-plus",
        idempotencyKey: crypto.randomUUID(),
      }),
      app.payments.checkout(a, {
        kind: "student",
        planId: "student-plus",
        idempotencyKey: crypto.randomUUID(),
      }),
    ]);
    expect(purchases[0].id).toBe(purchases[1].id);
    expect(
      await app.db.payment.count({
        where: { userId: a.id, kind: "student", status: "pending" },
      }),
    ).toBe(1);
  });
  it("authenticates Paystack's documented signature even with a separate internal signing secret", () => {
    const cfg = {
      ...config,
      webhookSecret: "whsec_public-unit-test-value",
      paystackSecret: "sk_test_public-unit-test-value",
    };
    const raw = '{"event":"charge.success", "data": {"amount": 10300}}';
    const t = String(Math.floor(Date.now() / 1000));
    const header = `t=${t},v1=whk_unit:${hmac(cfg.webhookSecret, `${t}.${raw}`)}`;
    expect(verifyPaystackSignature(raw, header, undefined, cfg)).toBe(true);
    expect(
      verifyPaystackSignature(
        raw.replace("10300", "1"),
        header,
        undefined,
        cfg,
      ),
    ).toBe(false);
    expect(
      verifyPaystackSignature(raw, header, undefined, cfg, Date.now() + 301000),
    ).toBe(false);
    expect(
      verifyPaystackSignature(
        raw,
        undefined,
        hmac(cfg.paystackSecret, raw),
        cfg,
      ),
    ).toBe(true);
    expect(verifyPaystackSignature(raw + " ", undefined, hmac(cfg.paystackSecret, raw), cfg)).toBe(false);
  });
  it("does not post a declined payment, and posts duplicate successes only once", async () => {
    const a = await actor("student-free");
    const o = await app.market.book(a, await input());
    const p = await app.payments.checkout(a, {
      kind: "order",
      orderId: o.id,
      idempotencyKey: crypto.randomUUID(),
    });
    await app.payments.simulate(a, p.id, "declined");
    expect(await app.db.journal.count({ where: { paymentId: p.id } })).toBe(0);
    await app.payments.simulate(a, p.id, "duplicate");
    await app.payments.simulate(a, p.id, "success");
    expect(
      await app.db.journal.count({ where: { key: `collection-${p.id}` } }),
    ).toBe(1);
  });
  it("produces the complete GHS 328 baseline from actual source records", async () => {
    await app.clock.startRun();
    const { a, order } = await paidOrder();
    const owner = await actor("owner-campus-linen");
    for (const s of ["collected", "processing", "ready", "out_for_delivery"])
      await app.market.transition(
        owner,
        order.id,
        s,
        "Integration fulfilment step",
      );
    const detail = await app.market.order(a, order.id);
    const code = detail.handoverNotice!.match(/\d{6}/)![0];
    await app.market.transition(
      owner,
      order.id,
      "delivered",
      "Customer received garments.",
      code,
    );
    await app.market.transition(
      a,
      order.id,
      "completed",
      "Customer confirms receipt.",
    );
    for (const [user, kind, planId, companyId] of [
      ["student-upgrade", "student", "student-plus", undefined],
      ["owner-fold-finish", "hosting", "growth", "fold-finish"],
      ["owner-campus-linen", "sponsored", undefined, "campus-linen"],
    ]) {
      const ac = await actor(user!);
      const p = await app.payments.checkout(ac, {
        kind: kind!,
        planId,
        companyId,
        idempotencyKey: crypto.randomUUID(),
      });
      await app.payments.simulate(ac, p.id, "success");
    }
    const r = await app.finance.report(await actor("demo-admin"), {
      run: "fresh",
    });
    expect(r.collected).toBe(32800);
    expect(r.companyPayable).toBe(8800);
    expect(r.grossAllocations).toBe(24000);
    expect(r.earned).toBe(1500);
    expect(r.deferred).toBe(22500);
    expect(r.streams).toEqual({
      order: 10300,
      student: 2500,
      hosting: 15000,
      sponsored: 5000,
    });
    expect(
      r.journals.every(
        (j) => j.lines.reduce((n, l) => n + l.debit - l.credit, 0) === 0,
      ),
    ).toBe(true);
  });
  it("reverses GHS 88 company allocation, GHS 12 commission and GHS 3 convenience on a full refund", async () => {
    const { order } = await paidOrder();
    const r = await app.payments.refund(await actor("demo-admin"), {
      orderId: order.id,
      full: true,
      reason: "Full refund integration verification.",
      idempotencyKey: crypto.randomUUID(),
      outcome: "success",
    });
    expect(r).toMatchObject({
      amount: 10300,
      companyReversal: 8800,
      commissionReversal: 1200,
      convenienceReversal: 300,
      status: "processed",
    });
    expect(
      (await app.db.order.findUniqueOrThrow({ where: { id: order.id } }))
        .paymentStatus,
    ).toBe("refunded");
  });
  it("reverses GHS 44 company allocation and GHS 6 commission on a GHS 50 partial laundry refund", async () => {
    const { order } = await paidOrder();
    const r = await app.payments.refund(await actor("demo-admin"), {
      orderId: order.id,
      amount: 5000,
      reason: "Partial refund integration verification.",
      idempotencyKey: crypto.randomUUID(),
      outcome: "success",
    });
    expect(r).toMatchObject({
      amount: 5000,
      companyReversal: 4400,
      commissionReversal: 600,
      convenienceReversal: 0,
      status: "processed",
    });
  });
  it("does not count pending or failed refunds as processed or allow over-refunding", async () => {
    const { order, p } = await paidOrder();
    const a = await actor("demo-admin");
    const failed = await app.payments.refund(a, {
      orderId: order.id,
      amount: 5000,
      reason: "Simulate a failed refund response.",
      idempotencyKey: crypto.randomUUID(),
      outcome: "failed",
    });
    expect(failed.status).toBe("failed");
    const pending = await app.payments.refund(a, {
      orderId: order.id,
      full: true,
      reason: "Simulate a pending refund response.",
      idempotencyKey: crypto.randomUUID(),
      outcome: "pending",
    });
    expect(pending.status).toBe("pending");
    expect(
      await app.db.journal.count({ where: { key: `refund-${pending.id}` } }),
    ).toBe(0);
    await expect(
      app.payments.refund(a, {
        orderId: order.id,
        amount: 1,
        reason: "Prevent reserved refund overpayment.",
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await app.db.payment.findUniqueOrThrow({ where: { id: p.id } })).status,
    ).toBe("success");
  });
  it("routes a success after reservation expiry into a genuine pending-refund workflow", async () => {
    const a = await actor("student-free");
    const order = await app.market.book(a, await input());
    const p = await app.payments.checkout(a, {
      kind: "order",
      orderId: order.id,
      idempotencyKey: crypto.randomUUID(),
    });
    await app.payments.simulate(a, p.id, "late_success");
    expect(
      (await app.db.order.findUniqueOrThrow({ where: { id: order.id } }))
        .paymentStatus,
    ).toBe("refund_required");
    expect(
      await app.db.refund.findFirst({
        where: { paymentId: p.id, status: "pending" },
      }),
    ).toBeTruthy();
  });
  it("preserves snapshot prices when commission settings change", async () => {
    const a = await actor("student-free");
    const o = await app.market.book(a, await input());
    await app.ops.rules(await actor("demo-admin"), {
      commissionBps: 1500,
      convenienceFee: 500,
      sponsoredPrice: 5000,
      sponsoredDays: 7,
      gatewayBps: 0,
      partialRefundConvenience: false,
    });
    const unchanged = await app.db.order.findUniqueOrThrow({
      where: { id: o.id },
    });
    expect(unchanged.total).toBe(10300);
    expect(unchanged.commission).toBe(1200);
    const fresh = await app.market.quote(a, await input());
    expect(fresh.convenienceFee).toBe(500);
    await app.ops.rules(await actor("demo-admin"), {
      commissionBps: 1200,
      convenienceFee: 300,
      sponsoredPrice: 5000,
      sponsoredDays: 7,
      gatewayBps: 0,
      partialRefundConvenience: false,
    });
  });
  it("enforces immutable ledger records at the database level", async () => {
    const line = await app.db.ledgerLine.findFirstOrThrow();
    await expect(
      app.db.ledgerLine.update({ where: { id: line.id }, data: { credit: 1 } }),
    ).rejects.toThrow();
  });
  it("allows one review per customer completed order and prevents unrelated reviews", async () => {
    const { a, order } = await paidOrder();
    await expect(
      app.market.review(a, order.id, 5, "Review before completion must fail."),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      app.market.review(
        await actor("student-free"),
        "history-coastline",
        5,
        "Unrelated order review must fail.",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  describe("reusable test accounts", () => {
    const password = "Repeat.Account.Test!2026";
    async function registerTestAccount(email: string, type = "student") {
      const response = await fetch(`${origin}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Repeat Account Tester",
          email,
          password,
          type,
          ...(type === "company"
            ? { companyName: "Repeat Cape Laundry", areaId: "amamoma" }
            : {}),
        }),
      });
      const result = (await response.json()) as { id: string };
      expect(response.status, JSON.stringify(result)).toBe(200);
      const cookie = response.headers.get("set-cookie")!.split(";")[0];
      const me = (await fetch(`${origin}/api/auth/me`, {
        headers: { Cookie: cookie },
      }).then((r) => r.json())) as any;
      expect(me.user.canResetTestAccount).toBe(true);
      return { id: result.id, cookie, csrf: me.user.csrf as string };
    }
    async function resetAccount(
      session: { cookie: string; csrf: string },
      suppliedPassword = password,
      extra = {},
    ) {
      const response = await fetch(`${origin}/api/account/reset-test`, {
        method: "POST",
        headers: {
          Cookie: session.cookie,
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrf,
        },
        body: JSON.stringify({ password: suppliedPassword, ...extra }),
      });
      const result = await response.json();
      return { response, result };
    }
    it("releases the email, revokes every session, and starts a new registration without old data or entitlements", async () => {
      const email = "repeat.student@freshfold.test";
      const first = await registerTestAccount(email);
      const customer = await actor(first.id);
      const order = await app.market.book(customer, await input());
      const slotBefore = await app.db.slot.findUniqueOrThrow({
        where: { id: order.slotId! },
      });
      const pending = await app.payments.checkout(customer, {
        kind: "order",
        orderId: order.id,
        idempotencyKey: crypto.randomUUID(),
      });
      const membership = await app.payments.checkout(customer, {
        kind: "student",
        planId: "student-plus",
        idempotencyKey: crypto.randomUUID(),
      });
      await app.payments.simulate(customer, membership.id, "success");
      expect(await app.market.premium(first.id)).toBe(true);
      await app.db.address.create({
        data: {
          userId: first.id,
          label: "Test hostel",
          detail: "Repeat account collection address",
          areaId: "amamoma",
        },
      });
      await app.db.favorite.create({
        data: { userId: first.id, companyId: "campus-linen" },
      });
      await app.db.recurringSchedule.create({
        data: {
          userId: first.id,
          companyId: "campus-linen",
          day: 1,
          frequency: "weekly",
        },
      });
      const login = await fetch(`${origin}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      await login.json();
      const otherCookie = login.headers.get("set-cookie")!.split(";")[0];
      expect(await app.db.session.count({ where: { userId: first.id } })).toBe(
        2,
      );
      const journals = await app.db.journal.count();

      expect(
        (await resetAccount({ ...first, csrf: "invalid" })).response.status,
      ).toBe(403);
      expect(
        (await resetAccount(first, "incorrect-password")).response.status,
      ).toBe(401);
      expect(await app.db.user.findUnique({ where: { email } })).not.toBeNull();
      const reset = await resetAccount(first, password, {
        userId: "student-free",
      });
      expect(reset.response.status, JSON.stringify(reset.result)).toBe(200);
      expect(reset.response.headers.get("set-cookie")).toContain(
        "ff_session=;",
      );
      expect(await app.db.session.count({ where: { userId: first.id } })).toBe(
        0,
      );
      const retired = await app.db.user.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(retired.deletedAt).not.toBeNull();
      expect(retired.email).not.toBe(email);
      expect(retired.demoScenario).toBeNull();
      expect(
        (await app.db.user.findUniqueOrThrow({ where: { id: "student-free" } }))
          .deletedAt,
      ).toBeNull();
      expect(
        (await app.db.slot.findUniqueOrThrow({ where: { id: order.slotId! } }))
          .reserved,
      ).toBe(slotBefore.reserved - 1);
      expect(
        (await app.db.order.findUniqueOrThrow({ where: { id: order.id } }))
          .status,
      ).toBe("cancelled");
      expect(
        (await app.db.payment.findUniqueOrThrow({ where: { id: pending.id } }))
          .status,
      ).toBe("cancelled");
      expect(
        (
          await app.db.payment.findUniqueOrThrow({
            where: { id: membership.id },
          })
        ).status,
      ).toBe("success");
      expect(await app.db.journal.count()).toBe(journals);
      expect(
        (
          await app.db.subscription.findFirstOrThrow({
            where: { userId: first.id },
          })
        ).cancelAtEnd,
      ).toBe(true);
      for (const cookie of [first.cookie, otherCookie]) {
        const me = await fetch(`${origin}/api/auth/me`, {
          headers: { Cookie: cookie },
        }).then((r) => r.json());
        expect(me).toMatchObject({ user: null });
      }
      const second = await registerTestAccount(email);
      expect(second.id).not.toBe(first.id);
      expect(await app.market.premium(second.id)).toBe(false);
      const profile = await app.identity.profile(await actor(second.id));
      expect(profile.addresses).toEqual([]);
      expect(profile.favorites).toEqual([]);
      expect(profile.schedules).toEqual([]);
      expect(await app.market.orders(await actor(second.id), {})).toEqual([]);
      expect((await resetAccount(second)).response.status).toBe(200);
      const third = await registerTestAccount(email);
      expect(third.id).not.toBe(second.id);
    });
    it("unpublishes the old test business and allows the same business details in the next run", async () => {
      const email = "repeat.owner@freshfold.test";
      const first = await registerTestAccount(email, "company");
      const owner = await actor(first.id);
      const companyId = owner.companyId!;
      await app.db.company.update({
        where: { id: companyId },
        data: { published: true, status: "approved" },
      });
      expect((await resetAccount(first)).response.status).toBe(200);
      const company = await app.db.company.findUniqueOrThrow({
        where: { id: companyId },
      });
      expect(company.published).toBe(false);
      expect(company.status).toBe("suspended");
      const second = await registerTestAccount(email, "company");
      const newOwner = await actor(second.id);
      expect(newOwner.companyId).not.toBe(companyId);
      expect(
        (
          await app.db.company.findUniqueOrThrow({
            where: { id: newOwner.companyId },
          })
        ).name,
      ).toBe(company.name);
      const accounts = (await fetch(`${origin}/api/demo/accounts`).then((r) =>
        r.json(),
      )) as Array<{ id: string }>;
      expect(accounts.some((account) => account.id === first.id)).toBe(false);
      const login = await fetch(`${origin}/api/demo/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: first.id }),
      });
      await login.json();
      expect(login.status).toBe(403);
    });
    it("protects shared sample identities and disables resets outside simulator testing", async () => {
      const fixture = await actor("student-free");
      await expect(
        app.identity.resetTestAccount(fixture, password, {} as any),
      ).rejects.toMatchObject({ status: 403 });
      for (const variant of [
        { env: "production", mode: "paystack_live" },
        { env: "staging", mode: "simulator" },
        { env: "test", mode: "paystack_test" },
      ] as const) {
        const other = createApplication(app.db, { ...config, ...variant });
        await expect(
          other.identity.resetTestAccount(fixture, password, {} as any),
        ).rejects.toMatchObject({ status: 404 });
      }
      const response = await fetch(`${origin}/api/account/reset-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      await response.json();
      expect(response.status).toBe(401);
    });
  });
  it("keeps cancelled Plus access until expiry, then enforces expiry and recognises service-period revenue", async () => {
    const a = await actor("student-cancelled");
    expect(await app.market.premium(a.id)).toBe(true);
    const admin = await actor("demo-admin");
    await app.jobs.advance(admin, 31 * 24 * 60);
    expect(await app.market.premium(a.id)).toBe(false);
    expect(
      (
        await app.db.subscription.findUniqueOrThrow({
          where: { id: "plus-cancelled" },
        })
      ).status,
    ).toBe("expired");
    const r = await app.finance.report(admin, { run: "fresh" });
    expect(r.deferred).toBeGreaterThanOrEqual(0);
    expect(await app.db.campaign.count({ where: { status: "active" } })).toBe(
      0,
    );
    expect((await app.market.companies({})).companies.length).toBe(0);
  });
  it("rejects live credentials in a demo deployment and simulator mode in production", () => {
    expect(() =>
      loadConfig({
        env: "demo",
        mode: "simulator",
        paystackSecret: "sk_live_public-unit-test-fixture",
      }),
    ).toThrow("forbidden");
    expect(() => loadConfig({ env: "production", mode: "simulator" })).toThrow(
      "Production requires",
    );
  });
});
