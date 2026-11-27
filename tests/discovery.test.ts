import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createApplication,
  type Application,
} from "../apps/api/src/application";
import { loadConfig, registeredTestAccount } from "../apps/api/src/config";
import { openDatabase } from "../apps/api/src/database";
import type { Actor } from "../apps/api/src/security";

let database: Awaited<ReturnType<typeof openDatabase>>, app: Application;
beforeAll(async () => {
  const config = loadConfig({
    env: "test",
    mode: "simulator",
    databaseUrl: undefined,
    databaseDir: "memory://",
    dataRoot: ".data/test-discovery",
  });
  database = await openDatabase(config, true);
  app = createApplication(database.db, config);
  await app.initialize();
});
afterAll(async () => {
  await database?.close();
});
const ids = (result: Awaited<ReturnType<Application["market"]["companies"]>>) =>
  result.companies.map((c) => c.id);

describe("laundry discovery filters", () => {
  it("uses the business's physical area rather than its collection coverage", async () => {
    const expected: Record<string, string[]> = {
      amamoma: ["campus-linen"],
      kwaprow: ["coastline"],
      "ucc-science": ["hallside"],
      ayensu: ["cape-fresh"],
      apewosika: [],
      diaspora: [],
    };
    for (const [area, companies] of Object.entries(expected)) {
      const result = await app.market.companies({ area });
      expect(ids(result), area).toEqual(companies);
      expect(result.companies.every((c) => c.primaryAreaId === area)).toBe(
        true,
      );
    }
    const coastline = await app.market.company("coastline");
    expect(coastline.areas.some((a) => a.id === "amamoma")).toBe(true);
    expect(coastline.primaryArea?.name).toBe("Kwaprow");
    expect(ids(await app.market.companies({ area: "unknown" }))).toEqual([]);
  });

  it("combines location, name, service, collection, turnaround, and price with AND", async () => {
    const filters = {
      area: "amamoma",
      q: "  CAMPUS LINEN  ",
      service: "wash-fold",
      pickup: "true",
      turnaround: "24",
      maxPrice: "1000",
    };
    expect(ids(await app.market.companies(filters))).toEqual(["campus-linen"]);
    expect(
      ids(await app.market.companies({ ...filters, area: "kwaprow" })),
    ).toEqual([]);
    expect(
      ids(await app.market.companies({ ...filters, maxPrice: "999" })),
    ).toEqual([]);
    expect(
      ids(await app.market.companies({ area: "ucc-science", pickup: "true" })),
    ).toEqual([]);
    expect(
      ids(await app.market.companies({ turnaround: "24", sort: "fastest" })),
    ).toEqual(["campus-linen", "hallside"]);
  });

  it("lets the business change its location independently of collection coverage", async () => {
    const c = await app.db.company.findUniqueOrThrow({
      where: { id: "campus-linen" },
      include: { areas: true, memberships: true },
    });
    const owner = {
      id: c.memberships[0].userId,
      companyId: c.id,
      role: "owner",
      permissions: ["profile.write"],
    } as Actor;
    const profile = {
      name: c.name,
      description: c.description,
      location: c.location,
      registrationRef: c.registrationRef,
      pickup: c.pickup,
      deliveryFee: c.deliveryFee,
      minimum: c.minimum,
      capacity: c.capacity,
      turnaroundHours: c.turnaroundHours,
      instantBooking: c.instantBooking,
      areas: c.areas.map((a) => a.areaId),
    };
    try {
      await app.ops.updateBusiness(owner, {
        ...profile,
        primaryAreaId: "kwaprow",
      });
      expect(ids(await app.market.companies({ area: "amamoma" }))).toEqual([]);
      expect(ids(await app.market.companies({ area: "kwaprow" }))).toContain(
        c.id,
      );
      expect((await app.market.company(c.id)).areas.map((a) => a.id)).toContain(
        "amamoma",
      );
      await expect(
        app.ops.updateBusiness(owner, {
          ...profile,
          primaryAreaId: "unconfigured",
        }),
      ).rejects.toThrow(/business area/);
    } finally {
      await app.ops.updateBusiness(owner, {
        ...profile,
        primaryAreaId: c.primaryAreaId!,
      });
    }
  });

  it("prices and sorts the selected service instead of an unrelated cheaper service", async () => {
    expect((await app.market.companies({ maxPrice: "1000" })).total).toBe(4);
    const wash = await app.market.companies({
      service: "wash-fold",
      maxPrice: "1000",
    });
    expect(ids(wash)).toEqual(["campus-linen"]);
    expect(wash.companies[0]).toMatchObject({
      startingPrice: 1000,
      startingUnit: "kg",
    });
    expect(
      (await app.market.companies({ service: "bedding", maxPrice: "1000" }))
        .total,
    ).toBe(0);
    const sorted = await app.market.companies({
      service: "wash-fold",
      sort: "price",
    });
    expect(sorted.companies.map((c) => c.startingPrice)).toEqual([
      1000, 1100, 1200, 1300,
    ]);
    expect(ids(await app.market.companies({ sort: "fastest" }))).toEqual([
      "campus-linen",
      "hallside",
      "cape-fresh",
      "coastline",
    ]);
    await expect(app.market.companies({ maxPrice: "NaN" })).rejects.toThrow();
    await expect(app.market.companies({ turnaround: "-1" })).rejects.toThrow();
  });

  it("honours closures, opening hours, and reserved capacity in availability and booking", async () => {
    const clock = await app.db.setting.findUniqueOrThrow({
      where: { key: "demo.clock" },
    });
    const slots = await app.db.slot.findMany({
      where: { companyId: "campus-linen" },
      orderBy: { startsAt: "asc" },
    });
    const hours = await app.db.operatingHour.findMany({
      where: { companyId: "campus-linen" },
    });
    const first = slots.find(
      (s) => s.startsAt > new Date("2026-11-23T11:00:00Z"),
    )!;
    const closureIds: string[] = [];
    try {
      await app.db.setting.update({
        where: { key: "demo.clock" },
        data: { value: "2026-11-23T10:00:00.000Z" },
      });
      expect(
        ids(await app.market.companies({ open: "true", available: "true" })),
      ).toContain("campus-linen");
      closureIds.push(
        (
          await app.db.closure.create({
            data: {
              companyId: "campus-linen",
              date: new Date("2026-11-23T00:00:00Z"),
              reason: "Closed for maintenance",
            },
          })
        ).id,
      );
      expect(ids(await app.market.companies({ open: "true" }))).not.toContain(
        "campus-linen",
      );
      // A closure today must not hide valid collection windows on later dates.
      expect(ids(await app.market.companies({ available: "true" }))).toContain(
        "campus-linen",
      );
      for (const slot of slots)
        await app.db.slot.update({
          where: { id: slot.id },
          data: { reserved: slot.capacity },
        });
      expect(
        ids(await app.market.companies({ available: "true" })),
      ).not.toContain("campus-linen");
      await app.db.slot.update({
        where: { id: first.id },
        data: { reserved: 0 },
      });
      closureIds.push(
        (
          await app.db.closure.create({
            data: {
              companyId: "campus-linen",
              date: new Date(
                first.startsAt.toISOString().slice(0, 10) + "T00:00:00Z",
              ),
              reason: "Closed collection day",
            },
          })
        ).id,
      );
      expect(
        ids(await app.market.companies({ available: "true" })),
      ).not.toContain("campus-linen");
      await app.db.closure.delete({ where: { id: closureIds.pop()! } });
      await app.db.operatingHour.updateMany({
        where: { companyId: "campus-linen" },
        data: { open: "20:00", close: "21:00" },
      });
      expect(
        ids(await app.market.companies({ available: "true" })),
      ).not.toContain("campus-linen");
      expect(await app.market.slots("campus-linen")).toEqual([]);
      await expect(
        app.market.quote({ id: "student-free" } as Actor, {
          companyId: "campus-linen",
          items: [{ serviceId: "campus-linen-wash", quantity: 2 }],
          slotId: first.id,
          method: "pickup",
          address: { areaId: "amamoma", detail: "North campus student hostel" },
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(/opening hours/);
    } finally {
      await app.db.closure.deleteMany({ where: { id: { in: closureIds } } });
      for (const h of hours)
        await app.db.operatingHour.update({
          where: { id: h.id },
          data: { open: h.open, close: h.close },
        });
      for (const s of slots)
        await app.db.slot.update({
          where: { id: s.id },
          data: { reserved: s.reserved },
        });
      await app.db.setting.update({
        where: { key: clock.key },
        data: { value: clock.value! },
      });
    }
  });

  it("sorts actual completed-order ratings and aggregates beyond the latest twenty reviews", async () => {
    const before = await app.market.companies({ sort: "rating" });
    expect(
      before.companies.every((c) => c.rating === null && c.reviewCount === 0),
    ).toBe(true);
    const customer = await app.db.user.create({
      data: {
        email: "discovery.rating@freshfold.test",
        name: "Rating Customer",
        passwordHash: "unused test fixture",
        demoScenario: registeredTestAccount,
      },
    });
    const template = await app.db.order.findFirstOrThrow({
      where: { companyId: "campus-linen", status: "completed" },
    });
    const {
      id: _id,
      reference: _ref,
      idempotencyKey: _key,
      ...base
    } = template;
    const orderIds: string[] = [];
    try {
      for (let i = 0; i < 23; i++) {
        const companyId = i === 22 ? "coastline" : "campus-linen";
        const order = await app.db.order.create({
          data: {
            ...base,
            companyId,
            slotId: null,
            reference: `FILTER-RATING-${i}`,
            idempotencyKey: crypto.randomUUID(),
            userId: customer.id,
            source: "interactive",
          },
        });
        orderIds.push(order.id);
        await app.db.review.create({
          data: {
            companyId,
            userId: customer.id,
            orderId: order.id,
            rating: i === 22 ? 5 : i % 2 ? 4 : 2,
            text: "Completed customer booking review.",
            status: "published",
          },
        });
      }
      const rated = await app.market.companies({ sort: "rating" });
      expect(ids(rated).slice(0, 2)).toEqual(["coastline", "campus-linen"]);
      expect(rated.companies[1]).toMatchObject({ rating: 3, reviewCount: 22 });
      expect(ids(await app.market.companies({ rating: "4" }))).toEqual([
        "coastline",
      ]);
      const detail = await app.market.company("campus-linen");
      expect(detail).toMatchObject({ rating: 3, reviewCount: 22 });
      expect(detail.reviews).toHaveLength(20);
    } finally {
      await app.db.review.deleteMany({ where: { orderId: { in: orderIds } } });
      await app.db.order.deleteMany({ where: { id: { in: orderIds } } });
      await app.db.user.delete({ where: { id: customer.id } });
    }
  });

  it("counts every located business for service-area cards before pagination", async () => {
    const now = await app.clock.now();
    const hosting = await app.db.subscription.findUniqueOrThrow({
      where: { id: "hosting-campus-linen" },
    });
    const added: string[] = [];
    try {
      for (let i = 0; i < 10; i++) {
        const c = await app.db.company.create({
          data: {
            name: `Area Count ${i}`,
            slug: `area-count-${i}`,
            description:
              "Local laundry company for service area count verification.",
            registrationRef: `AREA-COUNT-${i}`,
            location: "Amamoma",
            primaryAreaId: "amamoma",
            status: "approved",
            published: true,
            services: {
              create: {
                name: "Laundry",
                category: "wash-fold",
                description: "Wash and fold",
                unit: "load",
                price: 2000,
              },
            },
            subscriptions: {
              create: {
                userId: hosting.userId,
                planId: hosting.planId,
                status: "active",
                startsAt: now,
                endsAt: hosting.endsAt,
                priceSnapshot: hosting.priceSnapshot,
              },
            },
          },
        });
        added.push(c.id);
      }
      const first = await app.market.companies({});
      expect(first.total).toBe(14);
      expect(first.companies).toHaveLength(9);
      expect(first.areaCounts).toEqual({
        amamoma: 11,
        kwaprow: 1,
        "ucc-science": 1,
        ayensu: 1,
      });
      const second = await app.market.companies({ page: "2" });
      expect(second.companies).toHaveLength(5);
      expect(second.areaCounts).toEqual(first.areaCounts);
    } finally {
      await app.db.subscription.deleteMany({
        where: { companyId: { in: added } },
      });
      await app.db.service.deleteMany({ where: { companyId: { in: added } } });
      await app.db.company.deleteMany({ where: { id: { in: added } } });
    }
  });
});
