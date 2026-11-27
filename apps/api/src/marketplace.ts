import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { transitions } from "../../../packages/shared/src/index.js";
import { BusinessClock, DAY, feeRules } from "./clock.js";
import { ensure, requireValue } from "./config.js";
import type { DB, TX } from "./database.js";
import { atomic, json } from "./database.js";
import { post } from "./finance.js";
import { publicListingWhere } from "./company-listing.js";
import { pageRequest } from "./pagination.js";
import type { NotificationService } from "./notifications.js";
import { type Actor, AuthService, audit, hash, token } from "./security.js";

export const bookingSchema = z.object({
  companyId: z.string(),
  items: z
    .array(
      z.object({
        serviceId: z.string(),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(20),
  slotId: z.string(),
  method: z.enum(["pickup", "dropoff"]),
  address: z.object({
    areaId: z.string(),
    detail: z.string().min(5).max(500),
    label: z.string().max(80).optional(),
  }),
  careNotes: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(8).max(100),
});
export type BookingInput = z.infer<typeof bookingSchema>;
const discoverySchema = z.object({
  area: z.string().trim().optional(),
  q: z.string().trim().max(150).optional(),
  service: z.string().trim().optional(),
  pickup: z.enum(["true", "false"]).optional(),
  open: z.enum(["true", "false"]).optional(),
  available: z.enum(["true", "false"]).optional(),
  turnaround: z.coerce.number().int().min(1).max(168).optional(),
  maxPrice: z.coerce.number().int().min(0).max(10000000).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  sort: z
    .enum(["recommended", "price", "fastest", "rating"])
    .default("recommended"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
const eligibleReviews = {
  status: "published",
  order: { status: "completed", source: { not: "seed" } },
} satisfies Prisma.ReviewWhereInput;
type ReviewSummary = { rating: number | null; count: number };
type Schedule = {
  hours: { day: number; open: string; close: string }[];
  closures: { date: Date }[];
};
function closedOn(company: Schedule, date: Date) {
  return company.closures.some(
    (c) =>
      c.date.toISOString().slice(0, 10) === date.toISOString().slice(0, 10),
  );
}
function openAt(company: Schedule, date: Date) {
  const time = date.toISOString().slice(11, 16);
  return (
    !closedOn(company, date) &&
    company.hours.some(
      (h) => h.day === date.getUTCDay() && h.open <= time && time < h.close,
    )
  );
}
function validWindow(
  company: Schedule,
  slot: { startsAt: Date; endsAt: Date },
) {
  const start = slot.startsAt.toISOString(),
    end = slot.endsAt.toISOString();
  return (
    !closedOn(company, slot.startsAt) &&
    start.slice(0, 10) === end.slice(0, 10) &&
    company.hours.some(
      (h) =>
        h.day === slot.startsAt.getUTCDay() &&
        h.open <= start.slice(11, 16) &&
        end.slice(11, 16) <= h.close &&
        slot.endsAt > slot.startsAt,
    )
  );
}
const publicCompanyInclude = {
  primaryArea: { select: { id: true, name: true } },
  areas: { include: { area: true } },
  services: { where: { active: true } },
  hours: true,
  closures: { select: { date: true } },
  branches: true,
  reviews: {
    where: eligibleReviews,
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" as const },
    take: 20,
  },
  subscriptions: { include: { plan: true } },
  campaigns: true,
} satisfies Prisma.CompanyInclude;
export class MarketplaceService {
  constructor(
    public db: DB,
    public clock: BusinessClock,
    public auth: AuthService,
    public notifications: NotificationService,
  ) {}
  async premium(userId: string, db: DB | TX = this.db) {
    return !!(await db.subscription.findFirst({
      where: {
        userId,
        companyId: null,
        status: "active",
        endsAt: { gt: await this.clock.now(db) },
        plan: { kind: "student", convenienceWaiver: true },
      },
    }));
  }
  async hosted(companyId: string, db: DB | TX = this.db) {
    return !!(await db.subscription.findFirst({
      where: {
        companyId,
        status: "active",
        endsAt: { gt: await this.clock.now(db) },
        plan: { kind: "hosting" },
      },
    }));
  }
  async companies(query: Record<string, string>) {
    const filters = discoverySchema.parse(query);
    const now = await this.clock.now();
    const rows = await this.db.company.findMany({
      where: {
        ...publicListingWhere(this.clock.config, now),
        services: {
          some: {
            active: true,
            ...(filters.service ? { category: filters.service } : {}),
          },
        },
        ...(filters.area ? { primaryAreaId: filters.area } : {}),
        ...(filters.q
          ? {
              OR: [
                { name: { contains: filters.q, mode: "insensitive" } },
                { description: { contains: filters.q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(filters.pickup === "true" ? { pickup: true } : {}),
        ...(filters.turnaround !== undefined
          ? { turnaroundHours: { lte: filters.turnaround } }
          : {}),
      },
      include: publicCompanyInclude,
    });
    const summaries = await this.reviewSummaries(rows.map((c) => c.id));
    let companies = rows.map((c) =>
      this.publicCompany(c, now, {
        service: filters.service,
        review: summaries.get(c.id),
      }),
    );
    if (filters.maxPrice !== undefined)
      companies = companies.filter((c) => c.startingPrice <= filters.maxPrice!);
    if (filters.rating !== undefined)
      companies = companies.filter(
        (c) => c.rating !== null && c.rating >= filters.rating!,
      );
    if (filters.open === "true") companies = companies.filter((c) => c.openNow);
    if (filters.available === "true" && companies.length) {
      const schedules = new Map(rows.map((c) => [c.id, c]));
      const slots = await this.db.slot.findMany({
        where: {
          companyId: { in: companies.map((c) => c.id) },
          startsAt: { gte: new Date(now.getTime() + 3600000) },
        },
      });
      const ids = new Set(
        slots
          .filter(
            (s) =>
              s.reserved < s.capacity &&
              validWindow(schedules.get(s.companyId)!, s),
          )
          .map((s) => s.companyId),
      );
      companies = companies.filter((c) => ids.has(c.id));
    }
    const sort = filters.sort;
    companies.sort(
      (a, b) =>
        (sort === "price"
          ? a.startingPrice - b.startingPrice
          : sort === "fastest"
            ? a.turnaroundHours - b.turnaroundHours
            : sort === "rating"
              ? (b.rating || 0) - (a.rating || 0)
              : Number(b.sponsored) - Number(a.sponsored)) ||
        a.name.localeCompare(b.name),
    );
    const total = companies.length;
    const pages = Math.ceil(total / 9);
    const page = Math.min(filters.page, Math.max(1, pages));
    const areaCounts: Record<string, number> = {};
    for (const c of companies)
      if (c.primaryAreaId)
        areaCounts[c.primaryAreaId] = (areaCounts[c.primaryAreaId] || 0) + 1;
    return {
      companies: companies.slice((page - 1) * 9, page * 9),
      total,
      page,
      pages,
      areaCounts,
      demo: this.clock.config.env !== "production",
    };
  }
  async reviewSummaries(companyIds: string[]) {
    if (!companyIds.length) return new Map<string, ReviewSummary>();
    const summaries = await this.db.review.groupBy({
      by: ["companyId"],
      where: { ...eligibleReviews, companyId: { in: companyIds } },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return new Map(
      summaries.map((r) => [
        r.companyId,
        { rating: r._avg.rating, count: r._count._all },
      ]),
    );
  }
  publicCompany(
    c: Prisma.CompanyGetPayload<{ include: typeof publicCompanyInclude }>,
    now: Date,
    options: { service?: string; review?: ReviewSummary } = {},
  ) {
    const services = c.services;
    const pricedServices = services
      .filter((s) => !options.service || s.category === options.service)
      .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.demo
        ? c.description.replace(
            /\b(?:demo|demonstration|fictional)\s+(?=(?:campus|business|company|laundry|garment))/gi,
            "",
          )
        : c.description,
      photo: c.photo,
      coverPhoto: c.coverPhoto,
      accent: c.accent,
      location: c.location,
      primaryAreaId: c.primaryAreaId,
      primaryArea: c.primaryArea,
      openNow: openAt(c, now),
      turnaroundHours: c.turnaroundHours,
      pickup: c.pickup,
      deliveryFee: c.deliveryFee,
      minimum: c.minimum,
      instantBooking: c.instantBooking,
      demo: c.demo,
      areas: c.areas.map((a) => a.area),
      hours: c.hours,
      branches: c.branches,
      services,
      startingPrice: pricedServices[0]?.price ?? 0,
      startingUnit: pricedServices[0]?.unit,
      verifiedAt: c.verifiedAt,
      rating: options.review?.rating ?? null,
      reviewCount: options.review?.count ?? 0,
      reviews: c.reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        text: r.text,
        response: r.response,
        createdAt: r.createdAt,
        name: r.user.name,
      })),
      sponsored: c.campaigns.some(
        (x) => x.status === "active" && x.startsAt <= now && x.endsAt > now,
      ),
    };
  }
  async company(slug: string) {
    const now = await this.clock.now();
    const c = requireValue(
      await this.db.company.findFirst({
        where: {
          OR: [{ slug }, { id: slug }],
          ...publicListingWhere(this.clock.config, now),
        },
        include: publicCompanyInclude,
      }),
      "This company is not currently available for new bookings.",
    );
    ensure(
      await this.hosted(c.id),
      404,
      "This company is not currently accepting new bookings.",
    );
    const summaries = await this.reviewSummaries([c.id]);
    return {
      ...this.publicCompany(c, now, { review: summaries.get(c.id) }),
      slots: await this.slots(c.id),
    };
  }
  async slots(companyId: string) {
    const now = await this.clock.now();
    const company = requireValue(
      await this.db.company.findUnique({
        where: { id: companyId },
        include: { hours: true, closures: { select: { date: true } } },
      }),
    );
    return this.db.slot
      .findMany({
        where: {
          companyId,
          startsAt: { gte: new Date(now.getTime() + 3600000) },
          reserved: { gte: 0 },
        },
        orderBy: { startsAt: "asc" },
      })
      .then((slots) =>
        slots
          .filter((s) => validWindow(company, s))
          .slice(0, 60)
          .map((s) => ({
            ...s,
            available: Math.max(0, s.capacity - s.reserved),
          })),
      );
  }
  async calculate(actor: Actor, input: BookingInput, db: DB | TX = this.db) {
    const company = requireValue(
      await db.company.findUnique({
        where: { id: input.companyId },
        include: {
          services: { where: { active: true } },
          areas: true,
          closures: true,
          hours: true,
        },
      }),
    );
    ensure(
      company.status === "approved" &&
        company.published &&
        (this.clock.config.mode === "simulator" ||
          (company.paymentAccountApproved && company.paystackSubaccount)) &&
        (this.clock.config.env !== "production" || !company.demo) &&
        (await this.hosted(company.id, db)),
      409,
      "This company is not currently accepting bookings.",
    );
    ensure(
      input.method !== "pickup" || company.pickup,
      400,
      "This company accepts drop-off orders only.",
    );
    ensure(
      company.areas.some((a) => a.areaId === input.address.areaId),
      400,
      "Your collection address is outside this company’s service area.",
    );
    const unique = new Set(input.items.map((i) => i.serviceId));
    ensure(
      unique.size === input.items.length,
      400,
      "Each service may appear only once in a quote.",
    );
    const items = input.items.map((item) => {
      const service = requireValue(
        company.services.find((s) => s.id === item.serviceId),
        "A selected service is no longer bookable.",
      );
      return {
        serviceId: service.id,
        name: service.name,
        unit: service.unit,
        unitPrice: service.price,
        quantity: item.quantity,
        lineTotal: service.price * item.quantity,
        estimated: service.estimated,
      };
    });
    const subtotal = items.reduce((n, i) => n + i.lineTotal, 0);
    ensure(
      subtotal >= company.minimum,
      400,
      `The minimum laundry charge is GHS ${(company.minimum / 100).toFixed(2)}.`,
    );
    const rules = await feeRules(db);
    const premium = await this.premium(actor.id, db);
    const convenienceFee = premium ? 0 : rules.convenienceFee;
    const deliveryFee = input.method === "pickup" ? company.deliveryFee : 0;
    const commission = Math.round((subtotal * rules.commissionBps) / 10000);
    const slot = requireValue(
      await db.slot.findUnique({ where: { id: input.slotId } }),
      "Choose an available collection window.",
    );
    const now = await this.clock.now(db);
    ensure(
      slot.companyId === company.id &&
        slot.startsAt >= new Date(now.getTime() + 3600000),
      409,
      "This collection window has passed its booking cutoff.",
    );
    ensure(
      !company.closures.some(
        (c) =>
          c.date.toISOString().slice(0, 10) ===
          slot.startsAt.toISOString().slice(0, 10),
      ),
      409,
      "The company is closed on this date.",
    );
    ensure(
      slot.reserved < slot.capacity,
      409,
      "This window has filled up. Please choose another.",
    );
    ensure(
      validWindow(company, slot),
      409,
      "This collection window is outside the company's opening hours. Choose another window.",
    );
    return {
      company,
      slot,
      items,
      subtotal,
      convenienceFee,
      deliveryFee,
      commission,
      companyShare: subtotal - commission,
      total: subtotal + convenienceFee + deliveryFee,
      premium,
      rules,
      estimated: items.some((i) => i.estimated),
      returnAt: new Date(
        slot.endsAt.getTime() + company.turnaroundHours * 3600000,
      ),
    };
  }
  async quote(actor: Actor, input: BookingInput) {
    const q = await this.calculate(actor, input);
    return {
      items: q.items,
      subtotal: q.subtotal,
      convenienceFee: q.convenienceFee,
      deliveryFee: q.deliveryFee,
      total: q.total,
      premium: q.premium,
      estimated: q.estimated,
      instantBooking: q.company.instantBooking,
      returnAt: q.returnAt,
    };
  }
  async book(actor: Actor, input: BookingInput) {
    const existing = await this.db.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      ensure(
        existing.userId === actor.id,
        403,
        "This booking belongs to another customer.",
      );
      return existing;
    }
    return atomic(this.db, async (tx) => {
      const q = await this.calculate(actor, input, tx);
      const now = await this.clock.now(tx);
      const capacity = await tx.slot.updateMany({
        where: { id: q.slot.id, reserved: { lt: q.slot.capacity } },
        data: { reserved: { increment: 1 } },
      });
      ensure(
        capacity.count === 1,
        409,
        "This window just filled up. Please select another.",
      );
      const code = String(
        100000 + (Number.parseInt(token().slice(0, 8), 16) % 900000),
      );
      const status = q.company.instantBooking ? "accepted" : "requested";
      const order = await tx.order.create({
        data: {
          reference: `FF-${now.getUTCFullYear()}-${token().slice(0, 6).toUpperCase()}`,
          idempotencyKey: input.idempotencyKey,
          userId: actor.id,
          companyId: q.company.id,
          slotId: q.slot.id,
          status,
          method: input.method,
          address: json(input.address),
          careNotes: input.careNotes,
          subtotal: q.subtotal,
          convenienceFee: q.convenienceFee,
          deliveryFee: q.deliveryFee,
          total: q.total,
          commission: q.commission,
          companyShare: q.companyShare,
          feeSnapshot: json({ ...q.rules, premium: q.premium }),
          reservedUntil: new Date(
            now.getTime() + (q.company.instantBooking ? 15 * 60000 : DAY),
          ),
          deliveryCodeHash: hash(code),
          runId: await this.clock.runId(tx),
          source:
            this.clock.config.mode === "simulator"
              ? "interactive"
              : this.clock.config.mode === "paystack_live"
                ? "paystack_live"
                : "paystack_test",
          createdAt: now,
          items: { create: q.items },
          events: {
            create: {
              status,
              actorId: actor.id,
              reason: q.company.instantBooking
                ? "Capacity reserved for 15 minutes."
                : "Awaiting company acceptance before payment.",
              createdAt: now,
            },
          },
        },
      });
      await this.notifications.notify(
        actor.id,
        "Your handover code",
        `Your private delivery confirmation code is ${code}. Share it only after you receive your garments.`,
        `/account/orders/${order.id}`,
        tx,
      );
      const owners = await tx.membership.findMany({
        where: { companyId: q.company.id, role: "owner" },
      });
      for (const m of owners)
        await this.notifications.notify(
          m.userId,
          "New laundry booking",
          `${order.reference} is ready for your attention.`,
          `/business/orders/${order.id}`,
          tx,
        );
      return order;
    });
  }
  canRead(actor: Actor, order: { userId: string; companyId: string }) {
    ensure(
      actor.id === order.userId ||
        ["admin", "support"].includes(actor.role) ||
        (actor.companyId === order.companyId &&
          actor.permissions.includes("orders.read")),
      403,
      "This order is outside your account or company.",
    );
  }
  private async orderScope(actor: Actor, query: Record<string, string>) {
    const where: Prisma.OrderWhereInput =
      actor.role === "admin" || actor.role === "support"
        ? {}
        : query.view === "business"
          ? (this.auth.company(actor, actor.companyId || "", "orders.read"),
            { companyId: actor.companyId })
          : { userId: actor.id };
    if (query.status === "active")
      where.status = { notIn: ["completed", "cancelled"] };
    else if (query.status) where.status = query.status;
    if (query.receipts === "true")
      where.payments = {
        some: { status: "success", mode: this.clock.config.mode },
      };
    if (query.calendar === "true") {
      const now = await this.clock.now();
      where.slot = {
        startsAt: {
          gte: new Date(now.getTime() - DAY),
          lt: new Date(now.getTime() + 15 * DAY),
        },
      };
      where.status = { not: "cancelled" };
    }
    if (query.run === "fresh") where.runId = await this.clock.runId();
    return where;
  }
  async orderPage(actor: Actor, query: Record<string, string>) {
    const where = await this.orderScope(actor, query);
    const page = pageRequest(query, await this.db.order.count({ where }));
    const rows = await this.db.order.findMany({
      where,
      include: {
        company: { select: { name: true, slug: true, photo: true } },
        slot: true,
        items: true,
        user: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: page.skip,
      take: page.limit,
    });
    const { skip, ...metadata } = page;
    return {
      ...metadata,
      items: rows.map(({ deliveryCodeHash: _code, ...order }) => order),
    };
  }
  async accountOverview(actor: Actor) {
    const [groups, payments, refunds] = await Promise.all([
      this.db.order.groupBy({
        by: ["status"],
        where: { userId: actor.id },
        _count: { _all: true },
      }),
      this.db.payment.aggregate({
        where: {
          userId: actor.id,
          kind: "order",
          status: "success",
          mode: this.clock.config.mode,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.db.refund.aggregate({
        where: {
          status: "processed",
          payment: { userId: actor.id, mode: this.clock.config.mode },
        },
        _sum: { amount: true },
      }),
    ]);
    return {
      totalOrders: groups.reduce(
        (total, group) => total + group._count._all,
        0,
      ),
      activeOrders: groups
        .filter((group) => !["completed", "cancelled"].includes(group.status))
        .reduce((total, group) => total + group._count._all, 0),
      completedOrders:
        groups.find((group) => group.status === "completed")?._count._all || 0,
      paid: payments._sum.amount || 0,
      refunded: refunds._sum.amount || 0,
      netPaid: (payments._sum.amount || 0) - (refunds._sum.amount || 0),
      transactions: payments._count._all,
    };
  }
  async orders(actor: Actor, query: Record<string, string>) {
    const where = await this.orderScope(actor, query);
    return this.db.order
      .findMany({
        where,
        include: {
          company: { select: { name: true, slug: true, photo: true } },
          slot: true,
          items: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: query.calendar === "true" ? undefined : 100,
      })
      .then((rows) => rows.map(({ deliveryCodeHash: _hash, ...r }) => r));
  }
  async order(actor: Actor, id: string) {
    const o = requireValue(
      await this.db.order.findFirst({
        where: { OR: [{ id }, { reference: id }] },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              photo: true,
              turnaroundHours: true,
            },
          },
          slot: true,
          items: true,
          events: { orderBy: { createdAt: "asc" } },
          payments: {
            select: {
              id: true,
              reference: true,
              status: true,
              amount: true,
              mode: true,
              providerFees: true,
              kind: true,
              createdAt: true,
            },
          },
          refunds: true,
          messages: {
            include: { user: { select: { name: true, role: true } } },
            orderBy: { createdAt: "asc" },
          },
          review: true,
          tickets: true,
          user: { select: { name: true } },
        },
      }),
    );
    this.canRead(actor, o);
    const { deliveryCodeHash: _code, ...rest } = o;
    const notice =
      actor.id === o.userId
        ? await this.db.notification.findFirst({
            where: {
              userId: actor.id,
              title: "Your handover code",
              href: `/account/orders/${o.id}`,
            },
          })
        : null;
    return {
      ...rest,
      handoverNotice: notice?.body,
      allowedTransitions:
        actor.role === "support"
          ? []
          : actor.id === o.userId
            ? o.status === "delivered"
              ? ["completed"]
              : ["requested", "accepted", "collection_scheduled"].includes(
                    o.status,
                  )
                ? ["cancelled"]
                : []
            : transitions[o.status] || [],
      canReview: actor.id === o.userId && o.status === "completed" && !o.review,
    };
  }
  async transition(
    actor: Actor,
    id: string,
    status: string,
    reason: string,
    code?: string,
  ) {
    return atomic(this.db, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${id} FOR UPDATE`;
      const o = requireValue(await tx.order.findUnique({ where: { id } }));
      this.canRead(actor, o);
      ensure(
        (transitions[o.status] || []).includes(status),
        409,
        `Cannot move an order from ${o.status} to ${status}.`,
      );
      const customer = actor.id === o.userId;
      if (customer)
        ensure(
          status === "completed" || status === "cancelled",
          403,
          "Customers can confirm receipt or request an eligible cancellation.",
        );
      else if (actor.role !== "admin")
        this.auth.company(actor, o.companyId, "orders.write");
      if (status === "cancelled")
        ensure(
          ["unpaid", "refunded"].includes(o.paymentStatus),
          409,
          "Paid orders need an authorised refund before cancellation.",
        );
      if (
        [
          "collected",
          "processing",
          "ready",
          "out_for_delivery",
          "delivered",
          "completed",
        ].includes(status)
      )
        ensure(
          ["paid", "partially_refunded", "refunded"].includes(o.paymentStatus),
          409,
          "Payment must be verified before fulfilment.",
        );
      if (status === "delivered" && !customer)
        ensure(
          code && hash(code) === o.deliveryCodeHash,
          400,
          "Ask the customer for the delivery confirmation code after handover.",
        );
      const now = await this.clock.now(tx);
      const data: Prisma.OrderUpdateInput = { status };
      if (status === "accepted")
        data.reservedUntil = new Date(now.getTime() + 15 * 60000);
      if (status === "completed") {
        data.completedAt = now;
        const refunds = await tx.refund.findMany({
          where: { orderId: id, status: "processed" },
        });
        const commission =
          o.commission - refunds.reduce((n, r) => n + r.commissionReversal, 0);
        const payment = await tx.payment.findFirst({
          where: { orderId: id, status: "success" },
        });
        if (commission > 0)
          await post(
            tx,
            {
              key: `complete-${id}`,
              description: "Commission earned on completed laundry service",
              paymentId: payment?.id,
              companyId: o.companyId,
              source: o.source,
              runId: o.runId,
              createdAt: now,
            },
            [
              { accountCode: "commission_deferred", debit: commission },
              { accountCode: "commission_revenue", credit: commission },
            ],
          );
      }
      if (status === "cancelled" && o.slotId && !o.reservationReleased) {
        await tx.slot.update({
          where: { id: o.slotId },
          data: { reserved: { decrement: 1 } },
        });
        data.reservationReleased = true;
      }
      const result = await tx.order.update({ where: { id }, data });
      await tx.orderEvent.create({
        data: {
          orderId: id,
          status,
          actorId: actor.id,
          reason,
          createdAt: now,
        },
      });
      await this.notifications.notify(
        o.userId,
        "Order updated",
        `${o.reference}: ${status.replaceAll("_", " ")}.`,
        `/account/orders/${id}`,
        tx,
      );
      await audit(tx, actor.id, "order.transition", id, `${status}: ${reason}`);
      return { id: result.id, status: result.status };
    });
  }
  async review(actor: Actor, id: string, rating: number, text: string) {
    const o = requireValue(await this.db.order.findUnique({ where: { id } }));
    ensure(
      o.userId === actor.id && o.status === "completed",
      403,
      "Only the customer of a completed order can leave a review.",
    );
    ensure(
      !(await this.db.review.findUnique({ where: { orderId: id } })),
      409,
      "This order already has a review.",
    );
    return this.db.review.create({
      data: {
        orderId: id,
        userId: actor.id,
        companyId: o.companyId,
        rating,
        text,
      },
    });
  }
  async message(actor: Actor, id: string, body: string) {
    const o = requireValue(await this.db.order.findUnique({ where: { id } }));
    this.canRead(actor, o);
    if (actor.companyId === o.companyId)
      ensure(
        actor.permissions.includes("orders.write"),
        403,
        "You need messaging permission for this order.",
      );
    return this.db.message.create({
      data: {
        orderId: id,
        userId: actor.id,
        body,
        createdAt: await this.clock.now(),
      },
    });
  }
  async proposeAdjustment(
    actor: Actor,
    id: string,
    weight: number,
    reason: string,
  ) {
    const order = requireValue(
      await this.db.order.findUnique({
        where: { id },
        include: { items: true },
      }),
    );
    this.auth.company(actor, order.companyId, "orders.write");
    ensure(
      ["collected", "processing"].includes(order.status) &&
        order.items.some((i) => i.estimated),
      409,
      "Only collected, estimated-weight orders can be adjusted.",
    );
    const estimated = order.items.filter((i) => i.estimated);
    ensure(
      estimated.length === 1,
      400,
      "Adjust one estimated weight-based service at a time.",
    );
    const item = estimated[0];
    const subtotal =
      order.subtotal - item.lineTotal + Math.round(item.unitPrice * weight);
    ensure(
      subtotal <= order.subtotal,
      409,
      "Additional-charge adjustments require an approved additional-payment integration before activation. Lower confirmed weights can be approved and refunded now.",
    );
    const adjustment = {
      confirmedWeight: weight,
      subtotal,
      refundDue: order.subtotal - subtotal,
      reason,
      status: "awaiting_customer",
    };
    await this.db.order.update({
      where: { id },
      data: { quoteAdjustment: adjustment },
    });
    await this.notifications.notify(
      order.userId,
      "Confirm your weighed laundry",
      `Review the confirmed weight and price adjustment for ${order.reference}.`,
      `/account/orders/${id}`,
    );
    return adjustment;
  }
}
