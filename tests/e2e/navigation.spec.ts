import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

async function trackTransitions(page: Page) {
  await page.addInitScript(() => {
    const tracked = window as any;
    tracked.navigationTransitions = [];
    if (!document.startViewTransition) return;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((options: any) => {
      const record: any = { started: performance.now() };
      tracked.navigationTransitions.push(record);
      const transition = start(options);
      transition.ready
        .then(() => {
          record.ready = performance.now();
          record.transforms = document
            .getAnimations()
            .filter((animation: any) =>
              animation.animationName?.includes("group-anim"),
            )
            .map((animation) =>
              animation.effect
                ?.getKeyframes()
                .map((frame) => frame.transform)
                .filter(Boolean),
            );
        })
        .catch((error) => {
          record.error = error.message;
        });
      transition.finished
        .then(() => {
          record.finished = performance.now();
        })
        .catch(() => {});
      return transition;
    }) as typeof document.startViewTransition;
  });
}
async function settled(page: Page) {
  await page.waitForFunction(() =>
    (window as any).navigationTransitions.every(
      (record: any) => record.finished || record.error,
    ),
  );
}

test("navigation keeps the current page visible while destination data loads, then crossfades", async ({
  page,
}) => {
  await trackTransitions(page);
  await page.goto("/about");
  await expect(page.locator("h1")).toContainText("A lighter load.");
  await settled(page);
  const before = await page.evaluate(
    () => (window as any).navigationTransitions.length,
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/companies**", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    const request = page.waitForRequest((request) =>
      request.url().includes("/api/companies"),
    );
    await page
      .locator(".public-nav")
      .getByRole("link", { name: "Find laundry", exact: true })
      .click();
    await request;
    await expect(page.locator("h1")).toContainText("A lighter load.");
    await expect(page.locator(".loading-state")).toHaveCount(0);
    release();
    await expect(page.locator("h1")).toContainText("Find your kind");
    await settled(page);
    const transitions = await page.evaluate(
      (count) => (window as any).navigationTransitions.slice(count),
      before,
    );
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions.every((record: any) => !record.error)).toBe(true);
    expect(
      transitions.some((record: any) => record.finished - record.ready >= 180),
    ).toBe(true);
  } finally {
    release();
  }
});

test("footer navigation fades between fixed snapshots and restores history without a collapsed page", async ({
  page,
}) => {
  await trackTransitions(page);
  await page.goto("/how-it-works");
  await expect(page.locator("h1")).toBeVisible();
  await settled(page);
  await page.locator(".site-footer").scrollIntoViewIfNeeded();
  const saved = await page.evaluate(() => scrollY);
  const before = await page.evaluate(
    () => (window as any).navigationTransitions.length,
  );
  await page.evaluate(() => {
    (window as any).navigationFrames = [];
    document.addEventListener(
      "click",
      () => {
        const until = performance.now() + 1200;
        const record = () => {
          (window as any).navigationFrames.push({
            height: document.documentElement.scrollHeight,
            heading: document.querySelector("h1")?.textContent,
          });
          if (performance.now() < until) requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
      },
      { capture: true, once: true },
    );
  });
  await page
    .locator(".site-footer")
    .getByRole("link", { name: "About Fresh Fold", exact: true })
    .click();
  await expect(page.locator("h1")).toContainText("A lighter load.");
  await settled(page);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
  const captured = await page.evaluate(
    (count) => ({
      transitions: (window as any).navigationTransitions.slice(count),
      frames: (window as any).navigationFrames,
    }),
    before,
  );
  const viewportHeight = page.viewportSize()!.height;
  expect(captured.frames.length).toBeGreaterThan(0);
  expect(
    captured.frames.every(
      (frame: any) => frame.heading && frame.height > viewportHeight,
    ),
  ).toBe(true);
  for (const transition of captured.transitions)
    for (const transforms of transition.transforms || [])
      expect(new Set(transforms).size).toBeLessThanOrEqual(1);
  await page.goBack();
  await expect(page.locator("h1")).toContainText("From laundry basket");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(saved, 0);
});

test("small screens keep navigation, comparison actions, and workspace controls in place", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/compare");
  await expect(page.locator("h1")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Choose laundries", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 568, height: 320 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  const last = page
    .locator(".public-nav")
    .getByRole("link", { name: "For businesses", exact: true });
  await last.scrollIntoViewIfNeeded();
  const bounds = await last.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(320);
  await page
    .getByRole("button", { name: "Close navigation", exact: true })
    .click();
  const me = await (await page.request.get("/api/auth/me")).json();
  const login = await page.request.post("/api/demo/login", {
    data: { userId: "student-history" },
    headers: me.user?.csrf ? { "X-CSRF-Token": me.user.csrf } : {},
  });
  expect(login.ok()).toBe(true);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/account");
  await expect(page.locator("h1")).toBeVisible();
  await page
    .getByRole("button", { name: "Open account navigation", exact: true })
    .click();
  await page
    .locator(".sidebar-bottom")
    .getByRole("link", { name: "Explore laundries", exact: true })
    .click();
  await expect(page).toHaveURL(/find-laundry/);
  await expect(page.locator("h1")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "My account", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.locator(".results .compare-check input").nth(0).check();
  await page.locator(".results .compare-check input").nth(1).check();
  const tray = await page.locator(".compare-tray").boundingBox();
  const chat = await page.locator(".whatsapp-float").boundingBox();
  expect(chat!.y + chat!.height).toBeLessThan(tray!.y);
});

test("navigation still fades in when native view transitions are unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: undefined,
    });
    (window as any).fallbackFades = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (
      ...args: Parameters<Element["animate"]>
    ) {
      if (this.matches(".page-content"))
        (window as any).fallbackFades.push(args[1]);
      return animate.apply(this, args);
    };
  });
  await page.goto("/about");
  await expect(page.locator("h1")).toBeVisible();
  await page
    .locator(".public-nav")
    .getByRole("link", { name: "How it works", exact: true })
    .click();
  await expect(page.locator("h1")).toContainText("From laundry basket");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
  await expect(page.locator(".page-transition")).toHaveCount(1);
  expect(
    await page.evaluate(() =>
      (window as any).fallbackFades.some(
        (options: any) => options.duration === 260,
      ),
    ),
  ).toBe(true);
});
