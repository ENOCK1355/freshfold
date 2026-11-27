import type { DB, TX } from "./database.js";
import type { Config } from "./config.js";
import { ensure } from "./config.js";
import { token } from "./security.js";
export const DAY = 86400000;
export class BusinessClock {
  constructor(
    public db: DB,
    public config: Config,
  ) {}
  async now(db: DB | TX = this.db) {
    if (this.config.mode === "simulator" && this.config.env !== "production") {
      const s = await db.setting.findUnique({ where: { key: "demo.clock" } });
      if (s) return new Date(s.value as string);
    }
    return new Date();
  }
  async runId(db: DB | TX = this.db) {
    const s = await db.setting.findUnique({ where: { key: "demo.run" } });
    return (s?.value as string) || `${this.config.env}-unseeded`;
  }
  async startRun() {
    ensure(
      this.config.env !== "production",
      403,
      "Demo runs are disabled in production.",
    );
    const value = `run-${new Date().toISOString().slice(0, 10)}-${token().slice(0, 8)}`;
    await this.db.setting.upsert({
      where: { key: "demo.run" },
      create: { key: "demo.run", value },
      update: { value },
    });
    return value;
  }
}
export const defaultRules = {
  commissionBps: 1200,
  convenienceFee: 300,
  sponsoredPrice: 5000,
  sponsoredDays: 7,
  gatewayBps: 0,
  gatewayBearer: "platform",
  partialRefundConvenience: false,
  commissionable: "laundry_only",
  productionPricesApproved: false,
};
export type Rules = typeof defaultRules;
export async function feeRules(db: DB | TX): Promise<Rules> {
  const row = await db.setting.findUnique({ where: { key: "finance.rules" } });
  return { ...defaultRules, ...(row?.value as object) };
}
