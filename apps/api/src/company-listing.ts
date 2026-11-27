import type { Prisma } from "@prisma/client";
import type { Config } from "./config.js";

export function publicListingWhere(
  config: Config,
  now: Date,
): Prisma.CompanyWhereInput {
  return {
    status: "approved",
    published: true,
    ...(config.mode !== "simulator"
      ? {
          paymentAccountApproved: true,
          paystackSubaccount: { not: null, notIn: [""] },
        }
      : {}),
    ...(config.env === "production" ? { demo: false } : {}),
    subscriptions: {
      some: {
        status: "active",
        endsAt: { gt: now },
        plan: { kind: "hosting" },
      },
    },
    services: { some: { active: true } },
  };
}

type ListingCompany = {
  status: string;
  published: boolean;
  demo: boolean;
  paymentAccountApproved: boolean;
  paystackSubaccount: string | null;
  services: { active: boolean }[];
  subscriptions: {
    id?: string;
    status: string;
    endsAt: Date;
    plan: { kind: string };
  }[];
};
export function listingState(
  company: ListingCompany,
  config: Config,
  now: Date,
) {
  const blockers: string[] = [];
  const hosting = company.subscriptions.find(
    (subscription) =>
      subscription.status === "active" &&
      subscription.endsAt > now &&
      subscription.plan.kind === "hosting",
  );
  if (company.status !== "approved")
    blockers.push("Application approval required");
  if (!company.published) blockers.push("Publication is switched off");
  if (!hosting) blockers.push("Active hosting required");
  if (!company.services.some((service) => service.active))
    blockers.push("Add an active service");
  if (
    config.mode !== "simulator" &&
    (!company.paymentAccountApproved || !company.paystackSubaccount)
  )
    blockers.push("Settlement account approval required");
  if (config.env === "production" && company.demo)
    blockers.push("Business verification required");
  return {
    listed: blockers.length === 0,
    blockers,
    hostingActive: !!hosting,
    activeHostingId: hosting?.id || null,
  };
}
