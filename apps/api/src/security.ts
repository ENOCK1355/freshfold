import {
  randomBytes,
  createHash,
  scrypt,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import type { DB, TX } from "./database.js";
import type { Config } from "./config.js";
import { AppError, ensure, registeredTestAccount } from "./config.js";
import { z } from "zod";

const scryptAsync = promisify(scrypt);
export const token = () => randomBytes(32).toString("hex");
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [method, salt, value] = stored.split(":");
  if (method !== "scrypt" || !salt || !value) return false;
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  const other = Buffer.from(value, "hex");
  return key.length === other.length && timingSafeEqual(key, other);
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const hmac = (secret: string, body: string) =>
  createHmac("sha512", secret).update(body).digest("hex");
export function verifyPaystackSignature(
  raw: string,
  header: string | undefined,
  legacy: string | undefined,
  config: Config,
  at = Date.now(),
) {
  // Paystack signs the raw request with the integration's secret key.
  // A separate internal signing secret must never disable this header.
  if (legacy)
    return (
      !!config.paystackSecret &&
      /^[0-9a-f]{128}$/i.test(legacy) &&
      equal(legacy.toLowerCase(), hmac(config.paystackSecret, raw))
    );
  if (header) {
    if (!config.webhookSecret) return false;
    const parts = header.split(",").map((s) => s.trim());
    const ts = parts.filter((s) => s.startsWith("t="));
    if (ts.length !== 1 || !/^t=\d+$/.test(ts[0])) return false;
    const t = ts[0].slice(2);
    if (Math.abs(at / 1000 - Number(t)) > 300) return false;
    const expected = hmac(config.webhookSecret, `${t}.${raw}`);
    return parts
      .filter((s) => s.startsWith("v1="))
      .some((s) => {
        const value = s.slice(s.indexOf(":") + 1);
        return /^[0-9a-f]{128}$/.test(value) && equal(value, expected);
      });
  }
  return false;
}
export const credentialsSchema = z.object({
  email: z.email().transform((s) => s.toLowerCase().trim()),
  password: z.string().min(12).max(128),
});
export type Actor = {
  id: string;
  name: string;
  email: string;
  role: string;
  verifiedAt: Date | null;
  companyId?: string;
  permissions: string[];
  csrf: string;
  sessionId: string;
  testAccount?: boolean;
};
const ownerPermissions = [
  "orders.read",
  "orders.write",
  "profile.write",
  "catalogue.write",
  "staff.write",
  "finance.read",
  "subscription.write",
  "promotions.write",
  "files.read",
];
export class AuthService {
  constructor(
    public db: DB,
    public config: Config,
  ) {}
  async actor(req: Request): Promise<Actor | null> {
    const raw = req.cookies?.ff_session;
    if (!raw) return null;
    const session = await this.db.session.findUnique({
      where: { tokenHash: hash(raw) },
      include: { user: { include: { memberships: true } } },
    });
    if (!session || session.expiresAt < new Date() || session.user.deletedAt)
      return null;
    const { user } = session;
    const m = user.memberships[0];
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verifiedAt: user.verifiedAt,
      companyId: m?.companyId,
      permissions:
        m?.role === "owner" ? ownerPermissions : m?.permissions || [],
      csrf: session.csrf,
      sessionId: session.id,
      testAccount: user.demoScenario === registeredTestAccount,
    };
  }
  need(actor: Actor | null, roles?: string[]): Actor {
    ensure(actor, 401, "Sign in to continue.");
    if (roles)
      ensure(
        roles.includes(actor.role),
        403,
        "You do not have permission to do that.",
      );
    return actor;
  }
  company(actor: Actor, companyId: string, permission: string) {
    if (actor.role === "admin") return;
    ensure(
      actor.companyId === companyId && actor.permissions.includes(permission),
      403,
      "This company record is outside your permissions.",
    );
  }
  async session(userId: string, res: Response, previous?: Actor | null) {
    if (previous)
      await this.db.session.deleteMany({ where: { id: previous.sessionId } });
    const raw = token(),
      csrf = token();
    await this.db.session.create({
      data: {
        userId,
        tokenHash: hash(raw),
        csrf,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    res.cookie("ff_session", raw, {
      httpOnly: true,
      secure: this.config.appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400000,
    });
    return { csrf };
  }
  async logout(actor: Actor | null, res: Response) {
    if (actor)
      await this.db.session.deleteMany({ where: { id: actor.sessionId } });
    res.clearCookie("ff_session", { path: "/" });
  }
  csrf(req: Request, actor: Actor | null) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
    const origin = req.get("origin");
    const allowed = new Set([
      this.config.appUrl,
      new URL(this.config.appUrl).origin,
    ]);
    if (this.config.env === "demo" || this.config.env === "test") {
      allowed.add("http://localhost:4000");
      allowed.add("http://127.0.0.1:4000");
      allowed.add("http://127.0.0.1:5173");
    }
    if (origin && !allowed.has(origin))
      throw new AppError(403, "Request origin is not allowed.");
    if (req.get("sec-fetch-site") === "cross-site")
      throw new AppError(403, "Cross-site requests are not allowed.");
    if (actor && !equal(req.get("x-csrf-token") || "", actor.csrf))
      throw new AppError(
        403,
        "Your session changed. Refresh the page and try again.",
        { code: "CSRF_TOKEN_INVALID" },
      );
  }
}
export async function audit(
  db: DB | TX,
  actorId: string,
  action: string,
  targetId: string,
  reason?: string,
) {
  await db.auditEvent.create({ data: { actorId, action, targetId, reason } });
}
export class RateLimiter {
  async shared(db: DB, key: string, limit: number, window = 60000) {
    const id = hash(key),
      now = new Date(),
      expires = new Date(Date.now() + window);
    const records = await db.$queryRaw<Array<{ n: number }>>`
      INSERT INTO "RateLimit" ("key", "n", "expiresAt") VALUES (${id}, 1, ${expires})
      ON CONFLICT ("key") DO UPDATE SET
      "n" = CASE WHEN "RateLimit"."expiresAt" <= ${now} THEN 1 ELSE "RateLimit"."n" + 1 END,
      "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= ${now} THEN ${expires} ELSE "RateLimit"."expiresAt" END
      RETURNING "n"`;
    ensure(
      records[0].n <= limit,
      429,
      "Too many attempts. Please wait a minute and try again.",
    );
  }
  entries = new Map<string, { n: number; until: number }>();
  check(key: string, limit = 100, window = 60000) {
    const now = Date.now();
    let e = this.entries.get(key);
    if (!e || e.until < now) {
      e = { n: 0, until: now + window };
      this.entries.set(key, e);
    }
    if (++e.n > limit)
      throw new AppError(
        429,
        "Too many attempts. Please wait a minute and try again.",
      );
    if (this.entries.size > 10000)
      for (const [k, v] of this.entries)
        if (v.until < now) this.entries.delete(k);
  }
}
