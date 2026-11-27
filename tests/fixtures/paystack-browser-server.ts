// Local acceptance-test server only. Never imported by the deployable API.
import express from "express";
import path from "node:path";
import sharp from "sharp";
import { createPilotFixture, pilotPassword } from "../helpers/pilot-fixture.js";
import { createHttpApi } from "../../apps/api/src/http.js";
const fixture = await createPilotFixture();
const { app, response, actor } = fixture;
const ownerRegistration = await app.identity.register(
  {
    type: "company",
    name: "Browser Laundry Owner",
    companyName: "Cape Coast Browser Laundry",
    areaId: "amamoma",
    email: "owner@pilot.example",
    password: pilotPassword,
  },
  response,
  null,
);
await app.identity.register(
  {
    type: "student",
    name: "Browser Pilot Student",
    email: "student@pilot.example",
    password: pilotPassword,
  },
  response,
  null,
);
const owner = await actor(ownerRegistration.id),
  admin = await actor("pilot-admin"),
  companyId = owner.companyId!;
await app.ops.updateBusiness(owner, {
  name: "Cape Coast Browser Laundry",
  description:
    "A Cape Coast laundry offering careful washing and folding for local campus residents.",
  location: "Amamoma main road, Cape Coast",
  primaryAreaId: "amamoma",
  registrationRef: "CC-BROWSER-REG-2026",
  areas: ["amamoma"],
  pickup: true,
  deliveryFee: 500,
  minimum: 1000,
  capacity: 12,
  turnaroundHours: 24,
  instantBooking: true,
});
await app.ops.service(owner, {
  name: "Everyday wash & fold",
  category: "wash-fold",
  description: "Careful washing and folding of everyday laundry.",
  unit: "load",
  price: 2500,
  active: true,
});
await app.db.operatingHour.createMany({
  data: Array.from({ length: 7 }, (_, day) => ({
    companyId,
    day,
    open: "09:00",
    close: "17:00",
  })),
});
const image = await sharp({
  create: { width: 800, height: 600, channels: 3, background: "#b6c9e0" },
})
  .png()
  .toBuffer();
await app.files.upload(owner, {
  companyId,
  name: "registration.png",
  mime: "image/png",
  base64: image.toString("base64"),
});
await app.files.photo(owner, {
  name: "premises.png",
  base64: image.toString("base64"),
  kind: "photo",
});
await app.ops.application(
  admin,
  companyId,
  "approved",
  "Reviewed the registration document and company details.",
);
await app.admissions.settlementRequest(owner, {
  bankCode: "GH001",
  bankName: "",
  accountName: "Cape Coast Browser Laundry",
  accountNumber: "0000000000",
});
await app.admissions.approveSettlement(admin, companyId, {
  reason: "Reviewed the requested bank destination and provider account.",
});
const company = await app.db.company.findUniqueOrThrow({
  where: { id: companyId },
});
const server = express();
server.use("/__fixture", express.json());
server.get("/__fixture/state", (_req, res) =>
  res.json({ ready: true, companyId, slug: company.slug }),
);
server.post("/__fixture/complete", async (req, res) => {
  try {
    const transaction = await fixture.settle(req.body.reference, {
      channel: req.body.channel || "card",
    });
    await fixture.webhook(req.body.reference);
    res.json({ callback: transaction.callback_url });
  } catch {
    res.status(400).json({ message: "Unknown fixture transaction." });
  }
});
server.post("/__fixture/prepare-audit", async (_req, res) => {
  try {
    if (!(await app.db.order.count())) {
      const student = await actor(
        (
          await app.db.user.findUniqueOrThrow({
            where: { email: "student@pilot.example" },
          })
        ).id,
      );
      for (const [payer, kind, planId] of [
        [owner, "hosting", "essential"],
        [student, "student", "plus-monthly"],
      ] as const) {
        const plan = await app.db.plan.findFirstOrThrow({
          where: {
            kind,
            active: true,
            ...(kind === "hosting" ? { id: planId } : {}),
          },
        });
        const payment = await app.payments.checkout(payer, {
          kind,
          planId: plan.id,
          ...(kind === "hosting" ? { companyId } : {}),
          idempotencyKey: crypto.randomUUID(),
        });
        await fixture.settle(payment.reference);
        await app.payments.verify(payer, payment.reference);
        const subscription = await app.db.subscription.findFirstOrThrow({
          where: { paymentId: payment.id },
        });
        await app.admissions.subscription(
          admin,
          subscription.id,
          "approve",
          "Verified payment for complete page coverage.",
        );
      }
      await app.ops.publish(owner);
      await app.jobs.fillSlots(new Date());
      const service = await app.db.service.findFirstOrThrow({
        where: { companyId, active: true },
      });
      const slot = (await app.market.slots(companyId)).find(
        (slot) => slot.available > 0,
      )!;
      const order = await app.market.book(student, {
        companyId,
        items: [{ serviceId: service.id, quantity: 2 }],
        slotId: slot.id,
        method: "pickup",
        address: {
          areaId: "amamoma",
          detail: "Amamoma main road near the campus gate",
        },
        idempotencyKey: crypto.randomUUID(),
      });
      const payment = await app.payments.checkout(student, {
        kind: "order",
        orderId: order.id,
        idempotencyKey: crypto.randomUUID(),
      });
      await fixture.settle(payment.reference);
      await app.payments.verify(student, payment.reference);
      const code = (
        await app.market.order(student, order.id)
      ).handoverNotice!.match(/\d{6}/)![0];
      for (const status of [
        "collected",
        "processing",
        "ready",
        "out_for_delivery",
        "delivered",
      ])
        await app.market.transition(
          owner,
          order.id,
          status,
          "Laundry care and verified handover",
          status === "delivered" ? code : undefined,
        );
      await app.market.transition(
        student,
        order.id,
        "completed",
        "Received the garments",
      );
      const ticket = await app.ops.ticket(student, {
        name: student.name,
        subject: "Collection support",
        category: "booking",
        body: "Help with collection details",
        orderId: order.id,
      });
      await app.ops.replyTicket(
        admin,
        ticket.id,
        "The company has confirmed your collection details.",
      );
    }
    res.json({ ready: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Audit preparation failed." });
  }
});
server.use(createHttpApi(app));
// createHttpApi has a fallback; mount static content before that fallback by
// forwarding only API requests to it.
const website = express();
website.use(["/api", "/__fixture"], (req, res, next) => {
  req.url = req.originalUrl;
  server(req, res, next);
});
website.use(express.static(path.resolve("dist/web")));
website.get("/{*path}", (_req, res) =>
  res.sendFile(path.resolve("dist/web/index.html")),
);
const listener = website.listen(4111, "127.0.0.1", () =>
  console.log("Paystack browser fixture ready"),
);
const timer = setInterval(() => void app.jobs.tick(), 2000);
timer.unref();
process.on("message", (message) => {
  if (message === "shutdown") {
    clearInterval(timer);
    listener.close(() => void fixture.close().then(() => process.exit(0)));
  }
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(timer);
    listener.close(() => void fixture.close().then(() => process.exit(0)));
  });
