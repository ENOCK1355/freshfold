import { expect, test } from "@playwright/test";

test("configuration and session requests recover from temporary connection interruptions", async ({
  page,
}) => {
  const failures: Record<string, number> = { config: 0, "auth/me": 0 };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/\/api\/(config|auth\/me)$/, async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/", "");
    failures[path]++;
    if (failures[path] <= 2) await route.abort("connectionreset");
    else await route.continue();
  });
  await page.goto("/register?type=company");
  await expect(
    page.getByLabel("Business area").locator('option[value="amamoma"]'),
  ).toHaveCount(1);
  await expect.poll(() => failures["auth/me"]).toBeGreaterThanOrEqual(3);
  expect(failures.config).toBeGreaterThanOrEqual(3);
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("returning to the tab recovers failed startup configuration without reloading the page", async ({
  page,
}) => {
  let interrupted = true,
    requests = 0;
  await page.route("**/api/config", async (route) => {
    requests++;
    if (interrupted) await route.abort("internetdisconnected");
    else await route.continue();
  });
  await page.goto("/register?type=company");
  await expect(
    page.getByText(
      "Your connection was interrupted. Check your connection and try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(4);
  interrupted = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByLabel("Business area").locator('option[value="amamoma"]'),
  ).toHaveCount(1);
  await expect(page).toHaveURL(/\/register\?type=company$/);
  expect(requests).toBeGreaterThan(4);
});

test("reconnecting restores the signed-in session without redirecting the user to sign in", async ({
  page,
}) => {
  const login = await page.request.post("/api/demo/login", {
    data: { userId: "student-free" },
  });
  expect(login.ok()).toBe(true);
  let interrupted = true;
  await page.route("**/api/auth/me", async (route) => {
    if (interrupted) await route.abort("connectionreset");
    else await route.continue();
  });
  await page.goto("/account");
  await expect(
    page.getByText(
      "Your connection was interrupted. Check your connection and try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/account$/);
  interrupted = false;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.locator(".dashboard-content")).toBeVisible();
  await expect(page).toHaveURL(/\/account$/);
});

test("a lost sign-in response is reported without replaying the submission", async ({
  page,
}) => {
  let submissions = 0;
  await page.route("**/api/auth/login", async (route) => {
    submissions++;
    await route.abort("connectionreset");
  });
  await page.goto("/sign-in");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("connection.check@freshfold.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Connection.Check!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText(
      "Your connection was interrupted. Check whether your changes were saved before trying again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  expect(submissions).toBe(1);
});
