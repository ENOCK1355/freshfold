import { expect, test } from "@playwright/test";

test("account-type switching changes the matching photos and form while preserving entered details", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/register");
  await page.getByLabel("Your full name").fill("Ama Student");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("ama.switch@freshfold.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Preserve.My.Details!2026");
  // Measure the fade after assets are ready; delayed image loading has its own test.
  await Promise.all([
    page.evaluate(() => document.fonts.ready),
    page
      .locator(".auth-visual > img")
      .evaluateAll((images) =>
        Promise.all(
          images.map((image) => (image as HTMLImageElement).decode()),
        ),
      ),
  ]);
  const framesPromise = page.evaluate(async () => {
    const frames: {
      opacity: number[];
      transforms: string[];
      card: number[];
    }[] = [];
    const until = performance.now() + 1300;
    while (performance.now() < until) {
      const images = Array.from(
        document.querySelectorAll(".auth-visual > img"),
      );
      const card = document
        .querySelector(".auth-visual")!
        .getBoundingClientRect();
      frames.push({
        opacity: images.map((image) => Number(getComputedStyle(image).opacity)),
        transforms: images.map((image) => getComputedStyle(image).transform),
        card: [card.x, card.y, card.width, card.height],
      });
      await new Promise(requestAnimationFrame);
    }
    return frames;
  });
  await page
    .getByRole("button", { name: "I run a laundry", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Your laundry\.\s*A wider reach\./,
  );
  await expect(page.getByLabel("Laundry business name")).toBeVisible();
  const frames = await framesPromise;
  expect(frames.some((f) => f.opacity.some((o) => o > 0 && o < 0.98))).toBe(
    true,
  );
  expect(frames.every((f) => Math.max(...f.opacity) >= 0.99)).toBe(true);
  expect(
    frames.every((f) =>
      f.transforms.every(
        (t) => t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)",
      ),
    ),
  ).toBe(true);
  for (const frame of frames)
    frame.card.forEach((v, i) =>
      expect(Math.abs(v - frames[0].card[i])).toBeLessThan(1),
    );
  await expect(
    page.locator('.auth-visual > img[data-active="true"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.auth-visual > img[data-active="true"]'),
  ).toHaveAttribute("src", "/images/auth-laundry-professional.webp");
  await expect(page.getByLabel("Your full name")).toHaveValue("Ama Student");
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "ama.switch@freshfold.test",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    "Preserve.My.Details!2026",
  );
  await page.getByRole("button", { name: /student$/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Make room\s*for your day\./,
  );
  await expect(page.getByLabel("Laundry business name")).toHaveCount(0);
  await expect(
    page.locator('.auth-visual > img[data-active="true"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.auth-visual > img[data-active="true"]'),
  ).toHaveAttribute("src", "/images/signup-laundry.webp");
  await expect(page.getByLabel("Your full name")).toHaveValue("Ama Student");
});

test("rapid selection changes settle on the last selected account type", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/register");
  await expect(page.getByRole("button", { name: /student$/ })).toBeVisible();
  await page.evaluate(() => {
    const buttons = document.querySelectorAll<HTMLButtonElement>(
      ".segmented-control button",
    );
    buttons[1].click();
    buttons[0].click();
  });
  await expect(page.getByRole("button", { name: /student$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Make room\s*for your day\./,
  );
  await expect(page.locator(".auth-content")).toHaveCSS("opacity", "1");
  await expect(page.getByLabel("Laundry business name")).toHaveCount(0);
});

test("a slow photo keeps the previous image visible until the crossfade can start", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let releaseImage!: () => void;
  const ready = new Promise<void>((resolve) => {
    releaseImage = resolve;
  });
  await page.route(
    "**/images/auth-laundry-professional*.webp",
    async (route) => {
      await ready;
      await route.continue();
    },
  );
  try {
    await page.goto("/register", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "I run a laundry", exact: true }),
    ).toBeVisible();
    const base = page.locator('.auth-visual > img[data-photo="student"]');
    const next = page.locator('.auth-visual > img[data-photo="company"]');
    await base.evaluate((image) => (image as HTMLImageElement).decode());
    await page
      .getByRole("button", { name: "I run a laundry", exact: true })
      .click();
    await expect(page.getByLabel("Laundry business name")).toBeVisible();
    await expect(page.locator(".auth-visual")).toHaveAttribute(
      "data-photo",
      "student",
    );
    await expect(base).toHaveCSS("opacity", "1");
    await expect(next).toHaveCSS("opacity", "0");
    releaseImage();
    await expect(page.locator(".auth-visual")).toHaveAttribute(
      "data-photo",
      "company",
    );
    await expect(next).toHaveCSS("opacity", "1");
    await expect(base).toHaveCSS("opacity", "1");
  } finally {
    releaseImage();
  }
});

test("both signup options fit narrow screens and respect reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/register");
    for (const name of ["I run a laundry", /student$/]) {
      await page.getByRole("button", { name }).click();
      await expect(page.locator(".auth-content")).toHaveCSS("opacity", "1");
      await expect(
        page.locator('.auth-visual > img[data-active="true"]'),
      ).toHaveCount(1);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
    }
  }
});
