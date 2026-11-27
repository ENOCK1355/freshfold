import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5173",
    headless: true,
    channel: process.platform === "win32" ? "msedge" : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:4000/api/ready",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
