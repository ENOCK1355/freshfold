import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPilotFixture, pilotPassword } from "./helpers/pilot-fixture.js";
import { queryRefreshInterval } from "../apps/web/src/query-refresh.js";

let fixture: Awaited<ReturnType<typeof createPilotFixture>>;
let owner: any, student: any, admin: any, companyId: string, orderId: string;
beforeAll(async () => {
  fixture = await createPilotFixture();
  const { app, response, actor } = fixture;
  const registeredOwner = await app.identity.register(
    {
      type: "company",
      name: "Dashboard Owner",
      companyName: "Cape Dashboard Laundry",
      areaId: "amamoma",
      email: "dashboard.owner@pilot.example",
      password: pilotPassword,
    },
    response,
    null,
  );
  const registeredStudent = await app.identity.register(
    {
      type: "student",
      name: "Dashboard Student",
      email: "dashboard.student@pilot.example",
      password: pilotPassword,
    },
    response,
    null,
  );
  owner = await actor(registeredOwner.id);
  student = await actor(registeredStudent.id);
  admin = await actor("pilot-admin");
  companyId = owner.companyId;
  await app.db.company.update({
    where: { id: companyId },
    data: {
      status: "approved",
      published: true,
      minimum: 100,
      deliveryFee: 500,
      instantBooking: true,
      paymentAccountApproved: true,
      paystackSubaccount: "ACCT_dashboard",
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
  const service = await app.ops.service(owner, {
    name: "Laundry",
    category: "wash-fold",
    description: "Washing and folding for dashboard checks.",
    unit: "load",
    price: 2500,
    active: true,
  });
  const hosting = await app.payments.checkout(owner, {
    kind: "hosting",
    companyId,
    planId: "essential",
    idempotencyKey: crypto.randomUUID(),
  });
  await fixture.settle(hosting.reference);
  await app.payments.verify(owner, hosting.reference);
  const subscription = await app.db.subscription.findFirstOrThrow({
    where: { paymentId: hosting.id },
  });
  await app.admissions.subscription(
    admin,
    subscription.id,
    "approve",
    "Verified hosting payment for dashboard checks.",
  );
  await app.jobs.fillSlots(new Date());
  const slot = (await app.market.slots(companyId)).find(
    (slot) => slot.available > 0,
  )!;
  const order = await app.market.book(student, {
    companyId,
    items: [{ serviceId: service.id, quantity: 2 }],
    slotId: slot.id,
    method: "pickup",
    address: {
      areaId: "amamoma",
      detail: "Amamoma dashboard collection address",
    },
    idempotencyKey: crypto.randomUUID(),
  });
  orderId = order.id;
  const payment = await app.payments.checkout(student, {
    kind: "order",
    orderId,
    idempotencyKey: crypto.randomUUID(),
  });
  await fixture.settle(payment.reference);
  await app.payments.verify(student, payment.reference);
});
afterAll(async () => {
  await fixture?.close();
});

describe("consistent dashboard totals", () => {
  it("uses the same listing eligibility for discovery, overview, company records, and owner status", async () => {
    const { app } = fixture;
    const check = async (expected: number) => {
      expect((await app.market.companies({})).total).toBe(expected);
      expect((await app.ops.overview(admin)).listed).toBe(expected);
      expect(
        (await app.ops.companies()).filter((company) => company.listing.listed),
      ).toHaveLength(expected);
      expect((await app.ops.business(owner)).listing.listed).toBe(
        expected === 1,
      );
    };
    await check(1);
    await app.db.company.update({
      where: { id: companyId },
      data: { paymentAccountApproved: false },
    });
    await check(0);
    expect((await app.ops.business(owner)).listing.blockers).toContain(
      "Settlement account approval required",
    );
    await app.db.company.update({
      where: { id: companyId },
      data: { paymentAccountApproved: true },
    });
    await app.db.company.update({
      where: { id: companyId },
      data: { paystackSubaccount: "" },
    });
    await check(0);
    await app.db.company.update({
      where: { id: companyId },
      data: { paystackSubaccount: "ACCT_dashboard" },
    });
    await app.db.service.updateMany({
      where: { companyId },
      data: { active: false },
    });
    await check(0);
    await app.db.service.updateMany({
      where: { companyId },
      data: { active: true },
    });
    const plan = await app.db.subscription.findFirstOrThrow({
      where: { companyId },
    });
    await app.db.subscription.update({
      where: { id: plan.id },
      data: { endsAt: new Date(Date.now() - 60000) },
    });
    await check(0);
    await app.db.subscription.update({
      where: { id: plan.id },
      data: { endsAt: plan.endsAt },
    });
    await check(1);
  });

  it("counts all orders beyond the latest hundred and keeps company and staff permissions scoped", async () => {
    const { app } = fixture;
    const { id, ...template } = await app.db.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    await app.db.order.createMany({
      data: Array.from({ length: 106 }, (_, index) => ({
        ...template,
        id: crypto.randomUUID(),
        reference: `DASH-${index}`,
        idempotencyKey: `dashboard-${index}`,
        slotId: null,
        deliveryCodeHash: null,
        status: index < 101 ? "completed" : "accepted",
      })) as any,
    });
    expect(await app.market.orders(owner, { view: "business" })).toHaveLength(
      100,
    );
    const summary = await app.ops.businessOverview(owner);
    expect(summary.totalOrders).toBe(107);
    expect(summary.completedOrders).toBe(101);
    expect(summary.activeOrders).toBe(6);
    expect(summary.finance!.orderTransactions).toBe(1);
    const studentTotals = await app.market.accountOverview(student);
    expect(studentTotals).toMatchObject({
      totalOrders: 107,
      completedOrders: 101,
      activeOrders: 6,
      transactions: 1,
      paid: 5800,
    });
    const first = await app.market.orderPage(student, {
      page: "1",
      limit: "100",
    });
    const last = await app.market.orderPage(student, {
      page: "2",
      limit: "100",
    });
    expect(first.total).toBe(107);
    expect(last.items).toHaveLength(7);
    expect(
      new Set([...first.items, ...last.items].map((order) => order.id)).size,
    ).toBe(107);
    expect(first.items[0]).not.toHaveProperty("deliveryCodeHash");
    expect(
      (await app.market.orderPage(student, { status: "active" })).total,
    ).toBe(6);
    expect(
      (await app.market.orderPage(student, { receipts: "true" })).total,
    ).toBe(1);
    expect((await app.ops.customers(owner))[0].count).toBe(107);
    expect(
      (
        await app.ops.businessOverview({
          ...owner,
          role: "staff",
          permissions: ["orders.read"],
        })
      ).finance,
    ).toBeNull();
    await expect(app.ops.businessOverview(student)).rejects.toThrow();
    const outsider = await app.identity.register(
      {
        type: "company",
        name: "Other Owner",
        companyName: "Other Dashboard Laundry",
        areaId: "kwaprow",
        email: "other.dashboard@pilot.example",
        password: pilotPassword,
      },
      fixture.response,
      null,
    );
    expect(
      (await app.ops.businessOverview(await fixture.actor(outsider.id)))
        .totalOrders,
    ).toBe(0);
    expect((await app.ops.overview(admin)).companies).toBe(2);
    expect((await app.ops.overview(admin)).listed).toBe(1);
  });

  it("keeps failed, pending, and simulator attempts out of verified money totals and separates company costs", async () => {
    const { app } = fixture;
    for (const [status, mode] of [
      ["pending", "paystack_test"],
      ["failed", "paystack_test"],
      ["success", "simulator"],
    ]) {
      await app.db.payment.create({
        data: {
          reference: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          userId: student.id,
          kind: "student",
          amount: 999999,
          status,
          mode,
          source: mode,
          runId: "dashboard-checks",
        },
      });
    }
    const platform = (await app.ops.overview(admin)).finance!;
    expect(platform.collected).toBe(13300);
    expect(platform.successfulTransactions).toBe(2);
    expect(platform.transactions.total).toBe(4);
    expect(platform.transactions.byStatus.pending).toBe(1);
    const company = (await app.ops.businessOverview(owner)).finance!;
    expect(company.orderCollections).toBe(5800);
    expect(company.planPayments).toBe(7500);
    expect(company.companyNet).toBe(4900);
    expect(company.companyPayable).toBe(4900);
    expect(company.commissionNet).toBe(600);
    expect(company).not.toHaveProperty("payments");
    const report = await app.finance.report(owner, {});
    expect(report.companyNet).toBe(company.companyNet);
    expect(report.orderCollections).toBe(company.orderCollections);
  });

  it("updates both dashboards only after Paystack confirms a refund", async () => {
    const { app } = fixture;
    const refund = await app.payments.refund(admin, {
      orderId,
      full: true,
      reason: "Customer refund during dashboard verification.",
      idempotencyKey: crypto.randomUUID(),
    });
    expect((await app.ops.businessOverview(owner)).finance!.companyNet).toBe(
      4900,
    );
    fixture.refunds.get(refund.providerId!)!.status = "processed";
    await app.payments.checkRefund(refund.id);
    const platform = (await app.ops.overview(admin)).finance!;
    const company = (await app.ops.businessOverview(owner)).finance!;
    expect(platform.collected).toBe(13300);
    expect(platform.refunded).toBe(5800);
    expect(platform.netCollections).toBe(7500);
    expect(company.companyNet).toBe(0);
    expect(company.companyPayable).toBe(0);
    expect(company.commissionNet).toBe(0);
    expect(company.planPayments).toBe(7500);
    const refundedOrder = await app.db.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(refundedOrder.status).toBe("cancelled");
    expect(refundedOrder.reservationReleased).toBe(true);
    expect((await app.market.accountOverview(student)).netPaid).toBe(0);
  });

  it("refreshes financial, operational, and public listing queries automatically with filtered routes", () => {
    for (const route of [
      "finance?run=all&from=2026-11-01",
      "business/overview",
      "business",
      "orders?view=business",
      "account/overview",
      "tickets?paged=true&page=2",
      "admin/overview",
      "admin/companies",
      "admin/payments?page=2",
      "companies?area=amamoma",
      "companies/campus-linen",
    ])
      expect(queryRefreshInterval(route)).toBe(15000);
    expect(queryRefreshInterval("config")).toBe(30000);
    expect(queryRefreshInterval("content/privacy")).toBe(false);
  });
});
