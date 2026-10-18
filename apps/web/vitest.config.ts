import { defineConfig } from "vitest/config";

// Vitest for pure client logic. The screens themselves are covered by the
// Playwright e2e suite against the real server.
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
  },
});
