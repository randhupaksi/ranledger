import { defineConfig } from "@playwright/test";

const apiPort = process.env.PLAYWRIGHT_API_PORT ?? "8788";
const appPort = process.env.PLAYWRIGHT_APP_PORT ?? "4173";
const appOrigin = `http://127.0.0.1:${appPort}`;

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
      url: `http://127.0.0.1:${apiPort}/api/health`,
      env: {
        PORT: apiPort,
        PGLITE_DIR: "memory://",
        DATABASE_URL: "",
        APP_ORIGIN: appOrigin,
        NODE_ENV: "test",
      },
      reuseExistingServer: false,
      timeout: 45000,
    },
    {
      command:
        `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${appPort} --strictPort`,
      url: appOrigin,
      reuseExistingServer: false,
      timeout: 30000,
      env: { RANLEDGER_API_TARGET: `http://127.0.0.1:${apiPort}` },
    },
  ],
});
