import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createApplication,
  type Application,
} from "../apps/api/src/application";
import { loadConfig } from "../apps/api/src/config";
import { openDatabase } from "../apps/api/src/database";
import type { Actor } from "../apps/api/src/security";

const config = loadConfig({
  env: "test",
  mode: "simulator",
  databaseDir: "memory://",
  dataRoot: ".data/test-payment-controls",
});
let database: Awaited<ReturnType<typeof openDatabase>>;
let app: Application;
let customer: Actor;
beforeAll(async () => {
  database = await openDatabase(config, true);
  app = createApplication(database.db, config);
  await app.initialize();
  const user = await app.db.user.findUniqueOrThrow({
    where: { id: "student-free" },
  });
  customer = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    verifiedAt: null,
    csrf: "test",
    sessionId: "test",
    permissions: [],
  };
});
afterAll(async () => {
  await database.close();
});
async function checkout() {
  const slot = (await app.market.slots("campus-linen")).find(
    (value) => value.available > 0,
  )!;
  const order = await app.market.book(customer, {
    companyId: "campus-linen",
    items: [{ serviceId: "campus-linen-wash", quantity: 4 }],
    slotId: slot.id,
    method: "pickup",
    address: {
      areaId: "amamoma",
      detail: "Payment controls test collection address",
    },
    idempotencyKey: crypto.randomUUID(),
  });
  return app.payments.checkout(customer, {
    kind: "order",
    orderId: order.id,
    idempotencyKey: crypto.randomUUID(),
  });
}
describe("interactive payment testing", () => {
  it("supports retries, pending, cancellation and duplicate success without email verification or duplicate ledger entries", async () => {
    const payment = await checkout();
    expect(
      (await app.payments.simulate(customer, payment.id, "declined")).status,
    ).toBe("failed");
    expect(
      (await app.payments.simulate(customer, payment.id, "insufficient_funds"))
        .failureReason,
    ).toBe("insufficient funds");
    expect(
      (await app.payments.simulate(customer, payment.id, "pending")).status,
    ).toBe("pending");
    expect(
      (await app.payments.simulate(customer, payment.id, "cancelled")).status,
    ).toBe("cancelled");
    expect(
      (await app.payments.simulate(customer, payment.id, "declined")).status,
    ).toBe("failed");
    expect(
      (await app.payments.simulate(customer, payment.id, "duplicate")).status,
    ).toBe("success");
    await app.payments.simulate(customer, payment.id, "success");
    expect(
      await app.db.journal.count({ where: { paymentId: payment.id } }),
    ).toBe(1);
    expect(await app.db.capturedEmail.count()).toBe(0);
    expect(await app.db.authToken.count()).toBe(0);
  });
  it("keeps testing restricted to the payer and unavailable for live payments", async () => {
    const payment = await checkout();
    await expect(
      app.payments.simulate(
        { ...customer, id: "student-plus" },
        payment.id,
        "success",
      ),
    ).rejects.toMatchObject({ status: 403 });
    const live = createApplication(database.db, {
      ...config,
      env: "production",
      mode: "paystack_live",
    });
    await expect(
      live.payments.simulate(customer, payment.id, "success"),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await app.db.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .status,
    ).toBe("pending");
  });
});
