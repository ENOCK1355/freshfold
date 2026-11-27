import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPilotFixture, pilotPassword } from "./helpers/pilot-fixture.js";
import { FileService, pdfScannerConfigured } from "../apps/api/src/files.js";

let fixture: Awaited<ReturnType<typeof createPilotFixture>>;
let student: any, owner: any, admin: any;
beforeAll(async () => {
  fixture = await createPilotFixture();
  const { app, response, actor } = fixture;
  for (const type of ["student", "company"] as const) {
    const user = await app.identity.register(
      {
        type,
        name: "Release Account",
        email: `${type}.release@pilot.example`,
        password: pilotPassword,
        ...(type === "company"
          ? { companyName: "Release Laundry", areaId: "amamoma" }
          : {}),
      },
      response,
      null,
    );
    if (type === "student") student = await actor(user.id);
    else owner = await actor(user.id);
  }
  admin = await actor("pilot-admin");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await fixture?.close();
});

describe("release readiness", () => {
  it("paginates notifications beyond fifty with complete unread counts and account isolation", async () => {
    const { app } = fixture;
    await app.db.notification.deleteMany();
    await app.db.notification.createMany({
      data: Array.from({ length: 63 }, (_, i) => ({
        userId: student.id,
        title: `Notice ${i}`,
        body: "Order update",
        href: "/account/orders",
        readAt: i < 3 ? new Date() : null,
      })),
    });
    await app.notifications.notify(
      owner.id,
      "Private owner notice",
      "Private",
      "/business",
    );
    const first: any = await app.notifications.list(student.id, {
      paged: "true",
      limit: "50",
    });
    const last: any = await app.notifications.list(student.id, {
      paged: "true",
      limit: "50",
      page: "2",
    });
    expect(first).toMatchObject({ total: 63, unread: 60, pages: 2 });
    expect(last.items).toHaveLength(13);
    expect(new Set([...first.items, ...last.items].map((n) => n.id)).size).toBe(
      63,
    );
    expect(last.items.every((n: any) => n.userId === student.id)).toBe(true);
  });

  it("keeps support history reachable beyond one hundred and sends owners to business support", async () => {
    const { app } = fixture;
    await app.db.ticket.createMany({
      data: Array.from({ length: 106 }, (_, i) => ({
        reference: `RELEASE-CASE-${i}`,
        userId: student.id,
        name: student.name,
        subject: `Support case ${i}`,
        category: "account",
        body: "Account assistance",
        status: i < 6 ? "resolved" : "open",
      })),
    });
    const ownerCase = await app.ops.ticket(owner, {
      name: owner.name,
      subject: "Business support",
      category: "business",
      body: "Help with laundry account",
    });
    const mine: any = await app.ops.tickets(student, {
      paged: "true",
      page: "5",
      limit: "25",
    });
    expect(mine).toMatchObject({ total: 106, pages: 5 });
    expect(mine.items).toHaveLength(6);
    expect(
      ((await app.ops.tickets(admin, { paged: "true", status: "open" })) as any)
        .total,
    ).toBe(101);
    await app.ops.replyTicket(
      admin,
      ownerCase.id,
      "We have reviewed your account.",
      "resolved",
    );
    expect(
      (
        await app.db.notification.findFirstOrThrow({
          where: { userId: owner.id, title: "Your support case has an update" },
        })
      ).href,
    ).toBe("/business/support");
    await expect(
      app.ops.replyTicket(student, ownerCase.id, "Unauthorised reply"),
    ).rejects.toThrow(/another account/);
  });

  it("reconciles every pending provider batch and excludes old simulator attempts", async () => {
    const { app } = fixture;
    await app.db.payment.createMany({
      data: Array.from({ length: 42 }, (_, i) => ({
        reference: `RELEASE-PENDING-${i}`,
        idempotencyKey: `release-pending-${i}`,
        userId: student.id,
        kind: "student",
        amount: 2500,
        status: "pending",
        mode: i < 40 ? "paystack_test" : "simulator",
        source: "release",
        runId: "release",
        createdAt: new Date(Date.now() - 120000),
      })),
    });
    await app.jobs.reconcile();
    await app.jobs.reconcile();
    const jobs = await app.db.job.findMany({ where: { kind: "reconcile" } });
    const references = new Set(
      jobs.map((job) => (job.payload as any).reference),
    );
    expect(references.size).toBe(40);
    expect(references.has("RELEASE-PENDING-40")).toBe(false);
    expect(references.has("RELEASE-PENDING-41")).toBe(false);
  });

  it("rejects PDF onboarding before storing documents when no scanner is configured", async () => {
    const { app } = fixture;
    vi.stubEnv("CLAMAV_HOST", "");
    vi.stubEnv("FILE_SCANNER_URL", "");
    vi.stubEnv("FILE_SCANNER_TOKEN", "");
    expect(pdfScannerConfigured()).toBe(false);
    const before = await app.db.storedFile.count();
    try {
      await expect(
        app.files.upload(owner, {
          companyId: owner.companyId,
          name: "registration.pdf",
          mime: "application/pdf",
          base64: Buffer.from("%PDF-1.7\nregistration").toString("base64"),
        }),
      ).rejects.toThrow(/PNG or JPEG/);
      expect(await app.db.storedFile.count()).toBe(before);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uploads to compatible object storage without an unsupported encryption header", async () => {
    vi.stubEnv("S3_BUCKET", "release-private");
    vi.stubEnv("S3_ENDPOINT", "https://objects.example.test");
    const fileService = new FileService(
      fixture.app.db,
      fixture.config,
      fixture.app.auth,
    );
    const send = vi.fn().mockResolvedValue({});
    fileService.s3 = { send } as any;
    try {
      await fileService.store(
        "registration.jpg",
        Buffer.from("bytes"),
        "image/jpeg",
      );
      expect(send.mock.calls[0][0].input).toMatchObject({
        Bucket: "release-private",
        Key: "registration.jpg",
        ContentType: "image/jpeg",
      });
      expect(send.mock.calls[0][0].input).not.toHaveProperty(
        "ServerSideEncryption",
      );
      vi.stubEnv("S3_ENDPOINT", "");
      await fileService.store(
        "registration.jpg",
        Buffer.from("bytes"),
        "image/jpeg",
      );
      expect(send.mock.calls[1][0].input.ServerSideEncryption).toBe("AES256");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
