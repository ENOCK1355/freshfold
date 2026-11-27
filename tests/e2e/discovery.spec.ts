import { expect, test, type Page } from "@playwright/test";

async function resultsReady(page: Page) {
  await expect(page.locator(".results")).toHaveAttribute("aria-busy", "false");
}

test("service-area cards and the location dropdown show only businesses based in that area", async ({
  page,
}) => {
  const areas = [
    ["amamoma", "Amamoma", "Campus Linen"],
    ["kwaprow", "Kwaprow", "Coastline"],
    ["ucc-science", "UCC Science", "Hallside"],
    ["ayensu", "Ayensu", "Cape Fresh"],
    ["apewosika", "Apewosika", ""],
    ["diaspora", "Diaspora halls", ""],
  ];
  for (const [id, label, name] of areas) {
    await page.goto("/coverage");
    const link = page.locator(`.area-card[href="/find-laundry?area=${id}"]`);
    await expect(link.locator(".area-availability")).toHaveText(
      name ? "1 laundry to explore" : "No laundries currently listed",
    );
    await link.click();
    await expect(page).toHaveURL(new RegExp(`find-laundry\\?area=${id}$`));
    await expect(
      page.getByRole("combobox", { name: "Laundry location", exact: true }),
    ).toHaveValue(id);
    await resultsReady(page);
    await expect(page.locator(".results .company-card")).toHaveCount(
      name ? 1 : 0,
    );
    if (name) {
      await expect(page.locator(".results .company-card h3")).toContainText(
        name,
      );
      await expect(page.locator(".results .company-location")).toContainText(
        label,
      );
    } else
      await expect(
        page.getByRole("heading", { name: "A little too specific?" }),
      ).toBeVisible();
  }
});

test("service prices, combined filters, sorting, and reset stay consistent", async ({
  page,
}) => {
  await page.goto("/find-laundry");
  await page.getByRole("radio", { name: "Wash & fold", exact: true }).check();
  await page
    .getByRole("combobox", { name: "Maximum starting price", exact: true })
    .selectOption("1000");
  await expect(page).toHaveURL(/maxPrice=1000/);
  await resultsReady(page);
  await expect(page.locator(".results .company-card")).toHaveCount(1);
  await expect(page.locator(".results .company-card h3")).toContainText(
    "Campus Linen",
  );
  await expect(page.locator(".results .starting-price")).toContainText("10.00");
  await expect(page.locator(".results .starting-price")).toContainText("kg");
  await page
    .getByRole("combobox", { name: "Laundry location", exact: true })
    .selectOption("kwaprow");
  await expect(page).toHaveURL(/area=kwaprow/);
  await resultsReady(page);
  await expect(page.locator(".results .company-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page).toHaveURL(/\/find-laundry$/);
  await resultsReady(page);
  await expect(page.locator(".results .company-card")).toHaveCount(4);
  await page.getByRole("radio", { name: "Press & iron", exact: true }).check();
  await page
    .getByRole("combobox", { name: "Maximum starting price", exact: true })
    .selectOption("1000");
  await page
    .getByRole("combobox", { name: "Maximum turnaround", exact: true })
    .selectOption("24");
  await page
    .locator(".filter-sidebar")
    .getByRole("checkbox", { name: "Collection available", exact: true })
    .check();
  await expect(page).toHaveURL(/pickup=true/);
  const parameters = new URL(page.url()).searchParams;
  expect(Object.fromEntries(parameters)).toMatchObject({
    service: "ironing",
    maxPrice: "1000",
    turnaround: "24",
    pickup: "true",
  });
  await resultsReady(page);
  await expect(page.locator(".results .company-card")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Search laundry companies", exact: true })
    .fill("does not exist");
  await expect(page).toHaveURL(/q=does/);
  await resultsReady(page);
  await expect(page.locator(".results .company-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page).toHaveURL(/\/find-laundry$/);
  await page
    .getByRole("combobox", { name: "Sort laundries", exact: true })
    .selectOption("fastest");
  await expect(page).toHaveURL(/sort=fastest/);
  await resultsReady(page);
  const fast = await (
    await page.request.get("/api/companies?sort=fastest")
  ).json();
  await expect(page.locator(".results .company-card h3")).toHaveText(
    fast.companies.map((c: any) => c.name),
  );
});
