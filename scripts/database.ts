import { loadConfig, ensure } from "../apps/api/src/config.js";
import { openDatabase } from "../apps/api/src/database.js";
import { createApplication } from "../apps/api/src/application.js";
import { hashPassword } from "../apps/api/src/security.js";
import { initializeReferenceData } from "../apps/api/src/reference-data.js";
import { resolve, relative, isAbsolute } from "node:path";

const config = loadConfig();
const command = process.argv[2];
if (command === "reset") {
  ensure(
    config.env === "demo" && config.mode === "simulator" && !config.databaseUrl,
    403,
    "Reset is restricted to the explicitly configured local simulator database. Provider databases and production are never reset.",
  );
  ensure(
    process.argv.includes("--confirm-demo-reset"),
    400,
    "Reset deletes demo records. Run npm run demo:reset -- --confirm-demo-reset deliberately. External Paystack records are preserved.",
  );
  const root = resolve(".data/demo");
  const target = resolve(config.databaseDir);
  const rel = relative(root, target);
  ensure(
    !!rel && !rel.startsWith("..") && !isAbsolute(rel),
    403,
    "The configured reset target must remain inside .data/demo.",
  );
}
const database = await openDatabase(config, true);
try {
  if (command === "reset") {
    const result = await database.db.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_FreshFoldMigration','_prisma_migrations')`;
    const names = result
      .map((r) => '"' + r.tablename.replaceAll('"', '""') + '"')
      .join(",");
    if (names)
      await database.db.$executeRawUnsafe(`TRUNCATE TABLE ${names} CASCADE`);
  }
  if (["setup", "seed", "reset"].includes(command)) {
    ensure(
      config.env !== "production",
      403,
      "Seed commands cannot run in production.",
    );
    const app = createApplication(database.db, config);
    await app.initialize();
    console.log(
      "Demo ready. 8 fictional businesses, 12 students, company owners, staff, support, and administrator.",
    );
    console.log("Start: npm run dev | Accounts: http://localhost:5173/demo");
  } else if (command === "admin") {
    ensure(
      config.env === "production" || config.env === "staging",
      400,
      "First-administrator setup requires a configured staging or production environment.",
    );
    await initializeReferenceData(database.db, config);
    const email = process.env.ADMIN_EMAIL,
      password = process.env.ADMIN_PASSWORD;
    ensure(
      email && password && password.length >= 16,
      400,
      "Supply ADMIN_EMAIL and a unique ADMIN_PASSWORD of at least 16 characters in the process environment. No default credentials are created.",
    );
    ensure(
      (await database.db.user.count({ where: { role: "admin" } })) === 0,
      409,
      "An administrator already exists. Use the authorised account-management process.",
    );
    await database.db.user.create({
      data: {
        email: email.toLowerCase(),
        name: process.env.ADMIN_NAME || "Fresh Fold",
        passwordHash: await hashPassword(password),
        role: "admin",
        verifiedAt: new Date(),
      },
    });
    console.log(
      "First administrator created. Remove ADMIN_PASSWORD from your environment.",
    );
  } else console.log("Versioned database migrations are applied.");
} finally {
  await database.close();
}
