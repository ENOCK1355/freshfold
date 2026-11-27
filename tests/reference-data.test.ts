import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApplication } from "../apps/api/src/application";
import { loadConfig } from "../apps/api/src/config";
import { openDatabase } from "../apps/api/src/database";
import { initializeReferenceData } from "../apps/api/src/reference-data";

const local = loadConfig({
  env: "test",
  mode: "simulator",
  databaseDir: "memory://",
  dataRoot: ".data/test-reference",
});
let database: Awaited<ReturnType<typeof openDatabase>>;
beforeAll(async () => {
  database = await openDatabase(local, true);
});
afterAll(async () => {
  await database.close();
});

describe("production reference initialization", () => {
  it("prepares a new marketplace without synthetic customers, businesses, or transactions", async () => {
    const production = {
      ...local,
      env: "production" as const,
      mode: "paystack_live" as const,
    };
    await createApplication(database.db, production).initialize();
    expect(await database.db.user.count()).toBe(0);
    expect(await database.db.company.count()).toBe(0);
    expect(await database.db.order.count()).toBe(0);
    expect(await database.db.review.count()).toBe(0);
    expect(await database.db.ledgerAccount.count()).toBeGreaterThan(10);
    expect(await database.db.area.count()).toBe(6);
    expect(await database.db.plan.count()).toBe(4);
    const content = await database.db.contentPage.findMany();
    expect(content.length).toBeGreaterThanOrEqual(13);
    expect(
      content.every(
        (page) =>
          !/demonstration|fictional|\bdemo\b|simulator/i.test(page.body),
      ),
    ).toBe(true);
  });
  it("preserves an administrator's prices and published copy on restart", async () => {
    await database.db.plan.update({
      where: { id: "growth" },
      data: { price: 19500 },
    });
    await database.db.contentPage.update({
      where: { slug: "about" },
      data: { body: "Owner-approved company story." },
    });
    await initializeReferenceData(database.db, { ...local, env: "production", mode: "paystack_live" });
    expect(
      (await database.db.plan.findUniqueOrThrow({ where: { id: "growth" } }))
        .price,
    ).toBe(19500);
    expect(
      (
        await database.db.contentPage.findUniqueOrThrow({
          where: { slug: "about" },
        })
      ).body,
    ).toBe("Owner-approved company story.");
  });
  it("refuses to reuse a hosted database in another environment", async () => {
    await expect(initializeReferenceData(database.db, local)).rejects.toThrow("different environment");
  });
  it("refuses to run a seeded development database as a live marketplace", async () => {
    await database.db.setting.create({
      data: { key: "demo.seed_version", value: 1 },
    });
    const production = {
      ...local,
      env: "production" as const,
      mode: "paystack_live" as const,
    };
    await expect(
      createApplication(database.db, production).initialize(),
    ).rejects.toThrow("clean, separate database");
    expect(
      await database.db.setting.findUnique({
        where: { key: "demo.seed_version" },
      }),
    ).not.toBeNull();
  });
});
