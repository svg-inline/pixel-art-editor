import { defineConfig, devices } from "@playwright/test";

// Dev servers run on 5173 / 8787.
// E2E uses 5174 / 8788 to avoid collision.
const BRIDGE_PORT = "8788";
const WEB_PORT = "5174";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 35_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
