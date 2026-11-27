import {
  articleBody,
  legacyPublicContent,
  retireCheckoutInstructions,
  retireEmailInstructions,
  siteArticles,
} from "../../../packages/shared/src/site-content.js";
import { defaultRules } from "./clock.js";
import type { Config } from "./config.js";
import { ensure } from "./config.js";
import type { DB } from "./database.js";
import { accounts } from "./finance.js";

/** Reference records only: never creates customers, companies, reviews, or transactions. */
export async function initializeReferenceData(db: DB, config: Config) {
  const marker = await db.setting.findUnique({
    where: { key: "system.environment" },
  });
  ensure(
    !marker || marker.value === config.env,
    500,
    "This database belongs to a different environment. Configure a separate database.",
  );
  if (!marker && ["staging", "production"].includes(config.env))
    ensure(
      (await db.user.count()) === 0,
      500,
      "The first hosted startup requires a clean database. Existing accounts cannot be imported without an environment migration.",
    );
  const environment = await db.setting.upsert({
    where: { key: "system.environment" },
    create: { key: "system.environment", value: config.env },
    update: {},
  });
  ensure(
    environment.value === config.env,
    500,
    "This database belongs to a different environment.",
  );
  for (const [code, name, type] of accounts)
    await db.ledgerAccount.upsert({
      where: { code },
      create: { code, name, type },
      update: {},
    });
  await db.setting.upsert({
    where: { key: "finance.rules" },
    create: { key: "finance.rules", value: defaultRules },
    update: {},
  });
  await db.setting.upsert({
    where: { key: "contact" },
    create: {
      key: "contact",
      value: { whatsapp: config.whatsapp, email: config.companyEmail },
    },
    update: {},
  });
  await db.campus.upsert({
    where: { id: "ucc" },
    create: {
      id: "ucc",
      name: "University of Cape Coast area",
      city: "Cape Coast",
    },
    update: {},
  });
  for (const [id, name] of [
    ["amamoma", "Amamoma"],
    ["kwaprow", "Kwaprow"],
    ["ucc-science", "UCC Science"],
    ["ayensu", "Ayensu"],
    ["apewosika", "Apewosika"],
    ["diaspora", "Diaspora halls"],
  ])
    await db.area.upsert({
      where: { id },
      create: { id, name, campusId: "ucc" },
      update: {},
    });
  for (const p of [
    {
      id: "student-plus",
      name: "Student Plus",
      kind: "student",
      price: 2500,
      staffSeats: 1,
      branches: 1,
      convenienceWaiver: true,
      features: [
        "GHS 3 standard convenience fee waived",
        "Recurring booking schedules",
        "Saved care preferences",
        "Priority platform support",
      ],
    },
    {
      id: "essential",
      name: "Company Essential",
      kind: "hosting",
      price: 7500,
      staffSeats: 2,
      branches: 1,
      convenienceWaiver: false,
      features: [
        "One business profile",
        "Service catalogue and orders",
        "Two staff seats",
        "Basic earnings reports",
      ],
    },
    {
      id: "growth",
      name: "Company Growth",
      kind: "hosting",
      price: 15000,
      staffSeats: 5,
      branches: 2,
      convenienceWaiver: false,
      features: [
        "Two branches",
        "Five staff seats",
        "Detailed financial reports",
        "Promotion and scheduling tools",
      ],
    },
    {
      id: "business",
      name: "Company Business",
      kind: "hosting",
      price: 30000,
      staffSeats: 12,
      branches: 5,
      convenienceWaiver: false,
      features: [
        "Five branches",
        "Twelve staff seats",
        "Advanced operations reports",
        "Repeat-customer insights",
      ],
    },
  ])
    await db.plan.upsert({ where: { id: p.id }, create: p, update: {} });
  for (const article of Object.values(siteArticles)) {
    const existing = await db.contentPage.findUnique({
      where: { slug: article.slug },
    });
    if (!existing)
      await db.contentPage.create({
        data: {
          slug: article.slug,
          title: article.title,
          body: articleBody(article),
        },
      });
    else if (legacyPublicContent(existing.body))
      await db.contentPage.update({
        where: { slug: article.slug },
        data: { title: article.title, body: articleBody(article) },
      });
    else if (
      retireCheckoutInstructions(retireEmailInstructions(existing.body)) !==
      existing.body
    )
      await db.contentPage.update({
        where: { slug: article.slug },
        data: {
          body: retireCheckoutInstructions(
            retireEmailInstructions(existing.body),
          ),
        },
      });
  }
}
