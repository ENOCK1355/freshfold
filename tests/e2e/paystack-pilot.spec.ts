import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import AxeBuilder from "@axe-core/playwright";
const base = "http://127.0.0.1:4111";
const password = "Pilot.Fixture!2026.TestOnly";
const auditRoot =
  process.env.FRESHFOLD_AUDIT_ROOT ||
  path.join(tmpdir(), "freshfold-browser-audit");
mkdirSync(auditRoot, { recursive: true });
const serverLog = path.join(auditRoot, "dashboard-browser-server.log");
test.describe.configure({ mode: "serial" });
let ownedServer: ChildProcess | undefined;
test.beforeAll(async () => {
  const ready = () =>
    fetch(base + "/__fixture/state")
      .then((response) => response.ok)
      .catch(() => false);
  if (await ready()) return;
  writeFileSync(serverLog, "");
  ownedServer = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/paystack-browser-server.ts"],
    { stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true },
  );
  for (const stream of [ownedServer.stdout, ownedServer.stderr])
    stream?.on("data", (chunk) => appendFileSync(serverLog, chunk));
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("The isolated Paystack browser fixture could not start.");
});
test.afterAll(async () => {
  if (ownedServer?.connected) {
    ownedServer.send("shutdown");
    await new Promise((resolve) => {
      ownedServer!.once("exit", resolve);
      setTimeout(resolve, 5000);
    });
    if (ownedServer.exitCode === null) ownedServer.kill();
  }
});
async function login(page: Page, email: string) {
  await page.goto(base + "/sign-in");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const response = page.waitForResponse(
    (response) =>
      response.url() === base + "/api/auth/login" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/(business|account|admin)$/, {
    timeout: 30000,
  });
}
async function hostedCheckout(page: Page, channel = "card") {
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toHaveCount(0);
  await page.route("https://checkout.paystack.com/e2e-*", async (route) => {
    const reference = new URL(route.request().url()).pathname.slice(
      "/e2e-".length,
    );
    const result = await page.request.post(base + "/__fixture/complete", {
      data: { reference, channel },
    });
    expect(result.ok()).toBe(true);
    const data = await result.json();
    await route.fulfill({
      contentType: "text/html",
      body: `<a href="${data.callback}">Return to Fresh Fold</a>`,
    });
  });
  await page.getByRole("link", { name: "Open Paystack checkout" }).click();
  await page.getByRole("link", { name: "Return to Fresh Fold" }).click();
  await expect(
    page.getByRole("heading", { name: "Payment confirmed.", exact: true }),
  ).toBeVisible();
}

