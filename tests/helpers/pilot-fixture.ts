import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Response } from "express";
import { createApplication } from "../../apps/api/src/application.js";
import { loadConfig, AppError } from "../../apps/api/src/config.js";
import { openDatabase } from "../../apps/api/src/database.js";
import { initializeReferenceData } from "../../apps/api/src/reference-data.js";
import { hashPassword, hmac, type Actor } from "../../apps/api/src/security.js";

export const pilotPassword = "Pilot.Fixture!2026.TestOnly";
export async function createPilotFixture(appUrl = "http://127.0.0.1:4111") {
  const root = await mkdtemp(path.join(tmpdir(), "freshfold-pilot-"));
  const config = loadConfig({
    env: "test",
    mode: "paystack_test",
    databaseUrl: undefined,
    databaseDir: "memory://",
    dataRoot: root,
    appUrl,
    paystackSecret: "sk_test_fixture_not_a_real_key",
    paystackPublic: "pk_test_fixture_not_a_real_key",
    testEmail: undefined,
  });
  const database = await openDatabase(config, true);
  const app = createApplication(database.db, config);
  await initializeReferenceData(database.db, config);
  await database.db.user.create({
    data: {
      id: "pilot-admin",
      name: "Pilot administrator",
      email: "admin@pilot.example",
      role: "admin",
      passwordHash: await hashPassword(pilotPassword),
    },
  });
  const transactions = new Map<string, any>(),
    subaccounts = new Map<string, any>();
  const refunds = new Map<string, any>();
  const calls: Array<{ route: string; method: string; body?: any }> = [];
  app.payments.provider = async (route, method = "GET", body?: any) => {
    calls.push({ route, method, body });
    if (route.startsWith("/bank?"))
      return [
        {
          name: "Ghana Fixture Bank",
          code: "GH001",
          active: true,
          currency: "GHS",
          type: "ghipss",
        },
      ];
    if (route === "/subaccount" && method === "POST") {
      const code = `ACCT_fixture${subaccounts.size + 1}`;
      const account = {
        subaccount_code: code,
        active: true,
        currency: "GHS",
        domain: "test",
        is_verified: false,
        account_name: body.business_name,
        account_number: body.account_number,
        settlement_bank: "Ghana Fixture Bank",
      };
      subaccounts.set(code, account);
      return account;
    }
    if (route.startsWith("/subaccount/")) {
      const account = subaccounts.get(route.split("/").pop()!);
      if (!account) throw new AppError(404, "Subaccount not found.");
      return account;
    }
    if (route === "/transaction/initialize") {
      transactions.set(body.reference, {
        ...body,
        id: 100000 + transactions.size,
        status: "pending",
        domain: "test",
        fees: 50,
        channel: "card",
      });
      return {
        authorization_url: `https://checkout.paystack.com/e2e-${body.reference}`,
        access_code: `fixture-${transactions.size}`,
      };
    }
    if (route.startsWith("/transaction/verify/")) {
      const transaction = transactions.get(
        decodeURIComponent(route.split("/").pop()!),
      );
      if (!transaction)
        throw new AppError(404, "Transaction reference not found");
      return transaction;
    }
    if (route === "/refund" && method === "POST") {
      const existing = [...refunds.values()].find(
        (refund) => refund.reference === body.reference,
      );
      if (existing)
        throw new AppError(502, "A refund with this reference already exists", {
          providerStatus: 409,
        });
      const transaction = transactions.get(body.transaction);
      const value = {
        id: `refund-${refunds.size + 1}`,
        status: "pending",
        reference: body.reference,
        amount: body.amount,
        currency: "GHS",
        domain: "test",
        transaction: transaction.id,
      };
      refunds.set(value.id, value);
      return value;
    }
    if (route.startsWith("/refund?")) {
      const reference = new URL("https://fixture" + route).searchParams.get(
        "reference",
      );
      return [...refunds.values()].filter(
        (value) => value.reference === reference,
      );
    }
    if (route.startsWith("/refund/"))
      return refunds.get(decodeURIComponent(route.split("/").pop()!));
    throw new Error(`Unexpected fixture provider request: ${route}`);
  };
  const response = { cookie() {}, clearCookie() {} } as unknown as Response;
  async function actor(id: string): Promise<Actor> {
    const user = await database.db.user.findUniqueOrThrow({
      where: { id },
      include: { memberships: true },
    });
    return {
      id,
      name: user.name,
      email: user.email,
      role: user.role,
      verifiedAt: null,
      csrf: "",
      sessionId: "",
      companyId: user.memberships[0]?.companyId,
      permissions:
        user.role === "owner"
          ? [
              "orders.read",
              "orders.write",
              "profile.write",
              "catalogue.write",
              "finance.read",
              "files.read",
              "subscription.write",
              "promotions.write",
              "staff.write",
            ]
          : [],
    };
  }
  async function settle(
    reference: string,
    changes: Record<string, unknown> = {},
  ) {
    const transaction = transactions.get(reference);
    if (!transaction) throw new Error("Unknown fixture reference.");
    Object.assign(transaction, { status: "success", ...changes });
    return transaction;
  }
  async function webhook(reference: string) {
    const transaction = transactions.get(reference);
    const raw = JSON.stringify({
      event: "charge.success",
      data: { id: transaction.id, reference },
    });
    await app.payments.webhook(
      raw,
      undefined,
      hmac(config.paystackSecret!, raw),
    );
    await app.jobs.tick();
  }
  return {
    app,
    database,
    config,
    response,
    actor,
    settle,
    webhook,
    calls,
    transactions,
    subaccounts,
    refunds,
    async close() {
      await database.close();
      if (
        path.dirname(root) !== tmpdir() ||
        !path.basename(root).startsWith("freshfold-pilot-")
      )
        throw new Error("Unexpected fixture directory.");
      await rm(root, { recursive: true, force: true });
    },
  };
}
