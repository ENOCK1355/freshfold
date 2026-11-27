import type { Response } from "express";
import { z } from "zod";
import { ensure, registeredTestAccount, requireValue } from "./config.js";
import type { DB } from "./database.js";
import { atomic, json } from "./database.js";
import type { MarketplaceService } from "./marketplace.js";
import {
  type Actor,
  audit,
  AuthService,
  credentialsSchema,
  hashPassword,
  hash,
  token,
  verifyPassword,
} from "./security.js";
const registrationDetails = credentialsSchema.extend({
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .regex(/^(?:\+233|0)[235]\d{8}$/, "Enter a valid Ghanaian mobile number.")
    .optional(),
});
export const registrationSchema = z.preprocess(
  (value) =>
    value && typeof value === "object" && !("type" in value)
      ? { ...value, type: "student" }
      : value,
  z.discriminatedUnion("type", [
    registrationDetails.extend({ type: z.literal("student") }),
    registrationDetails.extend({
      type: z.literal("company"),
      companyName: z
        .string()
        .trim()
        .min(3, "Enter a business name with at least 3 characters.")
        .max(100),
      areaId: z.string().trim().min(1, "Choose your business area."),
    }),
  ]),
);
export class IdentityService {
  constructor(
    public db: DB,
    public auth: AuthService,
    public market: MarketplaceService,
  ) {}
  async changePassword(
    actor: Actor,
    current: string,
    password: string,
    res: Response,
  ) {
    const encoded = await hashPassword(password);
    await atomic(this.db, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${actor.id} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
      ensure(
        await verifyPassword(current, user.passwordHash),
        401,
        "Your current password is incorrect.",
      );
      await tx.user.update({
        where: { id: actor.id },
        data: { passwordHash: encoded },
      });
      await tx.session.deleteMany({ where: { userId: actor.id } });
      await tx.authToken.updateMany({
        where: { userId: actor.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await audit(tx, actor.id, "account.password_changed", actor.id);
    });
    await this.auth.session(actor.id, res);
    return { changed: true };
  }
  async recoveryLink(actor: Actor, id: string, reason: string) {
    ensure(actor.role === "admin", 403, "Administrator access required.");
    const user = requireValue(await this.db.user.findUnique({ where: { id } }));
    ensure(
      !user.deletedAt && !["admin", "support"].includes(user.role),
      403,
      "Platform accounts require the operator recovery procedure.",
    );
    const raw = token(),
      expiresAt = new Date(Date.now() + 30 * 60000);
    await atomic(this.db, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${id} FOR UPDATE`;
      await tx.authToken.updateMany({
        where: { userId: id, kind: "admin_recover", usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.authToken.create({
        data: { userId: id, kind: "admin_recover", hash: hash(raw), expiresAt },
      });
      await audit(tx, actor.id, "account.recovery_issued", id, reason);
    });
    return {
      url: `${this.auth.config.appUrl}/reset-password?token=${raw}`,
      expiresAt,
    };
  }
  async recover(
    raw: string,
    password: string,
    res: Response,
    actor: Actor | null,
  ) {
    const encoded = await hashPassword(password);
    const userId = await atomic(this.db, async (tx) => {
      const record = requireValue(
        await tx.authToken.findUnique({ where: { hash: hash(raw) } }),
        "This recovery link is invalid or expired. Contact support for a new link.",
      );
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${record.userId} FOR UPDATE`;
      const fresh = await tx.authToken.findUniqueOrThrow({
        where: { id: record.id },
        include: { user: true },
      });
      ensure(
        fresh.kind === "admin_recover" &&
          !fresh.usedAt &&
          fresh.expiresAt > new Date() &&
          !fresh.user.deletedAt,
        400,
        "This recovery link is invalid or expired. Contact support for a new link.",
      );
      await tx.user.update({
        where: { id: fresh.userId },
        data: { passwordHash: encoded },
      });
      await tx.authToken.updateMany({
        where: { userId: fresh.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: fresh.userId } });
      await audit(tx, fresh.userId, "account.recovered", fresh.userId);
      return fresh.userId;
    });
    await this.auth.session(userId, res, actor);
    return { recovered: true };
  }
  get testAccountsEnabled() {
    return (
      ["demo", "test"].includes(this.auth.config.env) &&
      this.auth.config.mode === "simulator"
    );
  }
  async register(
    input: z.infer<typeof registrationSchema>,
    res: Response,
    actor: Actor | null,
  ) {
    const existing = await this.db.user.findUnique({
      where: { email: input.email },
    });
    ensure(
      !existing,
      409,
      this.testAccountsEnabled &&
        existing?.demoScenario === registeredTestAccount
        ? "An account already exists for this email. Sign in and use Reset account in Settings to register again with the same details."
        : "An account already exists for this email. Sign in or contact support for help.",
    );
    if (input.type === "company") {
      ensure(
        input.companyName && input.areaId,
        400,
        "Enter your business name and service area.",
      );
      requireValue(
        await this.db.area.findUnique({ where: { id: input.areaId } }),
        "Select a configured service area.",
      );
    }
    const passwordHash = await hashPassword(input.password);
    const demo = this.testAccountsEnabled;
    const user = await atomic(this.db, async (tx) => {
      const u = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          role: input.type === "company" ? "owner" : "student",
          phone: input.phone,
          demoScenario: demo ? registeredTestAccount : undefined,
        },
      });
      if (input.type === "company") {
        const slug = input
          .companyName!.toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        const company = await tx.company.create({
          data: {
            name: input.companyName!,
            slug: `${slug}-${token().slice(0, 6)}`,
            description: `${input.companyName} provides laundry care around the University of Cape Coast. Complete your business profile before publication.`,
            registrationRef: demo
              ? `DEMO-REG-${token().slice(0, 8).toUpperCase()}`
              : "Pending owner submission",
            location: `${(await tx.area.findUniqueOrThrow({ where: { id: input.areaId } })).name} · Cape Coast`,
            primaryAreaId: input.areaId,
            demo,
            memberships: { create: { userId: u.id, role: "owner" } },
            areas: { create: { areaId: input.areaId! } },
            branches: {
              create: {
                name: "Main branch",
                address: "Address awaiting owner confirmation",
              },
            },
          },
        });
        await audit(
          tx,
          u.id,
          "company.application",
          company.id,
          "Business registered; verification pending.",
        );
        await this.market.notifications.admins(
          "New business application",
          `${company.name} has registered and needs verification.`,
          "/admin/companies",
          tx,
        );
      }
      return u;
    });
    await this.auth.session(user.id, res, actor);
    return { id: user.id, role: user.role };
  }
  async login(
    email: string,
    password: string,
    res: Response,
    actor: Actor | null,
  ) {
    const u = await this.db.user.findUnique({ where: { email } });
    const dummy = "scrypt:12b7c05af045568e:00";
    const valid = await verifyPassword(password, u?.passwordHash || dummy);
    ensure(u && valid && !u.deletedAt, 401, "Email or password is incorrect.");
    await this.auth.session(u.id, res, actor);
    await audit(this.db, u.id, "session.sign_in", u.id);
    return { signedIn: true };
  }
  async me(actor: Actor | null) {
    if (!actor) return { user: null };
    const premium = await this.market.premium(actor.id);
    return {
      user: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        role: actor.role,
        companyId: actor.companyId,
        permissions: actor.permissions,
        premium,
        csrf: actor.csrf,
        canResetTestAccount:
          this.testAccountsEnabled &&
          !!actor.testAccount &&
          ["student", "owner"].includes(actor.role),
      },
      environment: this.auth.config.env,
    };
  }
  async resetTestAccount(actor: Actor, password: string, res: Response) {
    ensure(this.testAccountsEnabled, 404, "That resource was not found.");
    const now = new Date();
    await atomic(this.db, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${actor.id} FOR UPDATE`;
      const user = requireValue(
        await tx.user.findUnique({ where: { id: actor.id } }),
      );
      ensure(!user.deletedAt, 409, "This account has already been reset.");
      ensure(
        user.demoScenario === registeredTestAccount &&
          ["student", "owner"].includes(user.role),
        403,
        "This account cannot be reset.",
      );
      ensure(
        await verifyPassword(password, user.passwordHash),
        401,
        "Your current password is incorrect.",
      );

      // Retain transaction history under the old ID and free the original email.
      // A new registration receives a new ID and no previous entitlements or data.
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: `retired-${token()}@accounts.freshfold.test`,
          name: "Closed account",
          phone: null,
          preferences: {},
          demoScenario: null,
          deletedAt: now,
        },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.authToken.deleteMany({ where: { userId: user.id } });
      await tx.address.deleteMany({ where: { userId: user.id } });
      await tx.favorite.deleteMany({ where: { userId: user.id } });
      await tx.recurringSchedule.deleteMany({ where: { userId: user.id } });
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.subscription.updateMany({
        where: { userId: user.id },
        data: { cancelAtEnd: true, renewalMethod: "manual" },
      });
      await tx.payment.updateMany({
        where: { userId: user.id, status: "pending", mode: "simulator" },
        data: { status: "cancelled", failureReason: "Account reset" },
      });

      const reservations = await tx.order.findMany({
        where: { userId: user.id, reservationReleased: false },
      });
      for (const order of reservations) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            reservationReleased: true,
            reservedUntil: null,
            ...(order.paymentStatus === "unpaid"
              ? { status: "cancelled" }
              : {}),
            events: {
              create: {
                status:
                  order.paymentStatus === "unpaid" ? "cancelled" : order.status,
                actorId: user.id,
                reason:
                  "Account reset; collection capacity released. Payment history retained.",
                createdAt: now,
              },
            },
          },
        });
        if (order.slotId)
          await tx.slot.update({
            where: { id: order.slotId },
            data: { reserved: { decrement: 1 } },
          });
      }
      const owned = await tx.membership.findMany({
        where: { userId: user.id, role: "owner", company: { demo: true } },
      });
      for (const membership of owned)
        await tx.company.update({
          where: { id: membership.companyId },
          data: {
            published: false,
            status: "suspended",
            verificationNote: "Owner reset their account.",
          },
        });
      await audit(
        tx,
        user.id,
        "account.test_reset",
        user.id,
        "Test account retired; original email released for a fresh registration.",
      );
    });
    res.clearCookie("ff_session", { path: "/" });
    return { reset: true };
  }
  async profile(actor: Actor) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        preferences: true,
        addresses: { include: { area: true } },
        favorites: {
          include: {
            company: {
              select: { id: true, slug: true, name: true, photo: true },
            },
          },
        },
        schedules: {
          include: { company: { select: { name: true, slug: true } } },
        },
      },
    });
    return user;
  }
  async saveProfile(
    actor: Actor,
    input: { name: string; phone?: string; preferences?: unknown },
  ) {
    return this.db.user.update({
      where: { id: actor.id },
      data: {
        name: input.name,
        phone: input.phone,
        preferences: input.preferences ? json(input.preferences) : undefined,
      },
      select: { id: true, name: true, phone: true, preferences: true },
    });
  }
  async subscriptions(actor: Actor) {
    return this.db.subscription.findMany({
      where:
        actor.companyId && actor.permissions.includes("subscription.write")
          ? {
              OR: [
                { userId: actor.id, companyId: null },
                { companyId: actor.companyId },
              ],
            }
          : { userId: actor.id, companyId: null },
      include: {
        plan: true,
        payment: {
          select: {
            id: true,
            reference: true,
            amount: true,
            status: true,
            mode: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
  async cancelSubscription(actor: Actor, id: string) {
    const s = requireValue(
      await this.db.subscription.findUnique({ where: { id } }),
    );
    ensure(
      s.userId === actor.id ||
        (s.companyId === actor.companyId &&
          actor.permissions.includes("subscription.write")),
      403,
      "This subscription belongs to another account.",
    );
    await audit(
      this.db,
      actor.id,
      "subscription.cancel",
      id,
      "Customer cancelled future renewal. Access remains through the paid period.",
    );
    return this.db.subscription.update({
      where: { id },
      data: { cancelAtEnd: true },
    });
  }
}
