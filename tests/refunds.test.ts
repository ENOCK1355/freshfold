import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "../apps/api/src/config.js";
import { hmac } from "../apps/api/src/security.js";
import { createPilotFixture, pilotPassword } from "./helpers/pilot-fixture.js";
let fixture: Awaited<ReturnType<typeof createPilotFixture>>;
let student: any,
  admin: any,
  laundryOwner: any,
  companyId: string,
  serviceId: string;
beforeAll(async () => {
  fixture = await createPilotFixture();
  const { app, response, actor } = fixture;
  const owner = await app.identity.register(
    {
      type: "company",
      name: "Refund Owner",
      companyName: "Cape Refund Laundry",
      areaId: "amamoma",
      email: "refund.owner@pilot.example",
      password: pilotPassword,
    },
    response,
    null,
  );
  const user = await app.identity.register(
    {
      type: "student",
      name: "Refund Student",
      email: "refund.student@pilot.example",
      password: pilotPassword,
    },
    response,
    null,
  );
  student = await actor(user.id);
  admin = await actor("pilot-admin");
  laundryOwner = await actor(owner.id);
  companyId = (await actor(owner.id)).companyId!;
  await app.db.company.update({
    where: { id: companyId },
    data: {
      status: "approved",
      published: true,
      minimum: 100,
      deliveryFee: 500,
      instantBooking: true,
      paymentAccountApproved: true,
      paystackSubaccount: "ACCT_refundfixture",
    },
  });
  await app.db.subscription.create({
    data: {
      userId: owner.id,
      companyId,
      planId: "essential",
      status: "active",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 30 * 86400000),
      priceSnapshot: 7500,
    },
  });
  await app.db.operatingHour.createMany({
    data: Array.from({ length: 7 }, (_, day) => ({
      companyId,
      day,
      open: "08:00",
      close: "18:00",
    })),
  });
  serviceId = (
    await app.ops.service(await actor(owner.id), {
      name: "Laundry",
      category: "wash-fold",
      description: "Washing and folding for refund acceptance.",
      unit: "load",
      price: 2500,
      active: true,
    })
  ).id;
  await app.jobs.fillSlots(new Date());
});
afterAll(async () => {
  await fixture?.close();
});
async function paidOrder(simulator = false) {
  const { app, config } = fixture;
  const previous = config.mode;
  try {
    config.mode = simulator ? "simulator" : "paystack_test";
    const slot = (await app.market.slots(companyId)).find(
      (item) => item.available > 0,
    )!;
    const order = await app.market.book(student, {
      companyId,
      items: [{ serviceId, quantity: 4 }],
      slotId: slot.id,
      method: "pickup",
      address: {
        areaId: "amamoma",
        detail: "Amamoma refund acceptance address",
      },
      idempotencyKey: crypto.randomUUID(),
    });
    const payment = await app.payments.checkout(student, {
      kind: "order",
      orderId: order.id,
      idempotencyKey: crypto.randomUUID(),
    });
    if (simulator) await app.payments.simulate(student, payment.id, "success");
    else {
      await fixture.settle(payment.reference);
      await app.payments.verify(student, payment.reference);
    }
    return { order, payment };
  } finally {
    config.mode = previous;
  }
}
const request = (orderId: string, extra: Record<string, unknown> = {}) => ({
  orderId,
  full: true,
  reason: "Authorised customer refund after service review.",
  idempotencyKey: crypto.randomUUID(),
  ...extra,
});
async function processRefund(id: string) {
  const refund = await fixture.app.db.refund.findUniqueOrThrow({
    where: { id },
  });
  fixture.refunds.get(refund.providerId!)!.status = "processed";
  return fixture.app.payments.checkRefund(id);
}

