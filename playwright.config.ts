import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: "list",
  outputDir: ".cache/test-results",
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node node_modules/tsx/dist/cli.mjs server/index.ts",
      url: "http://127.0.0.1:8788/api/health",
      env: {
        PORT: "8788",
        PGLITE_DIR: "memory://",
        DATABASE_URL: "",
        APP_ORIGIN: "http://127.0.0.1:4173",
        NODE_ENV: "test",
      },
      reuseExistingServer: false,
      timeout: 45000,
    },
    {
      command:
        "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      timeout: 30000,
      env: { RANLEDGER_API_TARGET: "http://127.0.0.1:8788" },
    },
  ],
});
