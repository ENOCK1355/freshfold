import { DAY, BusinessClock } from "./clock.js";
import { ensure, requireValue, type Config } from "./config.js";
import { atomic, type DB } from "./database.js";
import type { NotificationService } from "./notifications.js";
import type { PaymentService } from "./payments.js";
import { audit, type Actor } from "./security.js";

export class AdmissionsService {
  constructor(
    public db: DB,
    public config: Config,
    public clock: BusinessClock,
    public payments: PaymentService,
    public notifications: NotificationService,
  ) {}

  async paymentsList(q: Record<string, string>) {
    const page = Math.max(1, Number(q.page) || 1);
    const where = {
      mode: this.config.mode,
      ...(q.status ? { status: q.status } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.payment.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          order: {
            select: {
              reference: true,
              companyId: true,
              companyShare: true,
              commission: true,
              convenienceFee: true,
              deliveryFee: true,
              status: true,
            },
          },
          subscriptions: { select: { id: true, status: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
        skip: (page - 1) * 50,
      }),
      this.db.payment.count({ where }),
    ]);
    return {
      items: items.map(({ authorization, ...payment }) => payment),
      total,
      page,
    };
  }
  async subscriptionsList(q: Record<string, string>) {
    const page = Math.max(1, Number(q.page) || 1);
    const where = {
      ...(this.config.mode !== "simulator"
        ? { payment: { mode: this.config.mode } }
        : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.kind ? { plan: { kind: q.kind } } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.subscription.findMany({
        where,
        include: {
          plan: true,
          user: { select: { name: true, email: true } },
          company: {
            select: { id: true, name: true, status: true, published: true },
          },
          payment: {
            select: {
              id: true,
              status: true,
              reference: true,
              verifiedAt: true,
              mode: true,
              amount: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
        skip: (page - 1) * 50,
      }),
      this.db.subscription.count({ where }),
    ]);
    return { items, total, page };
  }
  async verify(actor: Actor, id: string) {
    ensure(actor.role === "admin", 403, "Administrator access required.");
    const payment = requireValue(
      await this.db.payment.findUnique({ where: { id } }),
    );
    ensure(
      payment.mode === this.config.mode && payment.mode !== "simulator",
      409,
      "Only payments from the current Paystack environment can be checked.",
    );
    await this.payments.verifyProvider(payment.reference);
    await audit(this.db, actor.id, "payment.provider_checked", id);
    return this.payments.safe(
      await this.db.payment.findUniqueOrThrow({ where: { id } }),
    );
  }
  async reviewPayment(actor: Actor, id: string, reason: string) {
    await this.verify(actor, id);
    const payment = await this.db.payment.findUniqueOrThrow({ where: { id } });
    ensure(
      payment.status === "success" && payment.verifiedAt && payment.providerId,
      409,
      "Paystack must confirm a successful transaction before it can be reviewed.",
    );
    await this.db.payment.update({
      where: { id },
      data: {
        reviewedAt: new Date(),
        reviewedBy: actor.id,
        reviewNote: reason,
      },
    });
    await audit(this.db, actor.id, "payment.reviewed", id, reason);
    return { reviewed: true };
  }
  async subscription(actor: Actor, id: string, action: string, reason: string) {
    ensure(actor.role === "admin", 403, "Administrator access required.");
    const record = requireValue(
      await this.db.subscription.findUnique({ where: { id } }),
    );
    if (action === "approve") {
      ensure(
        record.paymentId,
        409,
        "A verified subscription payment is required.",
      );
      await this.verify(actor, record.paymentId);
    }
    return atomic(this.db, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${record.userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id"=${id} FOR UPDATE`;
      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { id },
        include: { payment: true, company: true, plan: true },
      });
      const now = await this.clock.now(tx);
      const review = {
        reviewedAt: now,
        reviewedBy: actor.id,
        reviewNote: reason,
      };
      let status: string;
      if (action === "approve") {
        ensure(
          subscription.status === "pending_approval",
          409,
          "This subscription is no longer awaiting approval.",
        );
        ensure(
          subscription.payment?.status === "success" &&
            subscription.payment.verifiedAt &&
            subscription.payment.providerId &&
            subscription.payment.mode === this.config.mode,
          409,
          "The subscription needs a successful Paystack payment in this environment.",
        );
        ensure(
          !subscription.company || subscription.company.status === "approved",
          409,
          "Approve the company's verification application first.",
        );
        const active = await tx.subscription.findFirst({
          where: {
            id: { not: id },
            ...(subscription.companyId
              ? { companyId: subscription.companyId }
              : { userId: subscription.userId, companyId: null }),
            status: "active",
            endsAt: { gt: now },
          },
        });
        ensure(
          !active,
          409,
          "An active subscription already covers this account.",
        );
        status = "active";
        await tx.subscription.update({
          where: { id },
          data: {
            ...review,
            status,
            startsAt: now,
            endsAt: new Date(
              now.getTime() + subscription.periodDaysSnapshot * DAY,
            ),
          },
        });
        await tx.payment.update({
          where: { id: subscription.paymentId! },
          data: review,
        });
      } else {
        ensure(
          action === "suspend" || action === "restore",
          400,
          "Choose approve, suspend, or restore.",
        );
        ensure(
          action === "suspend"
            ? subscription.status === "active"
            : subscription.status === "suspended" &&
                subscription.endsAt > now &&
                subscription.payment?.status === "success",
          409,
          "This subscription cannot make the requested change.",
        );
        status = action === "suspend" ? "suspended" : "active";
        await tx.subscription.update({
          where: { id },
          data: { ...review, status },
        });
      }
      await audit(tx, actor.id, `subscription.${action}`, id, reason);
      await this.notifications.notify(
        subscription.userId,
        `${subscription.plan.name}: ${status === "active" ? "activated" : status}`,
        status === "active"
          ? "Your subscription is ready to use."
          : `Your subscription has been suspended. ${reason}`,
        subscription.companyId ? "/business/subscription" : "/account/billing",
        tx,
      );
      return { id, status };
    });
  }
  async banks() {
    const banks = await this.payments.provider(
      "/bank?country=ghana&currency=GHS&perPage=100",
    );
    return banks
      .filter((bank: any) => bank.active && bank.currency === "GHS")
      .map((bank: any) => ({
        name: bank.name,
        code: bank.code,
        type: bank.type,
      }));
  }
  async settlementRequest(
    actor: Actor,
    input: {
      bankCode: string;
      bankName: string;
      accountNumber: string;
      accountName: string;
    },
  ) {
    ensure(
      actor.role === "owner" &&
        actor.companyId &&
        actor.permissions.includes("finance.read"),
      403,
      "A business owner is required.",
    );
    const current = await this.db.company.findUniqueOrThrow({
      where: { id: actor.companyId },
    });
    // Changing a destination with unsettled payments requires administrator review.
    ensure(
      !current.paymentAccountApproved,
      409,
      "Contact an administrator to change an approved settlement account.",
    );
    const banks = await this.banks();
    const bank = banks.find((item: any) => item.code === input.bankCode);
    ensure(
      bank,
      400,
      "Choose a Ghanaian settlement bank supported by Paystack.",
    );
    await this.db.company.update({
      where: { id: current.id },
      data: {
        settlementDestination: JSON.stringify({
          ...input,
          bankName: bank.name,
        }),
        paymentAccountApproved: false,
      },
    });
    await audit(this.db, actor.id, "company.settlement_requested", current.id);
    await this.notifications.admins(
      "Settlement account review",
      `${current.name} has submitted settlement details.`,
      "/admin/companies",
    );
    return { submitted: true };
  }
  async approveSettlement(
    actor: Actor,
    companyId: string,
    input: { code?: string; reason: string },
  ) {
    ensure(actor.role === "admin", 403, "Administrator access required.");
    const company = requireValue(
      await this.db.company.findUnique({ where: { id: companyId } }),
    );
    ensure(
      company.status === "approved",
      409,
      "Approve the business application first.",
    );
    let code = input.code || company.paystackSubaccount;
    if (!code) {
      const request = JSON.parse(company.settlementDestination || "null");
      ensure(
        request?.bankCode && request?.accountNumber,
        409,
        "The owner must submit settlement details or supply a Paystack subaccount code.",
      );
      const created = await this.payments.provider("/subaccount", "POST", {
        business_name: company.name,
        settlement_bank: request.bankCode,
        account_number: request.accountNumber,
        percentage_charge: 0,
        description: `Fresh Fold ${company.id}`,
      });
      code = created.subaccount_code;
      // Persist immediately so a retry reuses a provider-created account.
      await this.db.company.update({
        where: { id: companyId },
        data: { paystackSubaccount: code },
      });
    }
    ensure(
      code && /^ACCT_[a-zA-Z0-9]+$/.test(code),
      400,
      "Use a valid Paystack subaccount code.",
    );
    const account = await this.payments.provider(
      `/subaccount/${encodeURIComponent(code)}`,
    );
    ensure(
      account.subaccount_code === code &&
        account.currency === "GHS" &&
        !!account.active &&
        account.domain ===
          (this.config.mode === "paystack_live" ? "live" : "test"),
      409,
      "The subaccount must be active, use GHS, and belong to the current Paystack environment.",
    );
    if (this.config.mode === "paystack_live")
      ensure(
        account.is_verified,
        409,
        "Paystack must verify the live settlement account first.",
      );
    if (this.config.mode !== "paystack_test") {
      const duplicate = await this.db.company.findFirst({
        where: { id: { not: companyId }, paystackSubaccount: code },
      });
      ensure(
        !duplicate,
        409,
        "This settlement account is already assigned to another company.",
      );
    }
    const result = await this.db.company.update({
      where: { id: companyId },
      data: {
        paystackSubaccount: code,
        paymentAccountApproved: true,
        settlementDestination: JSON.stringify({
          accountName: account.account_name,
          bankName: account.settlement_bank,
          accountLast4: String(account.account_number).slice(-4),
        }),
      },
      select: { id: true, paymentAccountApproved: true },
    });
    await audit(
      this.db,
      actor.id,
      "company.settlement_approved",
      companyId,
      input.reason,
    );
    await this.notifications.owners(
      companyId,
      "Settlement account approved",
      "Your business can now receive payments through Paystack.",
      "/business/settlements",
    );
    return result;
  }
}
