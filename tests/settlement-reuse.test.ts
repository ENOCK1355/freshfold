import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPilotFixture, pilotPassword } from "./helpers/pilot-fixture.js";

let fixture: Awaited<ReturnType<typeof createPilotFixture>>;
let admin: any, student: any;
const owners: any[] = [];
const sharedCode = "ACCT_sharedfixture";
beforeAll(async () => {
  fixture = await createPilotFixture();
  const { app, actor, response } = fixture;
  admin = await actor("pilot-admin");
  for (let index = 0; index < 2; index++) {
    const user = await app.identity.register(
      {
        type: "company",
        name: `Settlement Owner ${index + 1}`,
        companyName: `Cape Settlement Laundry ${index + 1}`,
        areaId: "amamoma",
        email: `settlement.owner${index}@pilot.example`,
        password: pilotPassword,
      },
      response,
      null,
    );
    const owner = await actor(user.id);
    owners.push(owner);
    await app.db.company.update({
      where: { id: owner.companyId },
      data: {
        status: "approved",
        published: true,
        minimum: 100,
        deliveryFee: 0,
        instantBooking: true,
      },
    });
  }
  const user = await app.identity.register(
    {
      type: "student",
      name: "Settlement Student",
      email: "settlement.student@pilot.example",
      password: pilotPassword,
    },
    response,
    null,
  );
  student = await actor(user.id);
  fixture.subaccounts.set(sharedCode, {
    subaccount_code: sharedCode,
    active: true,
    currency: "GHS",
    domain: "test",
    is_verified: false,
    account_name: "Fresh Fold",
    account_number: "0000000000",
    settlement_bank: "Ghana Fixture Bank",
  });
});
afterAll(async () => {
  await fixture?.close();
});
const approval = (code = sharedCode) => ({
  code,
  reason: "Reviewed the configured Paystack settlement account.",
});

describe("shared Paystack test settlement accounts", () => {
  it("allows the same validated test code for multiple companies and repeated approval", async () => {
    for (const owner of owners) {
      const result = await fixture.app.admissions.approveSettlement(
        admin,
        owner.companyId,
        approval(),
      );
      expect(result.paymentAccountApproved).toBe(true);
    }
    await fixture.app.admissions.approveSettlement(
      admin,
      owners[0].companyId,
      approval(),
    );
    expect(
      await fixture.app.db.company.count({
        where: { paystackSubaccount: sharedCode, paymentAccountApproved: true },
      }),
    ).toBe(2);
    expect(
      fixture.calls.filter(
        (call) => call.route === "/subaccount" && call.method === "POST",
      ),
    ).toHaveLength(0);
  });

  it("still requires admin approval, the correct environment, GHS, and an active account", async () => {
    const { app } = fixture;
    await expect(
      app.admissions.approveSettlement(
        student,
        owners[0].companyId,
        approval(),
      ),
    ).rejects.toThrow(/Administrator/);
    const code = "ACCT_invalidfixture";
    const valid = fixture.subaccounts.get(sharedCode);
    for (const changes of [
      { domain: "live" },
      { currency: "USD" },
      { active: false },
    ]) {
      fixture.subaccounts.set(code, {
        ...valid,
        subaccount_code: code,
        ...changes,
      });
      await expect(
        app.admissions.approveSettlement(
          admin,
          owners[1].companyId,
          approval(code),
        ),
      ).rejects.toThrow(/active, use GHS/);
    }
    expect(
      (
        await app.db.company.findUniqueOrThrow({
          where: { id: owners[1].companyId },
        })
      ).paystackSubaccount,
    ).toBe(sharedCode);
  });

  it("continues to reject shared or unverified live settlement accounts", async () => {
    const { app, config } = fixture;
    const code = "ACCT_livefixture",
      account = {
        ...fixture.subaccounts.get(sharedCode),
        subaccount_code: code,
        domain: "live",
        is_verified: false,
      };
    fixture.subaccounts.set(code, account);
    config.mode = "paystack_live";
    try {
      await expect(
        app.admissions.approveSettlement(
          admin,
          owners[0].companyId,
          approval(code),
        ),
      ).rejects.toThrow(/verify the live/);
      account.is_verified = true;
      await app.admissions.approveSettlement(
        admin,
        owners[0].companyId,
        approval(code),
      );
      await expect(
        app.admissions.approveSettlement(
          admin,
          owners[1].companyId,
          approval(code),
        ),
      ).rejects.toThrow(/already assigned/);
    } finally {
      config.mode = "paystack_test";
      await app.admissions.approveSettlement(
        admin,
        owners[0].companyId,
        approval(),
      );
    }
  });

  it("keeps orders, provider references, and company earnings separate when the code is shared", async () => {
    const { app } = fixture;
    const paymentIds: string[] = [];
    for (const [index, owner] of owners.entries()) {
      const companyId = owner.companyId;
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
      const service = await app.ops.service(owner, {
        name: "Wash and fold",
        category: "wash-fold",
        description:
          "Laundry service with independently recorded company earnings.",
        unit: "load",
        price: (index + 1) * 1000,
        active: true,
      });
      await app.jobs.fillSlots(new Date());
      const slot = (await app.market.slots(companyId)).find(
        (slot) => slot.available > 0,
      )!;
      const order = await app.market.book(student, {
        companyId,
        items: [{ serviceId: service.id, quantity: 1 }],
        slotId: slot.id,
        method: "dropoff",
        address: {
          areaId: "amamoma",
          detail: "Amamoma settlement acceptance address",
        },
        idempotencyKey: crypto.randomUUID(),
      });
      const payment = await app.payments.checkout(student, {
        kind: "order",
        orderId: order.id,
        idempotencyKey: crypto.randomUUID(),
      });
      paymentIds.push(payment.id);
      const initialization = fixture.calls.find(
        (call) =>
          call.route === "/transaction/initialize" &&
          call.body.reference === payment.reference,
      )!;
      expect(initialization.body.subaccount).toBe(sharedCode);
      expect(initialization.body.transaction_charge).toBe(
        index === 0 ? 420 : 540,
      );
      await fixture.settle(payment.reference);
      await app.payments.verify(student, payment.reference);
    }
    expect(new Set(paymentIds).size).toBe(2);
    for (const [index, owner] of owners.entries()) {
      const report = await app.finance.report(owner, {});
      expect(report.payments).toHaveLength(1);
      expect(report.companyNet).toBe(index === 0 ? 880 : 1760);
      expect(report.companyPayable).toBe(report.companyNet);
      expect(report.payments[0].id).toBe(paymentIds[index]);
    }
    const report = await app.finance.report(admin, {});
    expect(report.successfulTransactions).toBe(2);
    expect(report.collected).toBe(3600);
    expect(report.companyPayable).toBe(2640);
  });
});
