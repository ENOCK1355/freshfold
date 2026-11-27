import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_PASSWORD } from "../../../packages/shared/src/index.js";
import {
  articleBody,
  siteArticles,
} from "../../../packages/shared/src/site-content.js";
import { BusinessClock, DAY, defaultRules } from "./clock.js";
import type { Config } from "./config.js";
import { ensure } from "./config.js";
import type { DB } from "./database.js";
import { json } from "./database.js";
import { post } from "./finance.js";
import { initializeReferenceData } from "./reference-data.js";
import { hash, hashPassword } from "./security.js";

export const demoStudents = [
  [
    "student-free",
    "Ama Mensah",
    "student.free@freshfold.test",
    "New free student",
  ],
  [
    "student-history",
    "Kwesi Owusu",
    "student.history@freshfold.test",
    "Free student with completed orders",
  ],
  [
    "student-plus",
    "Akosua Asare",
    "student.plus@freshfold.test",
    "Active Student Plus",
  ],
  [
    "student-renewal",
    "Kofi Arthur",
    "student.renewal@freshfold.test",
    "Plus approaching renewal",
  ],
  [
    "student-cancelled",
    "Efua Boateng",
    "student.cancelled@freshfold.test",
    "Plus with future renewal cancelled",
  ],
  [
    "student-expired",
    "Yaw Addo",
    "student.expired@freshfold.test",
    "Expired premium access",
  ],
  [
    "student-failed",
    "Adwoa Osei",
    "student.failed@freshfold.test",
    "Failed membership renewal",
  ],
  [
    "student-dispute",
    "Kojo Amissah",
    "student.dispute@freshfold.test",
    "Active garment-care dispute",
  ],
  [
    "student-refund",
    "Abena Quaye",
    "student.refund@freshfold.test",
    "Awaiting an order refund",
  ],
  [
    "student-recurring",
    "Fiifi Eshun",
    "student.recurring@freshfold.test",
    "Plus with recurring bookings",
  ],
  [
    "student-pending",
    "Esi Appiah",
    "student.pending@freshfold.test",
    "Pending payment",
  ],
  [
    "student-upgrade",
    "Nana Baah",
    "student.upgrade@freshfold.test",
    "Ready to purchase Student Plus",
  ],
];
const businesses = [
  {
    id: "campus-linen",
    name: "Campus Linen Laundry",
    status: "approved",
    location: "Amamoma · near UCC North Campus",
    area: "amamoma",
    photo: "laundromat",
    accent: "#365747",
    turnaround: 24,
    price: 2500,
    plan: "essential",
    pickup: true,
    description:
      "An easy reset for your everyday wardrobe. Find separately washed loads, careful folding, and convenient collection around Amamoma and UCC.",
  },
  {
    id: "coastline",
    name: "Coastline Garment Care",
    status: "approved",
    location: "Kwaprow · Cape Coast",
    area: "kwaprow",
    photo: "steam-press",
    accent: "#a57b4c",
    turnaround: 48,
    price: 3000,
    plan: "growth",
    pickup: true,
    description:
      "A little extra attention for the pieces you love. Explore considered garment care, neatly pressed shirts, and flexible collection around Kwaprow.",
  },
  {
    id: "hallside",
    name: "Hallside Wash House",
    status: "approved",
    location: "UCC Science · campus neighbourhood",
    area: "ucc-science",
    photo: "laundry-room",
    accent: "#48636d",
    turnaround: 24,
    price: 2200,
    plan: "growth",
    pickup: false,
    description:
      "A practical neighbourhood wash house for a busy student week, focused on straightforward drop-off laundry, bedding, and everyday garment care.",
  },
  {
    id: "cape-fresh",
    name: "Cape Fresh Laundry",
    status: "approved",
    location: "Ayensu · UCC area",
    area: "ayensu",
    photo: "hanging-shirts",
    accent: "#8c7464",
    turnaround: 36,
    price: 2800,
    plan: "business",
    pickup: true,
    description:
      "Fresh clothes, thoughtfully finished. Choose collection, wash-and-fold packages, and bedding care around Ayensu and nearby halls.",
  },
  {
    id: "studybreak",
    name: "StudyBreak Laundry",
    status: "pending",
    location: "Apewosika · Cape Coast",
    area: "apewosika",
    photo: "laundry-basket",
    accent: "#6b7258",
    turnaround: 48,
    price: 2400,
    plan: "essential",
    pickup: true,
    description:
      "Laundry care shaped around student routines, with flexible collection options, everyday wash-and-fold services, and bedding care around Apewosika.",
  },
  {
    id: "neatnest",
    name: "NeatNest Garment Care",
    status: "rejected",
    location: "Kwaprow · Cape Coast",
    area: "kwaprow",
    photo: "folded-garments",
    accent: "#a57666",
    turnaround: 48,
    price: 3200,
    plan: "essential",
    pickup: true,
    description:
      "Thoughtful garment care for everyday favourites, neatly pressed workwear, and the pieces that need a little extra attention around Kwaprow.",
  },
  {
    id: "greenbasket",
    name: "GreenBasket Laundry",
    status: "suspended",
    location: "Amamoma · Cape Coast",
    area: "amamoma",
    photo: "sunlit-laundry",
    accent: "#657a51",
    turnaround: 72,
    price: 2000,
    plan: "growth",
    pickup: true,
    description:
      "Local laundry care in Amamoma, with practical wash-and-fold options, bedding services, and collection arrangements for a busy week.",
  },
  {
    id: "fold-finish",
    name: "Fold & Finish Laundry",
    status: "approved",
    location: "Apewosika · near UCC",
    area: "apewosika",
    photo: "fresh-linen",
    accent: "#88785b",
    turnaround: 48,
    price: 2600,
    plan: "growth",
    pickup: true,
    description:
      "Carefully washed, neatly finished. Everyday laundry, tidy folding, and collection options for the communities around Apewosika and UCC.",
  },
];
export async function seed(db: DB, config: Config) {
  ensure(
    config.env !== "production",
    403,
    "Demo fixtures are forbidden in production.",
  );
  const existing = await db.setting.findUnique({
    where: { key: "demo.seed_version" },
  });
  if (existing) {
    const legacyPhotos = [
      "laundromat",
      "laundry-care",
      "linen-shelves",
      "wardrobe",
      "folded-towels",
    ].map((name) => `/images/${name}.webp`);
    for (const business of businesses)
      await db.company.updateMany({
        where: {
          id: business.id,
          demo: true,
          photo: { in: legacyPhotos },
          coverPhoto: { in: legacyPhotos },
        },
        data: {
          photo: `/images/${business.photo}.webp`,
          coverPhoto: `/images/${business.photo}.webp`,
        },
      });
    await db.company.updateMany({
      where: {
        demo: true,
        name: { startsWith: "Cape Campus Care " },
        memberships: {
          some: { user: { email: { startsWith: "browser.owner." } } },
        },
      },
      data: { published: false },
    });
    for (const business of businesses)
      await db.company.updateMany({
        where: {
          id: business.id,
          demo: true,
          OR: [
            { description: { contains: "demo", mode: "insensitive" } },
            { description: { contains: "fictional", mode: "insensitive" } },
          ],
        },
        data: { description: business.description },
      });
    await db.notification.updateMany({
      where: { href: "/demo", title: "Welcome to Fresh Fold" },
      data: {
        body: "Keep your orders, saved laundries, receipts, and support together. Start by finding laundry care for your area.",
        href: "/find-laundry",
      },
    });
    await db.user.updateMany({
      where: { id: "demo-admin" },
      data: { name: "Fresh Fold", email: "admin@freshfold.test" },
    });
  }
  if (existing)
    return {
      seeded: false,
      message:
        "Deterministic demo fixtures are already installed. Existing activity was preserved.",
    };
  const now = new Date("2026-11-23T09:00:00.000Z");
  const clock = new BusinessClock(db, config);
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await initializeReferenceData(db, config);
  await db.setting.upsert({
    where: { key: "demo.clock" },
    create: { key: "demo.clock", value: now.toISOString() },
    update: {},
  });
  await clock.startRun();
  for (let i = 0; i < demoStudents.length; i++) {
    const [id, name, email, demoScenario] = demoStudents[i];
    await db.user.upsert({
      where: { id },
      create: {
        id,
        name,
        email,
        passwordHash,
        role: "student",
        verifiedAt: now,
        demoScenario,
        preferences: {
          detergent: i % 2 ? "fragrance-free" : "standard",
          fold: true,
          notifications: true,
        },
        addresses: {
          create: {
            label: "Campus address",
            detail: `DEMO · ${["Valco Hall", "Oguaa Hall", "Kwame Nkrumah Hall", "Private student hostel"][i % 4]}, sample room ${100 + i}`,
            areaId: ["amamoma", "kwaprow", "ucc-science", "ayensu"][i % 4],
            instructions:
              "Demonstration address; do not dispatch a real collection.",
          },
        },
      },
      update: {},
    });
  }
  for (const [id, name, email, role] of [
    ["demo-admin", "Fresh Fold", "admin@freshfold.test", "admin"],
    [
      "demo-support",
      "Selina · Support team",
      "support@freshfold.test",
      "support",
    ],
  ])
    await db.user.upsert({
      where: { id },
      create: {
        id,
        name,
        email,
        role,
        passwordHash,
        verifiedAt: now,
        demoScenario: `Demonstration ${role}`,
      },
      update: {},
    });
  for (let i = 0; i < businesses.length; i++) {
    const b = businesses[i];
    const ownerId = `owner-${b.id}`;
    await db.user.upsert({
      where: { id: ownerId },
      create: {
        id: ownerId,
        name: `${["Akua", "Kwame", "Ebo", "Afia", "Kweku", "Aba", "Yaa", "Ekow"][i]} · ${b.name}`,
        email: `owner.${b.id}@freshfold.test`,
        role: "owner",
        passwordHash,
        verifiedAt: now,
        demoScenario: `${b.status}${b.id === "fold-finish" ? " · expired hosting" : " · " + b.plan + " plan"}`,
      },
      update: {},
    });
    const company = await db.company.upsert({
      where: { id: b.id },
      create: {
        id: b.id,
        slug: b.id,
        name: b.name,
        description: b.description,
        status: b.status,
        registrationRef: `DEMO-REG-${String(i + 1).padStart(4, "0")}`,
        verifiedAt:
          b.status === "approved" ? new Date(now.getTime() - 10 * DAY) : null,
        verificationNote:
          b.status === "approved"
            ? "Demo application and synthetic registration reference reviewed. No real-world verification or service guarantee is implied."
            : null,
        photo: `/images/${b.photo}.webp`,
        coverPhoto: `/images/${b.photo}.webp`,
        accent: b.accent,
        location: b.location,
        primaryAreaId: b.area,
        turnaroundHours: b.turnaround,
        pickup: b.pickup,
        capacity: 8 + i * 2,
        minimum: 2000,
        instantBooking: b.id !== "coastline",
        published: b.status === "approved" && b.id !== "fold-finish",
        demo: true,
        settlementDestination: `SIMULATOR-DESTINATION-${String(i + 1).padStart(4, "0")} (fictional; no bank or mobile money account)`,
        memberships: { create: { userId: ownerId, role: "owner" } },
        areas: {
          create: [
            ...new Set([
              b.area,
              "amamoma",
              "kwaprow",
              "ucc-science",
              "ayensu",
              "diaspora",
            ]),
          ].map((areaId) => ({ areaId })),
        },
        branches: {
          create: {
            name: "Main branch · demonstration",
            address: `Demonstration location near ${b.location}`,
          },
        },
        hours: {
          create: [1, 2, 3, 4, 5, 6].map((day) => ({
            day,
            open: "08:00",
            close: "18:00",
          })),
        },
      },
      update: {},
    });
    for (const s of [
      {
        id: `${b.id}-wash`,
        name: "Wash & fold",
        category: "wash-fold",
        description:
          "A separately washed everyday load, dried and neatly folded. Up to 5 kg per load.",
        unit: "load",
        price: b.price,
        estimated: false,
      },
      {
        id: `${b.id}-iron`,
        name: "Press & iron",
        category: "ironing",
        description:
          "Careful ironing for one shirt, blouse, or pair of trousers.",
        unit: "item",
        price: 800 + i * 50,
        estimated: false,
      },
      {
        id: `${b.id}-bedding`,
        name: "Bedding refresh",
        category: "bedding",
        description:
          "A single bedsheet, pillowcase pair, or light blanket. Check care labels before booking.",
        unit: "item",
        price: 2000 + i * 200,
        estimated: false,
      },
      {
        id: `${b.id}-weight`,
        name: "Laundry by weight",
        category: "wash-fold",
        description:
          "Estimated kilograms, confirmed after collection. Adjustments need your approval.",
        unit: "kg",
        price: 1000 + i * 100,
        estimated: true,
      },
    ])
      await db.service.upsert({
        where: { id: s.id },
        create: {
          ...s,
          companyId: company.id,
          versions: { create: { price: s.price } },
        },
        update: {},
      });
    const status =
      b.id === "fold-finish"
        ? "expired"
        : b.status === "approved" || b.status === "suspended"
          ? "active"
          : "inactive";
    await db.subscription.create({
      data: {
        id: `hosting-${b.id}`,
        userId: ownerId,
        companyId: b.id,
        planId: b.plan,
        status,
        startsAt: new Date(now.getTime() - 15 * DAY),
        endsAt: new Date(
          now.getTime() + (status === "expired" ? -2 : 15) * DAY,
        ),
        priceSnapshot:
          b.plan === "essential" ? 7500 : b.plan === "growth" ? 15000 : 30000,
        renewalMethod: "manual",
      },
    });
    const key = `demo/samples/${b.id}.txt`;
    const text = `FRESH FOLD\n\nDEMONSTRATION — NOT VALID\n\nBusiness: ${b.name}\nReference: DEMO-REG-${String(i + 1).padStart(4, "0")}\nArea: ${b.location}\n\nThis synthetic onboarding summary is solely for testing an application review.\nIt is not a government document, identity document, university document,\nregistration certificate, proof of address, or evidence of a genuine business.\n\nDEMONSTRATION — NOT VALID\n`;
    const full = path.join(config.dataRoot, "uploads", key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, text);
    await db.storedFile.create({
      data: {
        id: `document-${b.id}`,
        ownerId,
        companyId: b.id,
        name: `${b.name} - DEMONSTRATION NOT VALID.txt`,
        mime: "text/plain",
        size: Buffer.byteLength(text),
        key,
        status: "demo_sample",
      },
    });
  }
  await db.user.create({
    data: {
      id: "company-staff",
      name: "Kobina · Collection staff",
      email: "staff.campus@freshfold.test",
      passwordHash,
      role: "staff",
      verifiedAt: now,
      demoScenario: "Restricted staff · orders only",
      memberships: {
        create: {
          companyId: "campus-linen",
          role: "staff",
          permissions: ["orders.read", "orders.write"],
        },
      },
    },
  });
  for (const [id, userId, status, days, cancel, method] of [
    ["plus-active", "student-plus", "active", 24, false, "manual"],
    ["plus-renewal", "student-renewal", "active", 1, false, "card_auto"],
    ["plus-cancelled", "student-cancelled", "active", 12, true, "card_auto"],
    ["plus-expired", "student-expired", "expired", -4, false, "manual"],
    ["plus-failed", "student-failed", "past_due", -1, false, "card_auto"],
    ["plus-recurring", "student-recurring", "active", 20, false, "manual"],
  ] as const)
    await db.subscription.create({
      data: {
        id,
        userId,
        planId: "student-plus",
        status,
        startsAt: new Date(now.getTime() + (days - 30) * DAY),
        endsAt: new Date(now.getTime() + days * DAY),
        cancelAtEnd: cancel,
        renewalMethod: method,
        priceSnapshot: 2500,
        graceUntil:
          status === "past_due" ? new Date(now.getTime() + 2 * DAY) : null,
      },
    });
  await db.recurringSchedule.create({
    data: {
      userId: "student-recurring",
      companyId: "campus-linen",
      day: 2,
      frequency: "weekly",
    },
  });
  for (const uid of ["student-plus", "student-history", "student-recurring"])
    await db.favorite.create({
      data: { userId: uid, companyId: "campus-linen" },
    });
  // Historical fixtures are explicitly synthetic and are isolated from every fresh run.
  for (let i = 0; i < 8; i++) {
    const company = businesses[i];
    const uid = demoStudents[(i + 1) % demoStudents.length][0];
    const createdAt = new Date(now.getTime() - (8 - i) * DAY);
    const pending = ["pending", "rejected"].includes(company.status);
    const order = await db.order.create({
      data: {
        id: `history-${company.id}`,
        reference: `DEMO-FF-${1001 + i}`,
        idempotencyKey: `seed-${company.id}`,
        userId: uid,
        companyId: company.id,
        status: pending ? "requested" : "completed",
        paymentStatus: pending ? "unpaid" : "paid",
        method: "dropoff",
        address: {
          detail: "Synthetic historical demo order",
          areaId: company.area,
        },
        subtotal: company.price * 2,
        convenienceFee: 300,
        total: company.price * 2 + 300,
        commission: Math.round(company.price * 2 * 0.12),
        companyShare: Math.round(company.price * 2 * 0.88),
        feeSnapshot: json(defaultRules),
        source: "seed",
        runId: "seed-history",
        completedAt: pending ? null : createdAt,
        reservationReleased: true,
        deliveryCodeHash: hash("246810"),
        createdAt,
        items: {
          create: {
            serviceId: `${company.id}-wash`,
            name: "Wash & fold",
            unit: "load",
            unitPrice: company.price,
            quantity: 2,
            lineTotal: company.price * 2,
          },
        },
        events: {
          create: [
            {
              status: "accepted",
              actorId: `owner-${company.id}`,
              reason: "Synthetic historical fixture",
              createdAt,
            },
            {
              status: pending ? "requested" : "completed",
              actorId: "seed",
              reason: "Clearly labelled demonstration record",
              createdAt,
            },
          ],
        },
      },
    });
    if (!pending) {
      const p = await db.payment.create({
        data: {
          id: `payment-history-${company.id}`,
          reference: `SIM-HISTORY-${company.id}`,
          idempotencyKey: `seed-payment-${company.id}`,
          userId: uid,
          orderId: order.id,
          kind: "order",
          amount: order.total,
          mode: "simulator",
          source: "seed",
          runId: "seed-history",
          status: "success",
          verifiedAt: createdAt,
          createdAt,
        },
      });
      await db.$transaction(async (tx) => {
        await post(
          tx,
          {
            key: `seed-collection-${p.id}`,
            description:
              "Synthetic historical laundry collection — simulation only",
            paymentId: p.id,
            companyId: company.id,
            source: "seed",
            runId: "seed-history",
            createdAt,
          },
          [
            { accountCode: "cash", debit: p.amount },
            { accountCode: "company_payable", credit: order.companyShare },
            { accountCode: "commission_revenue", credit: order.commission },
            { accountCode: "convenience_revenue", credit: 300 },
          ],
        );
      });
      await db.review.create({
        data: {
          orderId: order.id,
          companyId: company.id,
          userId: uid,
          rating: [5, 4, 5, 4, 4, 5, 4, 5][i],
          text: [
            "My shirts came back neatly folded. Collection was straightforward.",
            "Helpful updates and careful pressing. A convenient option between lectures.",
            "An easy drop-off and everything was ready in the agreed window.",
            "The bedding was packed neatly and the order notes were followed.",
          ][i % 4],
          createdAt,
          response:
            i === 0 ? "Thank you for trying our demonstration service." : null,
        },
      });
    }
    await db.message.create({
      data: {
        orderId: order.id,
        userId: uid,
        body: "Sample message: please follow the garment care labels and keep this load separate.",
        createdAt,
      },
    });
  }
  await db.ticket.create({
    data: {
      id: "demo-dispute",
      reference: "DEMO-SUP-001",
      userId: "student-dispute",
      name: "Kojo Amissah",
      subject: "One shirt needs a care review",
      category: "garment-care",
      body: "Demonstration dispute: compare the care instructions and collection record before resolving this case.",
      status: "open",
      events: {
        create: {
          actorId: "student-dispute",
          body: "Synthetic support case opened for demonstration.",
        },
      },
    },
  });
  for (const [id] of demoStudents)
    await db.notification.create({
      data: {
        userId: id,
        title: "Welcome to Fresh Fold",
        body: "Keep your orders, saved laundries, receipts, and support together. Start by finding laundry care for your area.",
        href: "/find-laundry",
      },
    });
  for (const [slug, title, body] of contentPages)
    await db.contentPage.upsert({
      where: { slug },
      create: { slug, title, body },
      update: {},
    });
  await db.setting.create({ data: { key: "demo.seed_version", value: 1 } });
  return { seeded: true, companies: 8, students: 12, password: DEMO_PASSWORD };
}
export const contentPages = Object.values(siteArticles).map(
  (article) => [article.slug, article.title, articleBody(article)] as const,
);
