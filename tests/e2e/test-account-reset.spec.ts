import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const type of ["student", "company"] as const) {
  test(`${type} account can reset and register again with identical details`, async ({
    page,
  }) => {
    const email = `browser.reset.${type}.${Date.now()}@freshfold.test`;
    const password = "Repeat.Browser.Account!2026";
    const destination = type === "company" ? "/business" : "/account";
    async function fillRegistration(page: Page) {
      await page.getByLabel("Your full name").fill("Repeat Browser Tester");
      if (type === "company") {
        await page.getByLabel("Laundry business name").fill("Repeat Cape Care");
        await page.getByLabel("Business area").selectOption("amamoma");
      }
      await page.getByLabel("Email address", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page
        .getByRole("button", { name: "Create your account", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`${destination}$`));
    }
    await page.goto(
      type === "company" ? "/register?type=company" : "/register",
    );
    await fillRegistration(page);
    const first = await (await page.request.get("/api/auth/me")).json();
    await page.goto(destination + "/settings");
    await page
      .getByRole("button", { name: "Reset account", exact: true })
      .click();
    await page
      .getByLabel("Current password", { exact: true })
      .fill("wrong-password");
    await page
      .getByRole("button", { name: "Reset and register again", exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveText(
      "Your current password is incorrect.",
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include("dialog")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.getByLabel("Current password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Reset and register again", exact: true })
      .click();
    await expect(page).toHaveURL(
      type === "company" ? /\/register\?type=company$/ : /\/register$/,
    );
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Your account test is reset." }),
    ).toHaveCount(0);
    expect(
      (await (await page.request.get("/api/auth/me")).json()).user,
    ).toBeNull();
    await fillRegistration(page);
    const second = await (await page.request.get("/api/auth/me")).json();
    expect(second.user.id).not.toBe(first.user.id);
    expect(second.user.email).toBe(email);
    expect(second.user.premium).toBe(false);
    expect(await (await page.request.get("/api/orders")).json()).toEqual([]);
    await page.goto(destination + "/settings");
    await expect(
      page.getByRole("button", { name: "Reset account", exact: true }),
    ).toBeVisible();
  });
}

test("switching from business to student registration ignores hidden business fields", async ({
  page,
}) => {
  await page.goto("/register?type=company");
  await page.getByLabel("Laundry business name").fill("x");
  await page
    .getByRole("button", { name: "I’m a student", exact: true })
    .click();
  await expect(page.getByLabel("Laundry business name")).toHaveCount(0);
  await page.getByLabel("Your full name").fill("Student Registration Tester");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`browser.switch.${Date.now()}@freshfold.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Student.Registration!2026");
  const submission = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/auth/register") &&
      request.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create your account", exact: true })
    .click();
  const payload = (await submission).postDataJSON();
  expect(payload.type).toBe("student");
  expect(payload).not.toHaveProperty("companyName");
  expect(payload).not.toHaveProperty("areaId");
  await expect(page).toHaveURL(/\/account$/);
  expect(
    (await (await page.request.get("/api/auth/me")).json()).user.role,
  ).toBe("student");
});
