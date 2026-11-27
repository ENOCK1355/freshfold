import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createPilotFixture, pilotPassword } from "./helpers/pilot-fixture.js";
import { RateLimiter, hash, verifyPassword } from "../apps/api/src/security.js";
import { FileService } from "../apps/api/src/files.js";
let fixture: Awaited<ReturnType<typeof createPilotFixture>>;
beforeAll(async () => {
  fixture = await createPilotFixture();
});
afterAll(async () => {
  await fixture?.close();
});

describe("Paystack pilot workflow with an isolated provider transport", () => {
  it("keeps signed private downloads valid across function instances and rejects an infected document even with an older valid link", async () => {
    const { app, actor, response, config } = fixture;
    const user = await app.identity.register(
      {
        type: "student",
        name: "Document Owner",
        email: "document@pilot.example",
        password: pilotPassword,
      },
      response,
      null,
    );
    const owner = await actor(user.id);
    const previousScanner = process.env.CLAMAV_HOST;
    process.env.CLAMAV_HOST = "127.0.0.1";
    let upload: Awaited<ReturnType<typeof app.files.upload>>;
    try {
      upload = await app.files.upload(owner, {
        name: "document.pdf",
        mime: "application/octet-stream",
        base64: Buffer.from("%PDF-1.7\nPrivate upload fixture.").toString(
          "base64",
        ),
      });
    } finally {
      if (previousScanner === undefined) delete process.env.CLAMAV_HOST;
      else process.env.CLAMAV_HOST = previousScanner;
    }
    await expect(
      app.files.link(await actor("pilot-admin"), upload.id),
    ).rejects.toThrow(/security scan/);
    await expect(
      app.files.upload(owner, {
        name: "sample.txt",
        mime: "text/plain",
        base64: Buffer.from("DEMONSTRATION - NOT VALID").toString("base64"),
      }),
    ).rejects.toThrow(/valid PDF/);
    const link = await app.files.link(owner, upload.id),
      params = new URL(link.url, config.appUrl).searchParams;
    const second = new FileService(app.db, config, app.auth);
    expect(
      (
        await second.download(
          owner,
          upload.id,
          params.get("expires")!,
          params.get("signature")!,
        )
      ).bytes.length,
    ).toBeGreaterThan(0);
    await app.db.storedFile.update({
      where: { id: upload.id },
      data: { status: "infected" },
    });
    await expect(
      second.download(
        owner,
        upload.id,
        params.get("expires")!,
        params.get("signature")!,
      ),
    ).rejects.toThrow(/rejected/);
  });
  it("verifies hosting, requires admin activation, publishes a genuine company, pays a normal student's order, fulfils it, and records commission", async () => {
    const { app, actor, response } = fixture;
    const registration = await app.identity.register(
      {
        type: "company",
        name: "Ama Pilot",
        email: "owner@pilot.example",
        password: pilotPassword,
        companyName: "Cape Coast Pilot Laundry",
        areaId: "amamoma",
      },
      response,
      null,
    );
    const studentRegistration = await app.identity.register(
      {
        type: "student",
        name: "Kofi Pilot",
        email: "student@pilot.example",
        password: pilotPassword,
      },
      response,
      null,
    );
    const owner = await actor(registration.id),
      student = await actor(studentRegistration.id),
      admin = await actor("pilot-admin");
    const companyId = owner.companyId!;
    expect(
      (await app.db.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .demoScenario,
    ).toBeNull();
    expect(
      (await app.db.company.findUniqueOrThrow({ where: { id: companyId } }))
        .demo,
    ).toBe(false);
    await app.ops.updateBusiness(owner, {
      name: "Cape Coast Pilot Laundry",
      description:
        "A local Cape Coast laundry providing reliable washing and folding for campus residents.",
      location: "Amamoma main road, Cape Coast",
      primaryAreaId: "amamoma",
      registrationRef: "CC-PILOT-REG-2026",
      areas: ["amamoma"],
      pickup: true,
      deliveryFee: 500,
      minimum: 1000,
      capacity: 10,
      turnaroundHours: 24,
      instantBooking: false,
    });
    const service = await app.ops.service(owner, {
      name: "Wash & fold",
      category: "wash-fold",
      description: "Careful washing and folding of everyday clothes.",
      unit: "load",
      price: 2500,
      active: true,
    });
    await app.db.operatingHour.createMany({
      data: Array.from({ length: 7 }, (_, day) => ({
        companyId,
        day,
        open: "08:00",
        close: "18:00",
      })),
    });
    const photograph = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#b6c9e0" },
    })
      .png()
      .toBuffer();
    const document = await app.files.upload(owner, {
      companyId,
      name: "registration.png",
      mime: "image/png",
      base64: photograph.toString("base64"),
    });
    expect(document.status).toBe("sanitized");
    await app.files.photo(owner, {
      name: "premises.png",
      base64: photograph.toString("base64"),
      kind: "photo",
    });
    await app.ops.application(
      admin,
      companyId,
      "approved",
      "Reviewed the business registration and premises photograph.",
    );
    await app.admissions.settlementRequest(owner, {
      bankCode: "GH001",
      bankName: "",
      accountNumber: "0000000000",
      accountName: "Cape Coast Pilot Laundry",
    });
    await app.admissions.approveSettlement(admin, companyId, {
      reason:
        "Reviewed submitted company bank details and Paystack subaccount.",
    });
    const hosting = await app.payments.checkout(owner, {
      kind: "hosting",
      companyId,
      planId: "essential",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(hosting.checkoutUrl).toMatch(/^https:\/\/checkout.paystack.com\//);
    expect(await app.db.subscription.count({ where: { companyId } })).toBe(0);
    await expect(
      app.admissions.reviewPayment(
        admin,
        hosting.id,
        "This payment has not completed yet.",
      ),
    ).rejects.toThrow(/successful transaction/);
    await fixture.settle(hosting.reference);
    await fixture.webhook(hosting.reference);
    await fixture.webhook(hosting.reference);
    let subscription = await app.db.subscription.findFirstOrThrow({
      where: { paymentId: hosting.id },
    });
    expect(subscription.status).toBe("pending_approval");
    expect(
      await app.db.subscription.count({ where: { paymentId: hosting.id } }),
    ).toBe(1);
    await expect(app.ops.publish(owner)).rejects.toThrow(/hosting/);
    await app.jobs.recognize(new Date(Date.now() + 2 * 86400000));
    expect(
      (
        await app.db.subscription.findUniqueOrThrow({
          where: { id: subscription.id },
        })
      ).recognized,
    ).toBe(0);
    await app.admissions.subscription(
      admin,
      subscription.id,
      "approve",
      "Checked the verified hosting payment and business application.",
    );
    subscription = await app.db.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(
      subscription.endsAt.getTime() - subscription.startsAt.getTime(),
    ).toBe(30 * 86400000);
    await app.ops.publish({ ...admin, companyId });
    await app.db.company.update({
      where: { id: companyId },
      data: { paymentAccountApproved: false },
    });
    expect((await app.market.companies({})).companies).toHaveLength(0);
    await expect(app.market.company(companyId)).rejects.toThrow(/available/);
    await app.db.company.update({
      where: { id: companyId },
      data: { paymentAccountApproved: true },
    });
    expect(await app.market.company(companyId)).not.toHaveProperty(
      "verificationNote",
    );
    await app.jobs.fillSlots(new Date());
    expect(
      (await app.market.companies({ area: "amamoma" })).companies.some(
        (company: any) => company.id === companyId,
      ),
    ).toBe(true);
    const slot = (await app.market.slots(companyId)).find(
      (item) => item.available > 0,
    )!;
    const order = await app.market.book(student, {
      companyId,
      items: [{ serviceId: service.id, quantity: 2 }],
      slotId: slot.id,
      method: "pickup",
      address: {
        areaId: "amamoma",
        detail: "Main campus residence, Cape Coast",
      },
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      app.payments.checkout(student, {
        kind: "order",
        orderId: order.id,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/accept/);
    await app.market.transition(
      owner,
      order.id,
      "accepted",
      "We can collect this basket tomorrow.",
    );
    const payment = await app.payments.checkout(student, {
      kind: "order",
      orderId: order.id,
      idempotencyKey: crypto.randomUUID(),
    });
    const init = fixture.calls.find(
      (call) =>
        call.route === "/transaction/initialize" &&
        call.body.reference === payment.reference,
    )!.body;
    expect(init.channels).toEqual(["card", "mobile_money"]);
    expect(init.subaccount).toMatch(/^ACCT_/);
    expect(init.transaction_charge).toBe(900); // GHS 6 commission + GHS 3 fee.
    expect(init.bearer).toBe("account");
    await fixture.settle(payment.reference, { channel: "mobile_money" });
    await fixture.webhook(payment.reference);
    expect((await app.market.order(owner, order.id)).paymentStatus).toBe(
      "paid",
    );
    expect(
      (await app.market.orders(owner, { view: "business" })).some(
        (item) => item.id === order.id,
      ),
    ).toBe(true);
    const handover = await app.db.notification.findFirstOrThrow({
      where: {
        userId: student.id,
        title: "Your handover code",
        href: `/account/orders/${order.id}`,
      },
    });
    const deliveryCode = handover.body.match(/\d{6}/)![0];
    for (const status of [
      "collected",
      "processing",
      "ready",
      "out_for_delivery",
      "delivered",
    ])
      await app.market.transition(
        owner,
        order.id,
        status,
        "Laundry fulfilment update.",
        status === "delivered" ? deliveryCode : undefined,
      );
    await app.market.transition(
      student,
      order.id,
      "completed",
      "Received my laundry in good order.",
    );
    await app.market.review(
      student,
      order.id,
      5,
      "Clear updates and careful washing, folding, and delivery.",
    );
    await app.admissions.reviewPayment(
      admin,
      payment.id,
      "Verified laundry payment and commission allocation.",
    );
    const commission = await app.db.ledgerLine.aggregate({
      where: {
        accountCode: "commission_revenue",
        journal: { paymentId: payment.id },
      },
      _sum: { credit: true },
    });
    expect(commission._sum.credit).toBe(600);
    const notifications = await app.db.notification.findMany({
      where: { userId: admin.id },
    });
    expect(
      notifications.some(
        (item) => item.title === "Subscription payment received",
      ),
    ).toBe(true);
    expect(
      notifications.some((item) => item.title === "Order payment received"),
    ).toBe(true);
    expect(
      (await app.admissions.paymentsList({ kind: "order" })).items[0]
        .reviewedAt,
    ).not.toBeNull();
    expect(
      (await app.admissions.paymentsList({ kind: "order" })).items[0],
    ).not.toHaveProperty("authorization");
  });
  it("grants Student Plus only after verified payment and approval, and supports suspension and restoration", async () => {
    const { app, actor } = fixture;
    const record = await app.db.user.findUniqueOrThrow({
      where: { email: "student@pilot.example" },
    });
    const student = await actor(record.id),
      admin = await actor("pilot-admin");
    const payment = await app.payments.checkout(student, {
      kind: "student",
      planId: "student-plus",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(await app.market.premium(student.id)).toBe(false);
    await fixture.settle(payment.reference);
    await app.payments.verify(student, payment.reference);
    const subscription = await app.db.subscription.findFirstOrThrow({
      where: { paymentId: payment.id },
    });
    expect(subscription.status).toBe("pending_approval");
    expect(await app.market.premium(student.id)).toBe(false);
    await expect(
      app.payments.checkout(student, {
        kind: "student",
        planId: "student-plus",
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/approval/);
    await expect(
      app.admissions.subscription(
        student,
        subscription.id,
        "approve",
        "Attempted self-approval.",
      ),
    ).rejects.toThrow(/Administrator/);
    await app.admissions.subscription(
      admin,
      subscription.id,
      "approve",
      "Checked Student Plus payment and account details.",
    );
    expect(await app.market.premium(student.id)).toBe(true);
    await app.admissions.subscription(
      admin,
      subscription.id,
      "suspend",
      "Suspended while resolving a support request.",
    );
    expect(await app.market.premium(student.id)).toBe(false);
    await app.admissions.subscription(
      admin,
      subscription.id,
      "restore",
      "Support request resolved, paid access restored.",
    );
    expect(await app.market.premium(student.id)).toBe(true);
  });
  it("rejects wrong amounts, currency, environment, forged webhooks, and another user's payment", async () => {
    const { app, actor, response } = fixture;
    const registration = await app.identity.register(
      {
        type: "student",
        name: "Second Student",
        email: "second@pilot.example",
        password: pilotPassword,
      },
      response,
      null,
    );
    const student = await actor(registration.id),
      admin = await actor("pilot-admin");
    const payment = await app.payments.checkout(student, {
      kind: "student",
      planId: "student-plus",
      idempotencyKey: crypto.randomUUID(),
    });
    for (const changes of [
      { amount: payment.amount - 1 },
      { currency: "NGN" },
      { domain: "live" },
    ]) {
      await fixture.settle(payment.reference, {
        amount: payment.amount,
        currency: "GHS",
        domain: "test",
        ...changes,
      });
      await expect(
        app.payments.verify(student, payment.reference),
      ).rejects.toThrow(/match/);
    }
    expect(
      await app.db.subscription.count({ where: { userId: student.id } }),
    ).toBe(0);
    await expect(
      app.payments.webhook(
        '{"event":"charge.success"}',
        undefined,
        "0".repeat(128),
      ),
    ).rejects.toThrow(/signature/);
    await expect(
      app.payments.verify(
        await actor(
          (
            await app.db.user.findUniqueOrThrow({
              where: { email: "student@pilot.example" },
            })
          ).id,
        ),
        payment.reference,
      ),
    ).rejects.toThrow(/another/);
    await fixture.settle(payment.reference, {
      amount: payment.amount,
      currency: "GHS",
      domain: "test",
      status: "failed",
    });
    await app.admissions.verify(admin, payment.id);
    expect(
      (await app.db.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .status,
    ).toBe("failed");
    const retry = await app.payments.retry(student, payment.id);
    expect(retry.id).not.toBe(payment.id);
    expect(retry.checkoutUrl).toMatch(/^https:/);
  });
  it("recovers an account through a hashed, single-use support link without sending email", async () => {
    const { app, actor, response } = fixture;
    const student = await app.db.user.findUniqueOrThrow({
      where: { email: "second@pilot.example" },
    });
    const admin = await actor("pilot-admin");
    const link = await app.identity.recoveryLink(
      admin,
      student.id,
      "Confirmed the account holder in a private support conversation.",
    );
    const raw = new URL(link.url).searchParams.get("token")!;
    expect(
      await app.db.authToken.findUnique({ where: { hash: hash(raw) } }),
    ).not.toBeNull();
    await app.identity.recover(raw, "Recovered.Password!2026", response, null);
    expect(
      await verifyPassword(
        "Recovered.Password!2026",
        (await app.db.user.findUniqueOrThrow({ where: { id: student.id } }))
          .passwordHash,
      ),
    ).toBe(true);
    await expect(
      app.identity.recover(raw, "Cannot.Reuse!2026.Password", response, null),
    ).rejects.toThrow(/expired/);
    expect(await app.db.capturedEmail.count()).toBe(0);
  });
  it("shares authentication limits across independent server instances", async () => {
    const first = new RateLimiter(),
      second = new RateLimiter();
    await first.shared(fixture.app.db, "pilot-limit", 2);
    await second.shared(fixture.app.db, "pilot-limit", 2);
    await expect(
      first.shared(fixture.app.db, "pilot-limit", 2),
    ).rejects.toThrow(/Too many/);
  });
});
