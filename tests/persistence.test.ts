import { it, expect } from "vitest";
import { loadConfig } from "../apps/api/src/config";
import { openDatabase } from "../apps/api/src/database";
it("preserves actual PostgreSQL records across close/reopen and refuses simultaneous disk owners", async () => {
  const dir = `.data/test/persistence-${process.pid}-${Date.now()}`;
  const config = loadConfig({
    env: "test",
    mode: "simulator",
    databaseDir: dir,
    dataRoot: ".data/test",
  });
  const first = await openDatabase(config, true);
  await first.db.setting.create({
    data: { key: "persistence-proof", value: { persisted: true } },
  });
  await expect(openDatabase(config, true)).rejects.toThrow(/already open/);
  await first.close();
  const second = await openDatabase(config, true);
  expect(
    (
      await second.db.setting.findUniqueOrThrow({
        where: { key: "persistence-proof" },
      })
    ).value,
  ).toEqual({ persisted: true });
  await second.close();
}, 60000);
