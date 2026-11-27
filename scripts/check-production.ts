import { config as readEnv } from "dotenv";

const pilot = process.argv.includes("--pilot");
const expectedEnvironment = pilot ? "staging" : "production";
readEnv({ path: pilot ? ".env.staging" : ".env.production", quiet: true });
const { loadConfig } = await import("../apps/api/src/config.js");
const problems: string[] = [];
try {
  const config = loadConfig();
  if (config.env !== expectedEnvironment)
    problems.push(`Set APP_ENV=${expectedEnvironment}.`);
  if (new URL(config.appUrl).pathname !== "/")
    problems.push("APP_URL must be an HTTPS origin without a path.");
} catch (error) {
  problems.push(
    error instanceof Error ? error.message : "Invalid server configuration.",
  );
}
for (const key of [
  "APP_URL",
  "DATABASE_URL",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_PUBLIC_KEY",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "DATABASE_ENVIRONMENT_TAG",
  "CRON_SECRET",
  "FILE_LINK_SECRET",
])
  if (
    !process.env[key] ||
    /replace.me|example\.(com|invalid)|<[^>]+>/i.test(process.env[key]!)
  )
    problems.push(`Supply ${key} through the deployment environment.`);
for (const key of ["CRON_SECRET", "FILE_LINK_SECRET"])
  if (process.env[key] && process.env[key]!.length < 32)
    problems.push(`${key} must contain at least 32 characters.`);
if (
  process.env.DATABASE_ENVIRONMENT_TAG &&
  process.env.DATABASE_ENVIRONMENT_TAG !== expectedEnvironment
)
  problems.push(`DATABASE_ENVIRONMENT_TAG must equal ${expectedEnvironment}.`);
if (process.env.APP_URL && !process.env.APP_URL.startsWith("https://"))
  problems.push("APP_URL must be the public HTTPS website origin.");
if (process.env.S3_ENDPOINT && !process.env.S3_ENDPOINT.startsWith("https://"))
  problems.push("Use HTTPS for S3_ENDPOINT.");
if (
  !process.env.S3_ENDPOINT &&
  (!process.env.S3_REGION || process.env.S3_REGION === "auto")
)
  problems.push("Set the AWS S3 region, or supply a compatible S3_ENDPOINT.");
const keyPrefix = pilot ? "test" : "live";
if (
  process.env.PAYSTACK_PUBLIC_KEY &&
  !process.env.PAYSTACK_PUBLIC_KEY.startsWith(`pk_${keyPrefix}_`)
)
  problems.push(`PAYSTACK_PUBLIC_KEY must use the ${keyPrefix} environment.`);
if (problems.length) {
  console.error(
    `${pilot ? "Pilot" : "Production"} configuration needs attention:\n` +
      [...new Set(problems)].map((problem) => `- ${problem}`).join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    `${pilot ? "Pilot" : "Production"} environment format is valid. Complete provider connectivity checks and configure an authenticated once-per-minute maintenance scheduler before accepting orders.`,
  );
