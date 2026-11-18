import { defineConfig } from "@playwright/test";
import workflow from "./playwright.workflow.config";
export default defineConfig({
  ...workflow,
  testDir: "./tests/e2e",
  testMatch: "public.spec.ts",
  timeout: 120000,
});
