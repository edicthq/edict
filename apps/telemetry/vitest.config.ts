import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./src/test/global.setup.ts"],
    include: ["src/**/*.spec.ts"],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
