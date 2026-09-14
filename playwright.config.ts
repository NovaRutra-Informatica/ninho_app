import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "test-results/e2e-report" }],
  ],
  outputDir: "test-results/e2e-artifacts",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
});