describe("provider refunds", () => {
  it("cancels a fully refunded uncollected order and releases its reserved slot exactly once", async () => {
    const { app } = fixture,
      { order } = await paidOrder();
    const before = await app.db.slot.findUniqueOrThrow({
      where: { id: order.slotId! },
    });
    const refund = await app.payments.refund(admin, request(order.id));
    await processRefund(refund.id);
    await processRefund(refund.id);
    expect(
      await app.db.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({
      status: "cancelled",
      paymentStatus: "refunded",
      reservationReleased: true,
    });
    expect(
      (await app.db.slot.findUniqueOrThrow({ where: { id: order.slotId! } }))
        .reserved,
    ).toBe(before.reserved - 1);
    expect(
      await app.db.orderEvent.count({
        where: { orderId: order.id, status: "cancelled" },
      }),
    ).toBe(1);
  });
  it("allows collected clothes to be returned after a full refund and verifies handover", async () => {
    const { app } = fixture,
      { order } = await paidOrder();
    await app.market.transition(
      laundryOwner,
      order.id,
      "collected",
      "Collected for care",
    );
    const refund = await app.payments.refund(admin, request(order.id));
    await processRefund(refund.id);
    expect(
      (await app.db.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe("collected");
    for (const state of ["processing", "ready", "out_for_delivery"])
      await app.market.transition(
        laundryOwner,
        order.id,
        state,
        "Returning refunded garments",
      );
    await expect(
      app.market.transition(
        laundryOwner,
        order.id,
        "delivered",
        "Handed over",
        "000000",
      ),
    ).rejects.toThrow(/confirmation code/);
    const detail = await app.market.order(student, order.id);
    const code = detail.handoverNotice!.match(/\d{6}/)![0];
    await app.market.transition(
      laundryOwner,
      order.id,
      "delivered",
      "Handed over",
      code,
    );
    await app.market.transition(
      student,
      order.id,
      "completed",
      "Clothes received",
    );
    expect(
      (await app.db.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe("completed");
  });
  it("handles refund webhooks identified only by transaction reference without colliding across orders", async () => {
    const { app } = fixture;
    for (let count = 0; count < 2; count++) {
      const { order, payment } = await paidOrder();
      const refund = await app.payments.refund(
        admin,
        request(order.id, { full: false, amount: 1000 }),
      );
      fixture.refunds.get(refund.providerId!)!.status = "processed";
      const raw = JSON.stringify({
        event: "refund.processed",
        data: {
          transaction_reference: payment.reference,
          refund_reference: null,
          status: "processed",
          amount: "1000",
          currency: "GHS",
        },
      });
      await app.payments.webhook(
        raw,
        undefined,
        hmac(fixture.config.paystackSecret!, raw),
      );
      await app.jobs.tick();
      expect(
        (await app.db.refund.findUniqueOrThrow({ where: { id: refund.id } }))
          .status,
      ).toBe("processed");
      expect(
        await app.db.journal.count({ where: { key: `refund-${refund.id}` } }),
      ).toBe(1);
    }
    expect(
      await app.db.webhookEvent.count({
        where: { key: { startsWith: "paystack:refund.processed:" } },
      }),
    ).toBe(2);
  });
  it("excludes simulator history from refund choices, payments, and provider reporting", async () => {
    const before = (await fixture.app.finance.report(admin, { run: "all" }))
        .collected,
      priorRefunds = await fixture.app.db.refund.count();
    const real = await paidOrder(),
      legacy = await paidOrder(true);
    const { app } = fixture;
    const options = await app.payments.refundOptions(admin);
    expect(options.some((item) => item.id === real.order.id)).toBe(true);
    expect(options.some((item) => item.id === legacy.order.id)).toBe(false);
    await expect(
      app.payments.refund(admin, request(legacy.order.id)),
    ).rejects.toThrow(/not charged/);
    expect(await app.db.refund.count()).toBe(priorRefunds);
    expect(
      (await app.admissions.paymentsList({})).items.every(
        (item) => item.mode === "paystack_test",
      ),
    ).toBe(true);
    expect((await app.finance.report(admin, { run: "all" })).collected).toBe(
      before + 10800,
    );
  });
  it("keeps pending refunds out of the ledger and posts a verified completion once", async () => {
    const { app } = fixture,
      { order, payment } = await paidOrder();
    const input = request(order.id, { full: false, amount: 2500 });
    const refund = await app.payments.refund(admin, input);
    expect(refund.status).toBe("pending");
    expect(
      await app.db.journal.count({ where: { key: `refund-${refund.id}` } }),
    ).toBe(0);
    expect((await app.payments.refund(admin, input)).id).toBe(refund.id);
    await processRefund(refund.id);
    await app.payments.checkRefund(refund.id);
    expect(
      await app.db.journal.count({ where: { key: `refund-${refund.id}` } }),
    ).toBe(1);
    expect(
      (await app.db.order.findUniqueOrThrow({ where: { id: order.id } }))
        .paymentStatus,
    ).toBe("partially_refunded");
    await expect(app.payments.manageRefund(student, refund.id)).rejects.toThrow(
      /Administrator/,
    );
    expect(
      (await app.db.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .status,
    ).toBe("success");
  });
  it("recovers a timeout after provider acceptance without creating a second refund", async () => {
    const { app } = fixture,
      { order } = await paidOrder(),
      delegate = app.payments.provider;
    let lostResponse = true;
    const before = fixture.refunds.size;
    app.payments.provider = async (route, method, body) => {
      if (route === "/refund" && method === "POST" && lostResponse) {
        lostResponse = false;
        await delegate(route, method, body);
        throw new Error("Provider connection timed out after acceptance.");
      }
      return delegate(route, method, body);
    };
    try {
      const refund = await app.payments.refund(admin, request(order.id));
      expect(refund.status).toBe("attention_required");
      expect(
        (await app.payments.refundOptions(admin)).some(
          (item) => item.id === order.id,
        ),
      ).toBe(false);
      const recovered = await app.payments.manageRefund(admin, refund.id, true);
      expect(recovered.providerId).toBeTruthy();
      expect(fixture.refunds.size).toBe(before + 1);
      await processRefund(refund.id);
    } finally {
      app.payments.provider = delegate;
    }
  });
  it("does not let a delayed pending response overwrite a completed refund", async () => {
    const { app } = fixture,
      { order } = await paidOrder();
    const refund = await app.payments.refund(
      admin,
      request(order.id, { full: false, amount: 1000 }),
    );
    const delegate = app.payments.provider;
    let release!: () => void, started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    let first = true;
    app.payments.provider = async (route, method, body) => {
      const data = await delegate(route, method, body);
      if (route === `/refund/${refund.providerId}` && first) {
        first = false;
        const snapshot = structuredClone(data);
        started();
        await waiting;
        return snapshot;
      }
      return data;
    };
    try {
      const slow = app.payments.checkRefund(refund.id);
      await requested;
      await processRefund(refund.id);
      release();
      expect((await slow).status).toBe("processed");
      expect(
        (await app.db.refund.findUniqueOrThrow({ where: { id: refund.id } }))
          .status,
      ).toBe("processed");
      expect(
        await app.db.journal.count({ where: { key: `refund-${refund.id}` } }),
      ).toBe(1);
      expect(
        await app.db.notification.count({
          where: {
            userId: student.id,
            title: "Refund confirmed",
            href: `/account/orders/${order.id}`,
          },
        }),
      ).toBe(1);
    } finally {
      release();
      app.payments.provider = delegate;
    }
  });
  it("records a definite provider rejection without reserving an unavailable refund", async () => {
    const { app } = fixture,
      { order } = await paidOrder(),
      delegate = app.payments.provider;
    app.payments.provider = async (route, method, body) => {
      if (route === "/refund" && method === "POST")
        throw new AppError(502, "Insufficient merchant balance", {
          providerStatus: 400,
        });
      return delegate(route, method, body);
    };
    try {
      await expect(
        app.payments.refund(admin, request(order.id)),
      ).rejects.toThrow(/balance/);
    } finally {
      app.payments.provider = delegate;
    }
    const refund = await app.db.refund.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(refund.status).toBe("failed");
    expect(refund.failureReason).toMatch(/balance/);
    expect(
      (await app.payments.refundOptions(admin, order.id))[0].remainingAmount,
    ).toBe(10800);
  });
  it("can refund delivery and convenience fees after the full laundry portion was refunded", async () => {
    const { app } = fixture,
      { order } = await paidOrder();
    const laundry = await app.payments.refund(
      admin,
      request(order.id, { full: false, amount: 10000 }),
    );
    await processRefund(laundry.id);
    const remaining = (await app.payments.refundOptions(admin, order.id))[0];
    expect(remaining.remainingLaundry).toBe(0);
    expect(remaining.remainingAmount).toBe(800);
    const fees = await app.payments.refund(admin, request(order.id));
    expect(fees.amount).toBe(800);
    await processRefund(fees.id);
    expect(
      (await app.db.order.findUniqueOrThrow({ where: { id: order.id } }))
        .paymentStatus,
    ).toBe("refunded");
    expect(await app.payments.refundOptions(admin, order.id)).toHaveLength(0);
  });
  it("does not reverse money for mismatched provider refund details", async () => {
    const { app } = fixture,
      { order } = await paidOrder();
    const refund = await app.payments.refund(
      admin,
      request(order.id, { full: false, amount: 1000 }),
    );
    const provider = fixture.refunds.get(refund.providerId!);
    provider.status = "processed";
    provider.currency = "NGN";
    await expect(app.payments.checkRefund(refund.id)).rejects.toThrow(
      /did not match/,
    );
    expect(
      await app.db.journal.count({ where: { key: `refund-${refund.id}` } }),
    ).toBe(0);
    provider.currency = "GHS";
    await app.payments.checkRefund(refund.id);
  });
});
