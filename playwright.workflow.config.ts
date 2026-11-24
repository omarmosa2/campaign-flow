import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/workflow",
  testMatch: "simple.spec.ts",
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        extraHTTPHeaders: { "x-forwarded-for": "192.0.2.10" },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        extraHTTPHeaders: { "x-forwarded-for": "192.0.2.11" },
      },
    },
  ],
  timeout: 240000,
  workers: 1,
  expect: { timeout: 30000 },
  outputDir: "test-results-workflow",
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    actionTimeout: 30000,
    ...devices["Pixel 7"],
  },
  webServer: {
    command: "node tests/helpers/mock-supabase.mjs",
    url: "http://127.0.0.1:3001/admin/login",
    reuseExistingServer: false,
    timeout: 180000,
  },
});
