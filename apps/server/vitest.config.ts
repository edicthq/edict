import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./src/test/global.setup.ts"],
    include: ["src/**/*.spec.ts"],
    fileParallelism: true,
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
