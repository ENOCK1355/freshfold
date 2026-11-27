import type { Prisma } from "@prisma/client";
import type { DB, TX } from "./database.js";
import { atomic } from "./database.js";
import { ensure, requireValue } from "./config.js";
import type { BusinessClock } from "./clock.js";
import type { Actor } from "./security.js";

export const accounts = [
  ["cash", "Payment clearing", "asset"],
  ["company_payable", "Company allocations payable", "liability"],
  ["commission_deferred", "Unearned order commission", "liability"],
  ["commission_revenue", "Earned order commission", "revenue"],
  ["convenience_revenue", "Convenience fees", "revenue"],
  ["student_deferred", "Deferred Student Plus", "liability"],
  ["student_revenue", "Earned Student Plus", "revenue"],
  ["hosting_deferred", "Deferred company hosting", "liability"],
  ["hosting_revenue", "Earned company hosting", "revenue"],
  ["advertising_deferred", "Deferred sponsorship", "liability"],
  ["advertising_revenue", "Earned sponsorship", "revenue"],
  ["gateway_expense", "Recorded gateway costs", "expense"],
];
export interface Line {
  accountCode: string;
  debit?: number;
  credit?: number;
}
export async function post(
  tx: TX,
  params: {
    key: string;
    description: string;
    paymentId?: string;
    companyId?: string | null;
    source: string;
    runId: string;
    createdAt: Date;
  },
  lines: Line[],
) {
  const nonzero = lines.filter((l) => (l.debit || 0) + (l.credit || 0) > 0);
  ensure(
    nonzero.every(
      (l) =>
        Number.isSafeInteger(l.debit || 0) &&
        Number.isSafeInteger(l.credit || 0) &&
        (l.debit || 0) >= 0 &&
        (l.credit || 0) >= 0,
    ),
    500,
    "Ledger amounts must be non-negative integer pesewas.",
  );
  ensure(
    nonzero.reduce((a, l) => a + (l.debit || 0) - (l.credit || 0), 0) === 0,
    500,
    "Unbalanced ledger posting rejected.",
  );
  const exists = await tx.journal.findUnique({ where: { key: params.key } });
  if (exists) return exists;
  return tx.journal.create({ data: { ...params, lines: { create: nonzero } } });
}
const publicPaymentSelect = {
  id: true,
  reference: true,
  kind: true,
  amount: true,
  status: true,
  mode: true,
  source: true,
  providerFees: true,
  failureReason: true,
  createdAt: true,
  verifiedAt: true,
  orderId: true,
  userId: true,
  runId: true,
} as const;
export class FinanceService {
  constructor(
    public db: DB,
    public clock: BusinessClock,
  ) {}
  async report(actor: Actor, query: Record<string, string>, details = true) {
    const where: Prisma.JournalWhereInput = {};
    if (this.clock.config.mode !== "simulator")
      where.OR = [
        { payment: { mode: this.clock.config.mode } },
        { source: this.clock.config.mode },
      ];
    let dateRange: { gte?: Date; lt?: Date } | undefined;
    if (actor.role !== "admin") {
      ensure(
        actor.companyId && actor.permissions.includes("finance.read"),
        403,
        "Financial reports require owner permission.",
      );
      where.companyId = actor.companyId;
    }
    if (query.run === "fresh") where.runId = await this.clock.runId();
    if (
      query.source &&
      ["seed", "interactive", "paystack_test"].includes(query.source)
    )
      where.source = query.source;
    if (query.from || query.to) {
      const range: { gte?: Date; lt?: Date } = {};
      if (query.from) range.gte = new Date(query.from + "T00:00:00Z");
      if (query.to)
        range.lt = new Date(
          new Date(query.to + "T00:00:00Z").getTime() + 86400000,
        );
      ensure(
        !Object.values(range).some((d) => Number.isNaN(d.getTime())),
        400,
        "Choose a valid date range.",
      );
      where.createdAt = range;
      dateRange = range;
    }
    const journals = details
      ? await this.db.journal.findMany({
          where,
          include: {
            lines: { include: { account: true } },
            payment: { select: publicPaymentSelect },
          },
          orderBy: { createdAt: "desc" },
          take: 2000,
        })
      : [];
    const movement = await this.db.ledgerLine.groupBy({
      by: ["accountCode"],
      where: { journal: where },
      _sum: { debit: true, credit: true },
    });
    const asBalances = (rows: typeof movement) =>
      Object.fromEntries(
        rows.map((r) => [
          r.accountCode,
          ["cash", "gateway_expense"].includes(r.accountCode)
            ? (r._sum.debit || 0) - (r._sum.credit || 0)
            : (r._sum.credit || 0) - (r._sum.debit || 0),
        ]),
      );
    const balances = asBalances(movement);
    const closingWhere: Prisma.JournalWhereInput = { ...where };
    if (dateRange) {
      const end = dateRange.lt;
      if (end) closingWhere.createdAt = { lt: end };
      else delete closingWhere.createdAt;
    }
    const closingGroups = await this.db.ledgerLine.groupBy({
      by: ["accountCode"],
      where: { journal: closingWhere },
      _sum: { debit: true, credit: true },
    });
    const closingBalances = asBalances(closingGroups);
    const scope: Record<string, unknown> = {
      ...(this.clock.config.mode !== "simulator"
        ? { mode: this.clock.config.mode }
        : {}),
      ...(query.run === "fresh" ? { runId: await this.clock.runId() } : {}),
      ...(where.source ? { source: where.source } : {}),
      ...(actor.role !== "admin"
        ? {
            OR: [
              { order: { companyId: actor.companyId } },
              { subscriptions: { some: { companyId: actor.companyId } } },
              { campaigns: { some: { companyId: actor.companyId } } },
            ],
          }
        : {}),
    };
    const paymentWhere: Record<string, unknown> = {
      ...scope,
      status: "success",
      ...(dateRange ? { verifiedAt: dateRange } : {}),
    };
    const transactionGroups = await this.db.payment.groupBy({
      by: ["status"],
      where: { ...scope, ...(dateRange ? { createdAt: dateRange } : {}) },
      _count: { _all: true },
    });
    const payments = await this.db.payment.findMany({
      where: paymentWhere,
      select: {
        ...publicPaymentSelect,
        order: {
          select: {
            subtotal: true,
            commission: true,
            convenienceFee: true,
            companyShare: true,
            deliveryFee: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const streams: Record<string, number> = {
      order: 0,
      student: 0,
      hosting: 0,
      sponsored: 0,
    };
    for (const p of payments)
      streams[p.kind] = (streams[p.kind] || 0) + p.amount;
    const refunds = await this.db.refund.findMany({
      where: {
        status: "processed",
        payment: scope,
        ...(dateRange ? { completedAt: dateRange } : {}),
      },
    });
    const collected = payments.reduce((n, p) => n + p.amount, 0);
    const refunded = refunds.reduce((n, r) => n + r.amount, 0);
    const companyGross = payments.reduce(
      (n, p) => n + (p.order?.companyShare || 0) + (p.order?.deliveryFee || 0),
      0,
    );
    const companyReversed = refunds.reduce(
      (n, r) => n + r.companyReversal + r.deliveryReversal,
      0,
    );
    const grossAllocations =
      collected - companyGross - refunded + companyReversed;
    const earned = [
      "commission_revenue",
      "convenience_revenue",
      "student_revenue",
      "hosting_revenue",
      "advertising_revenue",
    ].reduce((n, k) => n + (balances[k] || 0), 0);
    const deferred = [
      "commission_deferred",
      "student_deferred",
      "hosting_deferred",
      "advertising_deferred",
    ].reduce((n, k) => n + (closingBalances[k] || 0), 0);
    return {
      collected,
      refunded,
      netCollections: collected - refunded,
      successfulTransactions: payments.length,
      orderTransactions: payments.filter((payment) => payment.kind === "order")
        .length,
      transactions: {
        total: transactionGroups.reduce(
          (total, group) => total + group._count._all,
          0,
        ),
        byStatus: Object.fromEntries(
          transactionGroups.map((group) => [group.status, group._count._all]),
        ),
      },
      orderCollections: streams.order,
      planPayments: streams.hosting + streams.sponsored,
      companyGross,
      companyReversed,
      companyNet: companyGross - companyReversed,
      commissionNet:
        (balances.commission_revenue || 0) +
        (balances.commission_deferred || 0),
      companyPayable: closingBalances.company_payable || 0,
      laundryValue: payments.reduce((n, p) => n + (p.order?.subtotal || 0), 0),
      grossAllocations,
      earned,
      deferred,
      gatewayCosts: balances.gateway_expense || 0,
      platformReceipts: grossAllocations - (balances.gateway_expense || 0),
      streams,
      balances,
      closingBalances,
      journals,
      payments: details ? payments : [],
      refunds: details ? refunds : [],
      settlements: details
        ? await this.db.settlement.findMany({
            where: {
              ...(actor.role === "admin" ? {} : { companyId: actor.companyId }),
              ...(this.clock.config.mode !== "simulator"
                ? { mode: this.clock.config.mode }
                : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        : [],
      runId: await this.clock.runId(),
      truncated: journals.length === 2000,
      recognitionPolicy:
        "Collections use verified payment dates; processed refunds use completion dates. Payables and deferred revenue are closing balances through the selected end date. Convenience fees are earned on verified checkout, commission on completed laundry, and subscription/advertising revenue over purchased service periods. Collections are not profit.",
    };
  }
  async summary(actor: Actor) {
    const {
      payments,
      refunds,
      journals,
      settlements,
      recognitionPolicy,
      ...totals
    } = await this.report(actor, {}, false);
    return totals;
  }
  async journal(actor: Actor, id: string) {
    const record = requireValue(
      await this.db.journal.findUnique({
        where: { id },
        include: {
          lines: { include: { account: true } },
          payment: { select: publicPaymentSelect },
        },
      }),
    );
    ensure(
      actor.role === "admin" ||
        (record.companyId === actor.companyId &&
          actor.permissions.includes("finance.read")),
      403,
      "You cannot access this journal.",
    );
    return record;
  }
  async settlement(
    actor: Actor,
    companyId: string,
    amount: number,
    outcome: string,
  ) {
    ensure(actor.role === "admin", 403, "Administrator access required.");
    ensure(
      this.clock.config.mode === "simulator" &&
        this.clock.config.env !== "production",
      409,
      "Provider settlement requires approved merchant configuration and reconciliation. Local settlements are simulation only.",
    );
    return atomic(this.db, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id"=${companyId} FOR UPDATE`;
      const lines = await tx.ledgerLine.findMany({
        where: { accountCode: "company_payable", journal: { companyId } },
      });
      const available = lines.reduce((n, l) => n + l.credit - l.debit, 0);
      ensure(
        amount > 0 && amount <= available,
        400,
        "The settlement exceeds the company payable balance.",
      );
      const now = await this.clock.now(tx);
      const runId = await this.clock.runId(tx);
      const s = await tx.settlement.create({
        data: {
          reference: `SIM-SET-${crypto.randomUUID().slice(0, 12)}`,
          companyId,
          amount,
          status: outcome === "success" ? "simulated_success" : "failed",
          mode: "simulator",
          reason:
            outcome === "success"
              ? "Simulated transfer to fictional destination; no money moved."
              : "Simulator: destination unavailable",
          createdAt: now,
        },
      });
      if (outcome === "success")
        await post(
          tx,
          {
            key: `settlement-${s.id}`,
            description: "Simulated company settlement — no real money moved",
            source: "interactive",
            runId,
            companyId,
            createdAt: now,
          },
          [
            { accountCode: "company_payable", debit: amount },
            { accountCode: "cash", credit: amount },
          ],
        );
      return s;
    });
  }
}
