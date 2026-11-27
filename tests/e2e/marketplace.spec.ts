import { expect, test, type Page } from "@playwright/test";
async function post(page: Page, path: string, data: unknown) {
  const session = await (await page.request.get("/api/auth/me")).json();
  const response = await page.request.post("/api/" + path, {
    data,
    headers: session.user?.csrf ? { "X-CSRF-Token": session.user.csrf } : {},
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function enter(page: Page, name: string) {
  const accounts = await (await page.request.get("/api/demo/accounts")).json();
  const account = accounts.find((item: any) => item.name === name);
  expect(account, name).toBeTruthy();
  const result = await post(page, "demo/login", { userId: account.id });
  await page.goto(
    result.role === "admin" || result.role === "support"
      ? "/admin"
      : result.role === "student"
        ? "/account"
        : "/business",
  );
  await expect(page).toHaveURL(/\/(account|business|admin)$/);
}
async function confirmFixturePayment(page: Page, exerciseOutcomes = false) {
  const paymentId = new URL(page.url()).pathname.split("/").pop()!;
  if (exerciseOutcomes) {
    for (const scenario of [
      "declined",
      "insufficient_funds",
      "pending",
      "cancelled",
    ]) {
      const result = await post(page, `payments/${paymentId}/simulate`, {
        scenario,
      });
      expect(result.status).toBe(
        scenario === "pending"
          ? "pending"
          : scenario === "cancelled"
            ? "cancelled"
            : "failed",
      );
    }
  }
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toHaveCount(0);
  await post(page, `payments/${paymentId}/simulate`, {
    scenario: exerciseOutcomes ? "duplicate" : "success",
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Payment confirmed.", exact: true }),
  ).toBeVisible();
  return (await page.request.get("/api/payments/" + paymentId)).json();
}
test("public routes, direct navigation, imagery, WhatsApp, filters, comparison, and mobile navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of [
    "/",
    "/find-laundry",
    "/how-it-works",
    "/student-plus",
    "/for-businesses",
    "/pricing",
    "/about",
    "/help",
    "/help/booking",
    "/help/payments",
    "/help/membership",
    "/help/business",
    "/contact",
    "/coverage",
    "/terms",
    "/privacy",
    "/refund-policy",
    "/care-policy",
    "/sign-in",
    "/register",
  ]) {
    const r = await page.goto(path);
    expect(r?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(
      page.getByText("Let’s freshen that up.", { exact: true }),
    ).toHaveCount(0);
  }
  await page.goto("/find-laundry");
  await page
    .getByRole("combobox", { name: "Laundry location", exact: true })
    .selectOption("amamoma");
  await expect(page).toHaveURL(/area=amamoma/);
  await page
    .getByRole("textbox", { name: "Search laundry companies" })
    .fill("Campus Linen");
  await expect(page.locator(".results .company-card")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Search laundry companies" })
    .fill("");
  await expect(page.locator(".results .company-card")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Laundry location", exact: true })
    .selectOption("");
  await expect(page.locator(".results .company-card")).toHaveCount(4);
  await page.locator(".results .compare-check input").nth(0).check();
  await page.locator(".results .compare-check input").nth(1).check();
  await page
    .getByRole("link", { name: "Compare companies", exact: true })
    .click();
  await expect(page.locator(".compare-company")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .locator(".public-nav")
    .getByRole("link", { name: "Find laundry", exact: true })
    .click();
  await expect(page).toHaveURL(/find-laundry/);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("radio", { name: "Bedding & linen", exact: true })
    .click();
  await expect(page).toHaveURL(/service=bedding/);
  await page.goto("/");
  await expect(
    page.locator('a[href="https://wa.me/233551234987"]').first(),
  ).toBeAttached();
  for (const img of await page.locator("img").all()) {
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveJSProperty("complete", true);
    await expect
      .poll(() => img.evaluate((i) => (i as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});
test("a new student registers, tests payment, receives fulfilment, confirms handover, and reviews", async ({
  page,
}) => {
  const email = `browser.student.${Date.now()}@freshfold.test`;
  await page.goto("/register");
  await page.getByLabel("Your full name").fill("Browser Journey Student");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser.Journey!2026");
  await page
    .getByRole("button", { name: "Create your account", exact: true })
    .click();
  await expect(page).toHaveURL(/account$/);
  await page.goto("/book/campus-linen");
  await page
    .getByRole("button", { name: "Add one Wash & fold", exact: true })
    .click({ clickCount: 3 });
  await page
    .getByRole("button", { name: "Choose your collection details" })
    .click();
  await page
    .getByLabel("Collection address", { exact: true })
    .fill("DEMO · Valco Hall browser journey collection");
  let quoteRequests = 0;
  await page.route("**/api/bookings/quote", async (route) => {
    quoteRequests++;
    if (quoteRequests === 1)
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Your session changed. Refresh the page and try again.",
          details: { code: "CSRF_TOKEN_INVALID" },
        }),
      });
    return route.continue();
  });
  await page
    .getByRole("button", { name: "Review your booking", exact: true })
    .click();
  await expect(page.getByText(/103\.00/).last()).toBeVisible();
  expect(quoteRequests).toBe(2);
  await page.unroute("**/api/bookings/quote");
  await page
    .getByRole("button", { name: "Reserve & continue to payment" })
    .click();
  await expect(page).toHaveURL(/checkout/);
  const payment = await confirmFixturePayment(page, true);
  await page.goto("/account/orders/" + payment.orderId);
  const url = page.url();
  const orderId = url.split("/").pop()!;
  const reference = (await page.locator(".page-head h1").textContent())!;
  const code = (await page
    .getByText(/Your private delivery confirmation code/)
    .textContent())!.match(/\d{6}/)![0];
  await enter(page, "Akua · Campus Linen Laundry");
  await expect(
    page
      .locator(".sidebar")
      .getByRole("link", { name: "Reports", exact: true }),
  ).toHaveCount(0);
  await page.goto("/business/reports");
  await expect(page).toHaveURL(/business\/earnings$/);
  await page.goto(`/business/orders/${orderId}`);
  for (const state of [
    "collected",
    "processing",
    "ready",
    "out_for_delivery",
    "delivered",
  ]) {
    await page.getByLabel("Update fulfilment status").selectOption(state);
    if (state === "delivered")
      await page.getByLabel("Customer’s handover code").fill(code);
    await page
      .getByRole("button", { name: "Save order update", exact: true })
      .click();
    await expect(
      page
        .locator(".page-head")
        .getByText(state.replaceAll("_", " "), { exact: true }),
    ).toBeVisible();
  }
  await page.goto("/sign-in");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser.Journey!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/account$/);
  await page.goto(`/account/orders/${orderId}`);
  await page.getByLabel("Your next step").selectOption("completed");
  await page.getByRole("button", { name: "Save order update" }).click();
  await expect(
    page.locator(".page-head").getByText("completed", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Your experience")
    .fill(
      "Careful folding, clear updates, and a smooth handover for my completed laundry order.",
    );
  await page.getByRole("button", { name: "Share your review" }).click();
  await expect(page.getByText("Your review has been published.")).toBeVisible();
  expect(reference).toMatch(/^FF-/);
});
test("company registration, review, hosting purchase, service catalogue, publication, and admin financial views", async ({
  page,
}) => {
  const suffix = Date.now();
  const ownerName = `Browser Owner ${suffix}`;
  const companyName = `Cape Campus Care ${suffix}`;
  await page.goto("/register?type=company");
  await page.getByLabel("Your full name").fill(ownerName);
  await page.getByLabel("Laundry business name").fill(companyName);
  await page.getByLabel("Business area").selectOption("amamoma");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`browser.owner.${suffix}@freshfold.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser.Company!2026");
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page).toHaveURL(/business$/);
  await page.goto("/business/catalogue");
  await page.getByRole("button", { name: "Add a service" }).click();
  await page
    .getByLabel("Service name", { exact: true })
    .fill("Everyday wash & fold");
  await page
    .getByLabel("What does this service include?")
    .fill(
      "Separate wash, dry, and careful folding for one everyday student laundry load.",
    );
  await page.getByRole("button", { name: "Save service", exact: true }).click();
  await expect(
    page.getByText("Everyday wash & fold", { exact: true }),
  ).toBeVisible();
  await page.goto("/business/coverage");
  await page.getByLabel("Monday", { exact: true }).check();
  await page.getByLabel("Tuesday", { exact: true }).check();
  await page.getByLabel("Wednesday", { exact: true }).check();
  await page.getByLabel("Thursday", { exact: true }).check();
  await page.getByLabel("Friday", { exact: true }).check();
  await page.getByLabel("Saturday", { exact: true }).check();
  await page.getByRole("button", { name: "Save opening hours" }).click();
  await expect(
    page.getByText("Opening hours saved.", { exact: false }),
  ).toBeVisible();
  await page.goto("/business/onboarding");
  await page.getByLabel("Upload a verification document").setInputFiles({
    name: "DEMONSTRATION-NOT-VALID.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "DEMONSTRATION - NOT VALID. Synthetic browser-test business verification document.",
    ),
  });
  await expect(
    page.getByText("DEMONSTRATION-NOT-VALID.txt", { exact: true }),
  ).toBeVisible();
  await enter(page, "Fresh Fold");
  await page.goto("/admin/companies");
  await page
    .getByRole("row")
    .filter({ hasText: companyName })
    .getByRole("button", { name: "Review application" })
    .click();
  await page
    .getByLabel("Reason and reviewed evidence")
    .fill(
      "Reviewed the explicitly marked synthetic application sample in the isolated demo environment.",
    );
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: companyName })
      .getByText("approved", { exact: true }),
  ).toBeVisible();
  await enter(page, ownerName);
  await page.goto("/pricing");
  await page
    .getByRole("button", { name: "Choose Growth", exact: true })
    .click();
  await expect(page).toHaveURL(/checkout/);
  await confirmFixturePayment(page);
  await page.goto("/business/onboarding");
  await page.getByRole("button", { name: "Publish my business" }).click();
  await expect(
    page.getByText("Business published.", { exact: false }),
  ).toBeVisible();
  await enter(page, "Fresh Fold");
  for (const path of [
    "/admin/revenue",
    "/admin/refunds",
    "/admin/plans",
    "/admin/coverage",
    "/admin/content",
    "/admin/audit",
    "/admin/settings",
  ]) {
    await page.goto(path);
    await expect(page.locator(".page-head h1")).toBeVisible();
    await expect(page.locator(".dashboard-footnote")).toHaveCount(0);
    await expect(
      page.getByText("Let’s try that again.", { exact: true }),
    ).toHaveCount(0);
  }
});
test("small phones, tablets, and laptops retain usable public and account layouts", async ({
  page,
}) => {
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/screenshots/home-${width}.png`,
      fullPage: width === 390,
    });
  }
  await enter(page, "Ama Mensah");
  for (const path of [
    "/account",
    "/account/orders",
    "/account/favorites",
    "/account/addresses",
    "/account/billing",
    "/account/settings",
    "/account/support",
    "/account/messages",
    "/account/schedules",
  ]) {
    await page.goto(path);
    await expect(page.locator(".page-head h1")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/account");
  await page.getByRole("button", { name: "Open account navigation" }).click();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "My orders", exact: true })
    .click();
  await expect(page).toHaveURL(/account\/orders/);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
