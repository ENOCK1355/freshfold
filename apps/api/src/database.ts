import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import {
  mkdir,
  readFile,
  readdir,
  open,
  unlink,
  chmod,
  rmdir,
} from "node:fs/promises";
import path from "node:path";
import type { Config } from "./config.js";
export type DB = PrismaClient;
export type TX = Prisma.TransactionClient;
export async function openDatabase(config: Config, migrate = false) {
  let pg: PGlite | undefined;
  let release = async () => {};
  if (!config.databaseUrl && !config.databaseDir.startsWith("memory:")) {
    await mkdir(path.dirname(config.databaseDir), { recursive: true });
    const leasePath = `${config.databaseDir}.freshfold-lock`;
    const claimPath = `${leasePath}.claim`;
    try {
      await mkdir(claimPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST")
        throw new Error(
          "A demo database startup is already in progress. Retry after that process has finished.",
        );
      throw e;
    }
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const lease = await open(leasePath, "wx", 0o600);
          await lease.writeFile(
            JSON.stringify({
              pid: process.pid,
              createdAt: new Date().toISOString(),
            }),
          );
          release = async () => {
            await lease.close();
            await unlink(leasePath).catch(() => {});
          };
          break;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
          const prior = JSON.parse(await readFile(leasePath, "utf8")) as {
            pid: number;
          };
          let alive = true;
          try {
            process.kill(prior.pid, 0);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ESRCH") alive = false;
          }
          if (alive || attempt === 1)
            throw new Error(
              "This embedded demo database is already open. Stop the API before setup, reset, backup, or a second server.",
            );
          await unlink(leasePath);
        }
      }
    } finally {
      await rmdir(claimPath);
    }
    const releaseOnce = release;
    let released = false;
    release = async () => {
      if (released) return;
      released = true;
      await releaseOnce();
    };
    // OneDrive may mark directories ReadOnly. Emscripten interprets that Windows
    // display attribute as a POSIX write denial. Normalise only this exclusively
    // leased embedded cluster; do not change ACLs or any other workspace files.
    if (process.platform === "win32") {
      const writable = async (dir: string): Promise<void> => {
        await chmod(dir, 0o700);
        for (const entry of await readdir(dir, { withFileTypes: true }))
          if (entry.isDirectory()) await writable(path.join(dir, entry.name));
      };
      await mkdir(config.databaseDir, { recursive: true });
      await writable(config.databaseDir);
    }
    // The exclusive OS-process lease proves no other Fresh Fold process owns this
    // embedded cluster. Windows/OneDrive can leave the WASM Postgres PID file
    // after an interrupted restart; remove only that stale, known lock file.
    await unlink(path.join(config.databaseDir, "postmaster.pid")).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
      },
    );
  }
  let adapter;
  try {
    adapter = config.databaseUrl
      ? new PrismaPg({ connectionString: config.databaseUrl, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 })
      : new PrismaPGlite((pg = await PGlite.create(config.databaseDir)));
  } catch (e) {
    await release();
    throw e;
  }
  const db = new PrismaClient({
    adapter,
    transactionOptions: { maxWait: 20000, timeout: 30000 },
  });
  await db.$connect();
  if (migrate && pg) {
    await pg.exec(
      'CREATE TABLE IF NOT EXISTS "_FreshFoldMigration" ("name" text PRIMARY KEY, "appliedAt" timestamptz NOT NULL DEFAULT now())',
    );
    const dir = path.resolve("prisma/migrations");
    for (const name of (await readdir(dir)).sort()) {
      if (name.endsWith(".toml")) continue;
      const exists = await pg.query(
        'SELECT name FROM "_FreshFoldMigration" WHERE name=$1',
        [name],
      );
      if (exists.rows.length) continue;
      const sql = await readFile(path.join(dir, name, "migration.sql"), "utf8");
      await pg.transaction(async (t) => {
        await t.exec(sql);
        await t.query('INSERT INTO "_FreshFoldMigration" (name) VALUES ($1)', [
          name,
        ]);
      });
    }
  }
  await mkdir(config.dataRoot, { recursive: true });
  return {
    db,
    pg,
    close: async () => {
      try {
        await db.$disconnect();
        if (pg) await pg.close();
      } finally {
        await release();
      }
    },
  };
}
export async function atomic<T>(
  db: DB,
  fn: (tx: TX) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++)
    try {
      return await db.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (e) {
      if (
        attempt < 4 &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2034"
      )
        continue;
      throw e;
    }
}
export const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
