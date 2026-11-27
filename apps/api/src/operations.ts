import { z } from "zod";
import { money } from "../../../packages/shared/src/index.js";
import { BusinessClock, feeRules } from "./clock.js";
import type { Config } from "./config.js";
import { ensure, requireValue } from "./config.js";
import type { DB } from "./database.js";
import { atomic } from "./database.js";
import { listingState, publicListingWhere } from "./company-listing.js";
import type { FinanceService } from "./finance.js";
import type { NotificationService } from "./notifications.js";
import { pageRequest } from "./pagination.js";
import {
  type Actor,
  AuthService,
  audit,
  hashPassword,
  token,
} from "./security.js";
export const companyUpdateSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().min(30).max(2000),
  location: z.string().min(5).max(200),
  primaryAreaId: z.string().min(1).optional(),
  registrationRef: z.string().min(5).max(100),
  pickup: z.boolean(),
  deliveryFee: z.number().int().min(0).max(100000),
  minimum: z.number().int().min(0).max(100000),
  capacity: z.number().int().min(1).max(200),
  turnaroundHours: z.number().int().min(6).max(168),
  instantBooking: z.boolean(),
  areas: z.array(z.string()).min(1).max(30),
});
export class OperationsService {
  constructor(
    public db: DB,
    public config: Config,
    public auth: AuthService,
    public clock: BusinessClock,
    public notifications: NotificationService,
    public finance: FinanceService,
  ) {}
  async business(actor: Actor) {
    ensure(actor.companyId, 403, "A company account is required.");
    const c = requireValue(
      await this.db.company.findUnique({
        where: { id: actor.companyId },
        include: {
          services: true,
          areas: { include: { area: true } },
          hours: true,
          closures: true,
          branches: true,
          memberships: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          subscriptions: { include: { plan: true } },
          files: {
            where: { NOT: { key: { contains: "/photos/" } } },
            select: { id: true, name: true, status: true, createdAt: true },
          },
          campaigns: true,
          reviews: { include: { user: { select: { name: true } } } },
        },
      }),
    );
    const {
      settlementDestination,
      paystackSubaccount,
      memberships,
      subscriptions,
      ...rest
    } = c;
    const isOwner = actor.permissions.includes("finance.read");
    return {
      ...rest,
      files: actor.permissions.includes("files.read") ? c.files : [],
      verificationReady: c.files.some(
        (file) =>
          ["sanitized", "scanned"].includes(file.status) ||
          (this.config.mode === "simulator" && file.status === "demo_sample"),
      ),
      listing: listingState(c, this.config, await this.clock.now()),
      ...(isOwner
        ? {
            settlementDestination,
            paystackSubaccount,
            memberships,
            subscriptions,
          }
        : { memberships: [], subscriptions: [] }),
    };
  }
  async companies() {
    const now = await this.clock.now();
    const companies = await this.db.company.findMany({
      include: {
        files: {
          where: { NOT: { key: { contains: "/photos/" } } },
          select: { id: true, name: true, status: true },
        },
        memberships: {
          include: { user: { select: { id: true, name: true } } },
        },
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: "desc" },
        },
        services: { select: { active: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return companies.map((company) => ({
      ...company,
      listing: listingState(company, this.config, now),
    }));
  }
  async businessOverview(actor: Actor) {
    this.auth.company(actor, actor.companyId || "", "orders.read");
    const [groups, services, finance] = await Promise.all([
      this.db.order.groupBy({
        by: ["status"],
        where: { companyId: actor.companyId },
        _count: { _all: true },
      }),
      this.db.service.count({
        where: { companyId: actor.companyId, active: true },
      }),
      actor.permissions.includes("finance.read")
        ? this.finance.summary(actor)
        : Promise.resolve(null),
    ]);
    const states = Object.fromEntries(
      groups.map((group) => [group.status, group._count._all]),
    );
    return {
      totalOrders: groups.reduce(
        (total, group) => total + group._count._all,
        0,
      ),
      activeOrders: groups
        .filter((group) => !["completed", "cancelled"].includes(group.status))
        .reduce((total, group) => total + group._count._all, 0),
      completedOrders: states.completed || 0,
      services,
      finance,
      updatedAt: await this.clock.now(),
    };
  }
  async customers(actor: Actor) {
    this.auth.company(actor, actor.companyId || "", "orders.read");
    const where = { companyId: actor.companyId };
    const groups = await this.db.order.groupBy({
      by: ["userId"],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const users = await this.db.user.findMany({
      where: { id: { in: groups.map((group) => group.userId) } },
      select: { id: true, name: true },
    });
    const recent = await this.db.order.findMany({
      where,
      distinct: ["userId"],
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, userId: true },
    });
    return groups
      .map((group) => ({
        id: group.userId,
        name:
          users.find((user) => user.id === group.userId)?.name || "Customer",
        count: group._count._all,
        last: group._max.createdAt,
        order: recent.find((order) => order.userId === group.userId)?.id,
      }))
      .sort((a, b) => (b.last?.getTime() || 0) - (a.last?.getTime() || 0));
  }
  async updateBusiness(
    actor: Actor,
    input: z.infer<typeof companyUpdateSchema>,
  ) {
    this.auth.company(actor, actor.companyId!, "profile.write");
    const { areas, ...data } = input;
    if (input.primaryAreaId)
      requireValue(
        await this.db.area.findFirst({
          where: { id: input.primaryAreaId, active: true },
        }),
        "Choose a configured business area.",
      );
    for (const id of areas)
      requireValue(
        await this.db.area.findUnique({ where: { id } }),
        "A selected service area is not configured.",
      );
    return atomic(this.db, async (tx) => {
      await tx.companyArea.deleteMany({
        where: { companyId: actor.companyId },
      });
      const c = await tx.company.update({
        where: { id: actor.companyId },
        data: {
          ...data,
          areas: { create: areas.map((areaId) => ({ areaId })) },
        },
      });
      await audit(
        tx,
        actor.id,
        "company.profile",
        c.id,
        "Owner updated public business details.",
      );
      return { id: c.id, updated: true };
    });
  }
  async publish(actor: Actor) {
    this.auth.company(actor, actor.companyId!, "profile.write");
    const c = requireValue(
      await this.db.company.findUnique({
        where: { id: actor.companyId },
        include: {
          services: { where: { active: true } },
          hours: true,
          areas: true,
        },
      }),
    );
    ensure(
      c.status === "approved",
      409,
      "Administrator approval is required before publication.",
    );
    const now = await this.clock.now();
    ensure(
      await this.db.subscription.findFirst({
        where: { companyId: c.id, status: "active", endsAt: { gt: now } },
      }),
      409,
      "Purchase an active hosting subscription before publishing.",
    );
    ensure(
      c.services.length && c.hours.length && c.areas.length && c.primaryAreaId,
      409,
      "Add services, opening hours, your business area, and collection coverage first.",
    );
    if (this.config.mode !== "simulator")
      ensure(
        (this.config.env !== "production" || !c.demo) &&
          c.paymentAccountApproved &&
          c.paystackSubaccount &&
          c.photo,
        409,
        "Genuine business details, approved photography, and payment-account approval are required for production.",
      );
    await audit(this.db, actor.id, "company.publish", c.id);
    return this.db.company.update({
      where: { id: c.id },
      data: { published: true },
      select: { slug: true, published: true },
    });
  }
  async application(actor: Actor, id: string, status: string, reason: string) {
    ensure(actor.role === "admin", 403, "Administrator access required.");
    ensure(
      ["approved", "rejected", "suspended", "pending"].includes(status),
      400,
      "Choose an application state.",
    );
    const company = requireValue(
      await this.db.company.findUnique({
        where: { id },
        include: { files: true },
      }),
    );
    if (status === "approved") {
      ensure(
        company.files
          .filter((f) => !f.key.includes("/photos/"))
          .some((f) =>
            this.config.env !== "production"
              ? ["demo_sample", "clean", "sanitized"].includes(f.status)
              : ["clean", "sanitized"].includes(f.status),
          ),
        409,
        "Review a scanned PDF or processed document photograph before approval.",
      );
    }
    const now = await this.clock.now();
    await audit(this.db, actor.id, `company.${status}`, id, reason);
    const c = await this.db.company.update({
      where: { id },
      data: {
        status,
        ...(status === "approved"
          ? { verifiedAt: now, verificationNote: reason }
          : {}),
      },
    });
    const owners = await this.db.membership.findMany({
      where: { companyId: id, role: "owner" },
    });
    for (const o of owners)
      await this.notifications.notify(
        o.userId,
        "Application update",
        `${company.name}: ${status}. ${reason}`,
        "/business/onboarding",
      );
    return { id: c.id, status: c.status };
  }
  async service(
    actor: Actor,
    input: {
      id?: string;
      name: string;
      category: string;
      description: string;
      unit: string;
      price: number;
      active: boolean;
      estimated?: boolean;
    },
  ) {
    this.auth.company(actor, actor.companyId!, "catalogue.write");
    const { id, ...data } = input;
    if (id) {
      const s = requireValue(
        await this.db.service.findUnique({ where: { id } }),
      );
      this.auth.company(actor, s.companyId, "catalogue.write");
      return this.db.service.update({
        where: { id },
        data: {
          ...data,
          versions:
            s.price !== data.price
              ? { create: { price: data.price } }
              : undefined,
        },
      });
    }
    return this.db.service.create({
      data: {
        ...data,
        companyId: actor.companyId!,
        versions: { create: { price: data.price } },
      },
    });
  }
  async staff(
    actor: Actor,
    input: {
      name: string;
      email: string;
      password: string;
      permissions: string[];
    },
  ) {
    this.auth.company(actor, actor.companyId!, "staff.write");
    const allowed = [
      "orders.read",
      "orders.write",
      "catalogue.write",
      "files.read",
    ];
    ensure(
      input.permissions.every((p) => allowed.includes(p)),
      400,
      "Staff cannot receive owner-only financial, settlement, or subscription permissions.",
    );
    const now = await this.clock.now();
    const subscription = requireValue(
      await this.db.subscription.findFirst({
        where: {
          companyId: actor.companyId,
          status: "active",
          endsAt: { gt: now },
        },
        include: { plan: true },
      }),
      "An active hosting plan is required for new staff seats.",
    );
    const seats = await this.db.membership.count({
      where: { companyId: actor.companyId },
    });
    ensure(
      seats < subscription.plan.staffSeats,
      409,
      "Your plan has no remaining staff seats.",
    );
    ensure(
      !(await this.db.user.findUnique({ where: { email: input.email } })),
      409,
      "This email already has an account.",
    );
    if (this.config.env === "production")
      ensure(
        !input.email.endsWith(".test"),
        400,
        "Production invitations need the staff member’s actual email.",
      );
    const passwordHash = await hashPassword(input.password);
    const user = await this.db.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: "staff",
        verifiedAt: this.config.env !== "production" ? now : null,
        demoScenario:
          ["demo", "test"].includes(this.config.env) &&
          this.config.mode === "simulator"
            ? "Company staff added during demo"
            : null,
        memberships: {
          create: {
            companyId: actor.companyId!,
            role: "staff",
            permissions: input.permissions,
          },
        },
      },
    });
    await audit(this.db, actor.id, "staff.created", user.id);
    return { id: user.id, name: user.name, email: user.email };
  }
  async ticket(
    actor: Actor | null,
    input: {
      name: string;
      subject: string;
      body: string;
      category: string;
      orderId?: string;
    },
  ) {
    if (input.orderId) {
      ensure(actor, 401, "Sign in to raise an order-specific case.");
      const order = requireValue(
        await this.db.order.findUnique({ where: { id: input.orderId } }),
      );
      ensure(
        order.userId === actor.id ||
          actor.role === "admin" ||
          actor.companyId === order.companyId,
        403,
        "This order belongs to another account.",
      );
    }
    const t = await this.db.ticket.create({
      data: {
        ...input,
        userId: actor?.id,
        reference: `FF-SUP-${token().slice(0, 8).toUpperCase()}`,
        createdAt: await this.clock.now(),
      },
    });
    if (actor)
      await this.notifications.notify(
        actor.id,
        "Support request received",
        `Your reference is ${t.reference}.`,
        actor.companyId
          ? "/business/support"
          : ["admin", "support"].includes(actor.role)
            ? "/admin/support"
            : "/account/support",
      );
    await this.notifications.admins(
      "New support request",
      `${input.name}: ${input.subject}`,
      "/admin/support",
    );
    return { id: t.id, reference: t.reference, status: t.status };
  }
  async tickets(actor: Actor, query: Record<string, string> = {}) {
    const where = {
      ...(["admin", "support"].includes(actor.role)
        ? {}
        : { userId: actor.id }),
      ...(query.status && query.status !== "all"
        ? { status: query.status }
        : {}),
    };
    const page =
      query.paged === "true"
        ? pageRequest(query, await this.db.ticket.count({ where }))
        : null;
    const items = await this.db.ticket.findMany({
      where,
      include: { events: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page?.limit || 100,
      skip: page?.skip || 0,
    });
    if (!page) return items;
    const { skip, ...metadata } = page;
    return { ...metadata, items };
  }
  async replyTicket(actor: Actor, id: string, body: string, status?: string) {
    const t = requireValue(await this.db.ticket.findUnique({ where: { id } }));
    ensure(
      ["admin", "support"].includes(actor.role) || t.userId === actor.id,
      403,
      "This support case belongs to another account.",
    );
    if (status)
      ensure(
        ["admin", "support"].includes(actor.role),
        403,
        "Only support can resolve cases.",
      );
    await this.db.ticketEvent.create({
      data: { ticketId: id, actorId: actor.id, body },
    });
    if (status) {
      await this.db.ticket.update({
        where: { id },
        data: {
          status,
          resolution: status === "resolved" ? body : undefined,
          assignedTo: actor.id,
        },
      });
      await audit(this.db, actor.id, `ticket.${status}`, id, body);
    }
    if (t.userId && t.userId !== actor.id) {
      const recipient = await this.db.user.findUnique({
        where: { id: t.userId },
        select: { role: true },
      });
      await this.notifications.notify(
        t.userId,
        "Your support case has an update",
        `There is a new response to ${t.reference}.`,
        ["owner", "staff"].includes(recipient?.role || "")
          ? "/business/support"
          : "/account/support",
      );
    } else if (!["admin", "support"].includes(actor.role))
      await this.notifications.admins(
        "Support case updated",
        `A customer has replied to ${t.reference}.`,
        "/admin/support",
      );
    return { saved: true };
  }
  setup() {
    return {
      environment: this.config.env,
      paymentMode: this.config.mode,
      credentials: {
        secret: !!this.config.paystackSecret,
        public: !!this.config.paystackPublic,
        webhook: !!this.config.paystackSecret,
        testEmail: !!this.config.testEmail,
      },
      webhookUrl: `${this.config.appUrl}/api/webhooks/paystack`,
      companyEmail: this.config.companyEmail,
      whatsapp: this.config.whatsapp,
      missing: [
        ...(this.config.mode !== "simulator" && !this.config.paystackSecret
          ? ["PAYSTACK_SECRET_KEY"]
          : []),
        ...((this.config.env === "production" || process.env.VERCEL) &&
        (!process.env.S3_BUCKET ||
          !process.env.S3_ACCESS_KEY_ID ||
          !process.env.S3_SECRET_ACCESS_KEY)
          ? ["Private S3-compatible file storage"]
          : []),
        ...(!this.config.appUrl.startsWith("https://")
          ? ["HTTPS APP_URL for public callback and webhook delivery"]
          : []),
      ],
      launchDependencies: [
        "Owner-approved registered business identity",
        "Production domain and HTTPS",
        "Ghana merchant approval and live keys",
        "Provider-approved company subaccounts and settlement arrangement",
        "Approved production prices and policies",
        "Genuine participating companies and approved image rights",
        "Configured service coverage and operational support staffing",
        "Private object storage and verification-document malware scanning",
        "Backup restoration and controlled live payment validation",
      ],
      notes:
        "Simulator and Paystack are independently configured server modes. No browser control can change this deployment into live payments.",
    };
  }
  async overview(actor: Actor) {
    ensure(
      ["admin", "support"].includes(actor.role),
      403,
      "Platform access required.",
    );
    const now = await this.clock.now();
    const [
      companies,
      listed,
      students,
      orders,
      pending,
      tickets,
      unpaid,
      finance,
    ] = await Promise.all([
      this.db.company.count(),
      this.db.company.count({ where: publicListingWhere(this.config, now) }),
      this.db.user.count({ where: { role: "student" } }),
      this.db.order.count(),
      this.db.company.count({ where: { status: "pending" } }),
      this.db.ticket.count({ where: { status: { not: "resolved" } } }),
      this.db.order.count({ where: { paymentStatus: "unpaid" } }),
      actor.role === "admin"
        ? this.finance.summary(actor)
        : Promise.resolve(null),
    ]);
    return {
      companies,
      listed,
      notListed: companies - listed,
      finance,
      students,
      orders,
      pending,
      tickets,
      unpaid,
      now,
      demo: this.config.env !== "production",
    };
  }
  async rules(actor: Actor, input: unknown) {
    ensure(actor.role === "admin", 403, "Administrator access required.");
    const schema = z.object({
      commissionBps: z.number().int().min(0).max(5000),
      convenienceFee: z.number().int().min(0).max(10000),
      sponsoredPrice: z.number().int().min(100).max(1000000),
      sponsoredDays: z.number().int().min(1).max(90),
      gatewayBps: z.number().int().min(0).max(1000),
      partialRefundConvenience: z.boolean(),
      productionPricesApproved: z.boolean().optional(),
    });
    const value = { ...(await feeRules(this.db)), ...schema.parse(input) };
    await audit(
      this.db,
      actor.id,
      "finance.rules",
      "finance.rules",
      `Commission ${value.commissionBps / 100}%; convenience ${money(value.convenienceFee)}. Applies only to future purchases.`,
    );
    return this.db.setting.upsert({
      where: { key: "finance.rules" },
      create: { key: "finance.rules", value },
      update: { value },
    });
  }
}
