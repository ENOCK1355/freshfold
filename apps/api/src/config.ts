import { config as loadEnvFile } from "dotenv";
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const registeredTestAccount = "Registered during demonstration";

export function loadConfig(overrides: Partial<Config> = {}): Config {
  let root = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (
      existsSync(path.join(root, "prisma", "schema.prisma")) &&
      existsSync(path.join(root, "package.json"))
    ) {
      process.chdir(root);
      loadEnvFile({ path: path.join(root, ".env"), quiet: true });
      break;
    }
    root = path.dirname(root);
  }
  const env = z
    .enum(["demo", "test", "staging", "production"])
    .parse(process.env.APP_ENV || "demo");
  const mode = z
    .enum(["simulator", "paystack_test", "paystack_live"])
    .parse(process.env.PAYMENT_MODE || "simulator");
  const config: Config = {
    env,
    mode,
    port: Number(process.env.PORT || 4000),
    appUrl: process.env.APP_URL || "http://localhost:5173",
    databaseUrl: process.env.DATABASE_URL,
    databaseDir: path.resolve(
      process.env.DATABASE_DIR || `.data/${env}/postgres`,
    ),
    dataRoot: path.resolve(
      process.env.DATA_ROOT ||
        (process.env.VERCEL
          ? "/tmp/freshfold"
          : process.env.DEMO_DATA_ROOT || `.data/${env}`),
    ),
    paystackSecret: process.env.PAYSTACK_SECRET_KEY,
    paystackPublic: process.env.PAYSTACK_PUBLIC_KEY,
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET,
    testEmail: process.env.PAYSTACK_TEST_EMAIL,
    companyEmail: process.env.COMPANY_EMAIL || "admin@freshfold.test",
    whatsapp: process.env.WHATSAPP_NUMBER || "233551234987",
    redis: process.env.REDIS_URL,
    ...overrides,
  };
  const appOrigin = new URL(config.appUrl);
  if (
    !["http:", "https:"].includes(appOrigin.protocol) ||
    appOrigin.pathname !== "/" ||
    appOrigin.search ||
    appOrigin.hash ||
    appOrigin.username ||
    appOrigin.password
  )
    throw new Error(
      "APP_URL must be the website origin without a path, credentials, query, or fragment.",
    );
  config.appUrl = appOrigin.origin;
  if (
    config.env === "production" &&
    (config.mode !== "paystack_live" || !config.databaseUrl)
  )
    throw new Error(
      "Production requires external PostgreSQL and PAYMENT_MODE=paystack_live. Demo tools are disabled.",
    );
  if (
    config.env !== "production" &&
    (config.mode === "paystack_live" ||
      config.paystackSecret?.startsWith("sk_live_") ||
      config.paystackPublic?.startsWith("pk_live_"))
  )
    throw new Error(
      "Live payment credentials are forbidden outside production.",
    );
  if (
    config.env === "production" &&
    (!config.paystackSecret?.startsWith("sk_live_") ||
      !config.appUrl.startsWith("https://"))
  )
    throw new Error(
      "Production requires a live secret key and an HTTPS APP_URL.",
    );
  if (
    config.mode === "paystack_test" &&
    config.paystackSecret &&
    !config.paystackSecret.startsWith("sk_test_")
  )
    throw new Error("Paystack test mode requires an actual sk_test_ key.");
  if (config.databaseUrl && process.env.DATABASE_ENVIRONMENT_TAG !== config.env)
    throw new Error(
      "Set DATABASE_ENVIRONMENT_TAG to the exact APP_ENV to confirm database isolation.",
    );
  if (config.env === "staging") {
    if (
      config.mode !== "paystack_test" ||
      !config.databaseUrl ||
      !config.appUrl.startsWith("https://") ||
      !config.paystackSecret?.startsWith("sk_test_")
    )
      throw new Error(
        "Staging requires a separate PostgreSQL database, HTTPS APP_URL, and Paystack test credentials. Simulator payments are disabled.",
      );
  }
  // Hosted databases may use fixed names such as neondb. Isolation is checked
  // through the explicit tag above and the immutable database marker at startup.
  return config;
}
export interface Config {
  env: "demo" | "test" | "staging" | "production";
  mode: "simulator" | "paystack_test" | "paystack_live";
  port: number;
  appUrl: string;
  databaseUrl?: string;
  databaseDir: string;
  dataRoot: string;
  paystackSecret?: string;
  paystackPublic?: string;
  webhookSecret?: string;
  testEmail?: string;
  companyEmail: string;
  whatsapp: string;
  redis?: string;
}
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function requireValue<T>(
  value: T | null | undefined,
  message = "Record not found",
): T {
  if (value == null) throw new AppError(404, message);
  return value;
}
export function ensure(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new AppError(status, message);
}
