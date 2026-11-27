import { expect, test } from "@playwright/test";

test("inner pages have useful content, working images, and no development labels", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    for (const path of [
      "/how-it-works",
      "/student-plus",
      "/for-businesses",
      "/pricing",
      "/about",
      "/help",
      "/help/booking",
      "/help/care",
      "/help/collections",
      "/help/account",
      "/help/tracking",
      "/contact",
      "/coverage",
      "/terms",
      "/privacy",
      "/refund-policy",
      "/care-policy",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      const image = page.locator("main img").first();
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate(
            (element) => (element as HTMLImageElement).naturalWidth,
          ),
        )
        .toBeGreaterThan(0);
      const text = await page.locator("main").innerText();
      expect(text.split(/\s+/).length, path).toBeGreaterThan(140);
      expect(text, path).not.toMatch(
        /\bdemo\b|demonstration|fictional|simulat(?:or|ed)|sample reviews|Africa\/Accra/,
      );
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
        `${path} at ${width}px`,
      ).toBeLessThanOrEqual(1);
    }
  }
});

test("page navigation restores the top, anchors scroll smoothly, and reduced motion is respected", async ({
  page,
}) => {
  await page.goto("/how-it-works");
  await page.getByRole("link", { name: "See the whole journey" }).click();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(200);
  await expect
    .poll(() =>
      page
        .locator("#your-laundry-day")
        .evaluate((element) =>
          Math.abs(element.getBoundingClientRect().top - 112),
        ),
    )
    .toBeLessThan(8);
  await page
    .locator(".site-footer")
    .getByRole("link", { name: "About Fresh Fold" })
    .click();
  await expect(page.locator("h1")).toContainText("A lighter load.");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(2);
  await expect(page.locator(".page-transition")).toHaveCount(1);
  await page.goBack();
  await expect(page.locator("h1")).toContainText("From laundry basket");
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(200);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/help");
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe("auto");
  await expect(
    page.locator(".scroll-reveal:not([data-visible=true])"),
  ).toHaveCount(0);
});

test("help discovery and membership estimates respond to the visitor", async ({
  page,
}) => {
  await page.goto("/help");
  await page.getByRole("button", { name: "Payments", exact: true }).click();
  await expect(page.locator(".guide-card")).toHaveCount(1);
  await page.getByRole("button", { name: "All guides", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search help articles" })
    .fill("not-a-guide");
  await expect(
    page.getByRole("heading", { name: "Let’s try a different word." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show all guides" }).click();
  await expect(page.locator(".guide-card")).toHaveCount(8);
  await page.goto("/student-plus");
  await page.locator("#monthly-orders").fill("12");
  await expect(page.locator(".savings-result")).toContainText(
    "Fee savings after membership",
  );
  await expect(page.locator(".savings-result strong")).toContainText("11.00");
});
