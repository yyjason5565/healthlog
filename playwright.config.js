import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.js",
  timeout: 180000,
  expect: { timeout: 20000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173/healthlog/",
    browserName: "webkit",
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: devices["iPhone 13"].userAgent,
    serviceWorkers: "allow",
  },
  webServer: {
    command: "node tests/server.mjs",
    url: "http://127.0.0.1:4173/healthlog/",
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
});
