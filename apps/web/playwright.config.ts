import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the real server serving the built web app, one
// fresh instance per browser (e2e/fixtures.ts). Chromium and WebKit, since the
// desktop app renders in WebKit on macOS and Linux.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "retain-on-failure",
    // Layers leave at once and nothing slides (tokens.md, Motion), so a test
    // never meets a menu or peek that is still on its way out.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
