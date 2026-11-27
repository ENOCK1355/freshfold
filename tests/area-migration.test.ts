import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("backfills known business locations without guessing from shared collection coverage", async () => {
  const pg = await PGlite.create();
  try {
    await pg.exec(`
      CREATE TABLE "Area" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL);
      CREATE TABLE "Company" ("id" TEXT PRIMARY KEY, "location" TEXT NOT NULL);
      CREATE TABLE "CompanyArea" ("companyId" TEXT, "areaId" TEXT);
      INSERT INTO "Area" VALUES ('amamoma', 'Amamoma'), ('kwaprow', 'Kwaprow'), ('ucc-science', 'UCC Science');
      INSERT INTO "Company" VALUES ('known', 'Amamoma · near UCC'), ('science', 'UCC Science · campus'), ('single', 'Cape Coast'), ('unknown', 'Cape Coast'), ('ambiguous', 'Amamoma and Kwaprow');
      INSERT INTO "CompanyArea" VALUES ('known', 'amamoma'), ('known', 'kwaprow'), ('single', 'kwaprow'), ('unknown', 'amamoma'), ('unknown', 'kwaprow'), ('ambiguous', 'amamoma'), ('ambiguous', 'kwaprow');
    `);
    await pg.exec(
      await readFile(
        "prisma/migrations/202611240001_company_primary_area/migration.sql",
        "utf8",
      ),
    );
    const result = await pg.query<{ id: string; primaryAreaId: string | null }>(
      'SELECT "id", "primaryAreaId" FROM "Company"',
    );
    expect(
      Object.fromEntries(result.rows.map((r) => [r.id, r.primaryAreaId])),
    ).toEqual({
      known: "amamoma",
      science: "ucc-science",
      single: "kwaprow",
      unknown: null,
      ambiguous: null,
    });
    expect((await pg.query('SELECT * FROM "CompanyArea"')).rows).toHaveLength(
      7,
    );
  } finally {
    await pg.close();
  }
});