test("hosted checkout, admin activation, listing, order fulfilment, commission, and Plus work across three accounts", async ({
  browser,
}) => {
  test.setTimeout(300000);
  const ownerContext = await browser.newContext(),
    studentContext = await browser.newContext(),
    adminContext = await browser.newContext();
  const owner = await ownerContext.newPage(),
    student = await studentContext.newPage(),
    admin = await adminContext.newPage();
  const errors: string[] = [];
  for (const page of [owner, student, admin])
    page.on("pageerror", (error) => errors.push(error.message));
  try {
    await login(owner, "owner@pilot.example");
    await owner.goto(base + "/pricing");
    await owner
      .getByRole("button", { name: "Choose Essential", exact: true })
      .click();
    await expect(owner).toHaveURL(/checkout\//);
    await hostedCheckout(owner);
    await owner.goto(base + "/business/subscription");
    await expect(
      owner.getByText("pending approval", { exact: true }),
    ).toBeVisible();
    await login(admin, "admin@pilot.example");
    await admin.goto(base + "/admin/subscriptions");
    const hosting = admin
      .getByRole("row")
      .filter({ hasText: "Company Essential" });
    await hosting.getByRole("button", { name: "Review", exact: true }).click();
    await admin
      .getByLabel("Review notes")
      .fill("Checked Paystack hosting payment and business verification.");
    await admin
      .getByRole("button", { name: "Save subscription decision" })
      .click();
    await expect(admin.getByRole("dialog")).toHaveCount(0);
    await admin.goto(base + "/admin/companies");
    await admin
      .getByRole("row")
      .filter({ hasText: "Cape Coast Browser Laundry" })
      .getByRole("button", { name: "Review application" })
      .click();
    await admin
      .getByRole("button", { name: "Publish approved company" })
      .click();
    await expect(admin.getByRole("dialog")).toHaveCount(0);
    const state = await (
      await owner.request.get(base + "/__fixture/state", { maxRetries: 2 })
    ).json();
    const adminLive = await adminContext.newPage();
    const ownerLive = await ownerContext.newPage();
    for (const page of [adminLive, ownerLive])
      page.on("pageerror", (error) => errors.push(error.message));
    await adminLive.goto(base + "/admin");
    await expect(
      adminLive
        .locator(".metric")
        .filter({ hasText: "Live laundry listings" })
        .locator("strong"),
    ).toHaveText("1");
    await expect(
      adminLive
        .getByText("Total collections", { exact: true })
        .locator("..")
        .locator("strong"),
    ).toContainText("75.00");
    await ownerLive.goto(base + "/business");
    await expect(
      ownerLive
        .locator(".metric")
        .filter({ hasText: "Paid laundry transactions" })
        .locator("strong"),
    ).toHaveText("0");
    await login(student, "student@pilot.example");
    await student.goto(base + "/book/" + state.slug);
    await student
      .getByRole("button", {
        name: "Add one Everyday wash & fold",
        exact: true,
      })
      .click();
    await expect(
      student.locator(".quantity-control > span").first(),
    ).toHaveText("2");
    await student
      .getByRole("button", { name: "Choose your collection details" })
      .click();
    await student
      .getByLabel("Collection address", { exact: true })
      .fill("Amamoma main road, residence by the campus gate");
    await student
      .getByRole("button", { name: "Review your booking", exact: true })
      .click();
    await student
      .getByRole("button", { name: "Reserve & continue to payment" })
      .click();
    await expect(student).toHaveURL(/checkout\//);
    const paymentId = new URL(student.url()).pathname.split("/").pop();
    await hostedCheckout(student, "mobile_money");
    await adminLive.bringToFront();
    await expect(
      adminLive
        .getByText("Total collections", { exact: true })
        .locator("..")
        .locator("strong"),
    ).toContainText("133.00", { timeout: 30000 });
    await ownerLive.bringToFront();
    await expect(
      ownerLive
        .locator(".metric")
        .filter({ hasText: "Customer payments" })
        .locator("strong"),
    ).toContainText("58.00", { timeout: 30000 });
    await expect(
      ownerLive
        .locator(".metric")
        .filter({ hasText: "Company earnings" })
        .locator("strong"),
    ).toContainText("49.00");
    const payment = await (
      await student.request.get(base + "/api/payments/" + paymentId, {
        maxRetries: 2,
      })
    ).json();
    await student.goto(base + "/account/orders/" + payment.orderId);
    const code = (await student
      .getByText(/Your private delivery confirmation code/)
      .textContent())!.match(/\d{6}/)![0];
    await owner.goto(base + "/business/orders/" + payment.orderId);
    for (const status of [
      "collected",
      "processing",
      "ready",
      "out_for_delivery",
      "delivered",
    ]) {
      await owner.getByLabel("Update fulfilment status").selectOption(status);
      if (status === "delivered")
        await owner.getByLabel("Customer’s handover code").fill(code);
      await owner
        .getByRole("button", { name: "Save order update", exact: true })
        .click();
      await expect(
        owner
          .locator(".page-head")
          .getByText(status.replaceAll("_", " "), { exact: true }),
      ).toBeVisible();
    }
    await student.reload();
    await student.getByLabel("Your next step").selectOption("completed");
    await student
      .getByRole("button", { name: "Save order update", exact: true })
      .click();
    await expect(
      student.locator(".page-head").getByText("completed", { exact: true }),
    ).toBeVisible();
    await admin.goto(base + "/admin/payments");
    await admin.getByLabel("Payment purpose").selectOption("order");
    const orderRow = admin
      .getByRole("row")
      .filter({ hasText: payment.reference });
    await expect(orderRow.getByText(/commission/)).toBeVisible();
    await orderRow.getByRole("button", { name: "Review", exact: true }).click();
    await admin
      .getByLabel("Review notes")
      .fill("Confirmed the order payment and commission allocation.");
    await admin
      .getByRole("button", { name: "Confirm verified payment" })
      .click();
    await expect(admin.getByRole("dialog")).toHaveCount(0);
    await student.goto(base + "/student-plus");
    await student
      .getByRole("button", { name: "Discover your Plus", exact: true })
      .click();
    await expect(student).toHaveURL(/checkout\//);
    await hostedCheckout(student);
    await adminLive.bringToFront();
    await expect(
      adminLive
        .getByText("Total collections", { exact: true })
        .locator("..")
        .locator("strong"),
    ).toContainText("158.00", { timeout: 30000 });
    await expect(
      adminLive
        .getByText("Successful transactions", { exact: true })
        .locator("..")
        .locator("strong"),
    ).toHaveText("3");
    await ownerLive.bringToFront();
    await expect(
      ownerLive
        .locator(".metric")
        .filter({ hasText: "Customer payments" })
        .locator("strong"),
    ).toContainText("58.00");
    await student.goto(base + "/account/billing");
    await expect(
      student.getByText("pending approval", { exact: true }),
    ).toBeVisible();
    await admin.goto(base + "/admin/subscriptions");
    await admin
      .getByRole("row")
      .filter({ hasText: "Student Plus" })
      .getByRole("button", { name: "Review", exact: true })
      .click();
    await admin
      .getByLabel("Review notes")
      .fill("Verified Student Plus transaction and account details.");
    await admin
      .getByRole("button", { name: "Save subscription decision" })
      .click();
    await expect(admin.getByRole("dialog")).toHaveCount(0);
    await student.reload();
    await expect(student.getByText("active", { exact: true })).toBeVisible();
    for (const page of [admin, owner, student, adminLive, ownerLive]) {
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);
      }
    }
    expect(errors).toEqual([]);
  } finally {
    await ownerContext.close();
    await studentContext.close();
    await adminContext.close();
  }
});

test("every public, student, company, and admin page loads cleanly on mobile and desktop", async ({
  browser,
}) => {
  test.setTimeout(600000);
  const checks: any[] = [],
    problems: any[] = [];
  const save = () =>
    writeFileSync(
      path.join(auditRoot, "all-pages-browser-audit.json"),
      JSON.stringify({ checks, problems }, null, 2),
    );
  const prepared = await fetch(base + "/__fixture/prepare-audit", {
    method: "POST",
  });
  expect(prepared.ok, await prepared.text()).toBe(true);
  const state = await (await fetch(base + "/__fixture/state")).json();
  const publicRoutes = [
    "/",
    "/find-laundry",
    "/find-laundry?area=amamoma&service=wash-fold",
    "/compare",
    "/how-it-works",
    "/student-plus",
    "/for-businesses",
    "/pricing",
    "/about",
    "/help",
    "/contact",
    "/coverage",
    "/terms",
    "/privacy",
    "/refund-policy",
    "/care-policy",
    "/register",
    "/register?type=company",
    "/sign-in",
    "/forgot-password",
    "/reset-password",
    "/page-not-found",
    `/laundry/${state.slug}`,
    ...[
      "booking",
      "payments",
      "membership",
      "business",
      "care",
      "collections",
      "account",
      "tracking",
    ].map((slug) => "/help/" + slug),
  ];
  const groups = [
    { name: "public", email: "", root: "", tabs: publicRoutes },
    {
      name: "student",
      email: "student@pilot.example",
      root: "/account",
      tabs: [
        "",
        "orders",
        "favorites",
        "schedules",
        "messages",
        "addresses",
        "billing",
        "receipts",
        "support",
        "settings",
        "notifications",
      ],
    },
    {
      name: "owner",
      email: "owner@pilot.example",
      root: "/business",
      tabs: [
        "",
        "orders",
        "calendar",
        "catalogue",
        "customers",
        "messages",
        "reviews",
        "earnings",
        "settlements",
        "subscription",
        "promotions",
        "staff",
        "profile",
        "coverage",
        "branches",
        "onboarding",
        "settings",
        "notifications",
        "support",
      ],
    },
    {
      name: "admin",
      email: "admin@pilot.example",
      root: "/admin",
      tabs: [
        "",
        "companies",
        "users",
        "orders",
        "revenue",
        "refunds",
        "support",
        "settings",
        "subscriptions",
        "payments",
        "plans",
        "coverage",
        "content",
        "audit",
        "notifications",
      ],
    },
  ];
  for (const group of groups) {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    let current = "";
    page.on("pageerror", (error) =>
      problems.push({
        group: group.name,
        route: current,
        error: error.message,
      }),
    );
    page.on("response", (response) => {
      if (
        response.status() >= 400 &&
        response.url().startsWith(base + "/api/") &&
        !(response.status() === 401 && response.url().includes("/auth/me"))
      )
        problems.push({
          group: group.name,
          route: current,
          status: response.status(),
          url: response.url(),
        });
    });
    try {
      if (group.email) await login(page, group.email);
      const routes = group.root
        ? group.tabs.map((tab) => group.root + (tab ? "/" + tab : ""))
        : group.tabs;
      if (group.name !== "public") {
        const result = await page.request.get(
          base +
            "/api/orders?paged=true" +
            (group.name === "owner" ? "&view=business" : ""),
        );
        const orders = await result.json();
        expect(orders.items?.length).toBeGreaterThan(0);
        routes.push(group.root + "/orders/" + orders.items[0].id);
        if (group.name === "student") {
          routes.push("/book/" + state.slug);
          const order = await (
            await page.request.get(base + "/api/orders/" + orders.items[0].id)
          ).json();
          const receipt = order.payments.find(
            (payment: any) => payment.status === "success",
          );
          if (receipt)
            routes.push(
              "/checkout/" + receipt.id,
              "/payment/return?reference=" + receipt.reference,
            );
        }
      }
      for (const route of routes) {
        current = route;
        const widths =
          route === group.root ||
          [
            "/",
            "/register",
            "/register?type=company",
            "/admin/payments",
            "/business/onboarding",
            "/business/settlements",
            "/book/" + state.slug,
          ].includes(route)
            ? [1440, 390, 320, 768, 1024]
            : [1440, 390];
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          const response = await page.goto(base + route, {
            waitUntil: "domcontentloaded",
          });
          expect(response?.ok(), route).toBe(true);
          await expect(page.locator("h1").first(), route).toBeVisible({
            timeout: 20000,
          });
          await page.waitForTimeout(140);
          const geometry = await page.evaluate(async () => {
            const images = Array.from(document.images);
            for (const image of images) image.loading = "eager";
            await Promise.all(
              images.map((image) => image.decode().catch(() => undefined)),
            );
            return {
              title: document.querySelector("h1")?.textContent?.trim(),
              overflow:
                document.documentElement.scrollWidth >
                document.documentElement.clientWidth + 1,
              overflowNodes: Array.from(document.querySelectorAll("body *"))
                .filter((node) => {
                  const r = node.getBoundingClientRect();
                  return (
                    r.width > 0 &&
                    r.right > innerWidth + 2 &&
                    getComputedStyle(node).position !== "fixed"
                  );
                })
                .slice(0, 5)
                .map((node) => ({
                  tag: node.tagName,
                  className: node.className,
                })),
              brokenImages: images
                .filter(
                  (image) =>
                    image.currentSrc &&
                    (!image.complete || image.naturalWidth === 0),
                )
                .map((image) => image.currentSrc),
              emptyLinks: Array.from(
                document.querySelectorAll("a[href]"),
                (link) => link.getAttribute("href"),
              ).filter((href) => !href || href === "#"),
            };
          });
          checks.push({ group: group.name, route, width, ...geometry });
          if (
            geometry.overflow ||
            geometry.brokenImages.length ||
            geometry.emptyLinks.length
          )
            problems.push({ group: group.name, route, width, ...geometry });
          await expect(
            page.getByText("The page could not be loaded.", { exact: false }),
          ).toHaveCount(0);
          if (
            width === 1440 &&
            (route === group.root ||
              route === "/register" ||
              route === "/find-laundry" ||
              route === "/admin/payments")
          ) {
            const result = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            const issues = result.violations.filter((issue) =>
              ["serious", "critical"].includes(issue.impact || ""),
            );
            if (issues.length)
              problems.push({
                group: group.name,
                route,
                accessibility: issues.map((issue) => ({
                  id: issue.id,
                  impact: issue.impact,
                  nodes: issue.nodes.map((node) => node.target),
                })),
              });
          }
          if (
            width === 390 &&
            (route === group.root ||
              route === "/find-laundry" ||
              route === "/register?type=company" ||
              route === "/admin/payments" ||
              route === "/business/onboarding")
          )
            await page.screenshot({
              path: path.join(
                auditRoot,
                `${group.name}-${route.replace(/[^a-z0-9]+/gi, "-") || "home"}.png`,
              ),
              fullPage: true,
            });
          save();
        }
      }
      if (group.name === "student") {
        await page.goto(base + "/admin");
        await expect(page).toHaveURL(/\/account$/);
        await page.goto(base + "/business");
        await expect(page).toHaveURL(/\/account$/);
      }
    } finally {
      save();
      await context.close();
    }
  }
  writeFileSync(
    path.join(auditRoot, "all-pages-browser-audit.json"),
    JSON.stringify({ checks, problems }, null, 2),
  );
  expect(problems, JSON.stringify(problems, null, 2)).toEqual([]);
});
