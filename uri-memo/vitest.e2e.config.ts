import { defineConfig } from "vitest/config";

/** End-to-end tests against the real app (see e2e/driver.ts). Run with `npm run e2e`. */
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // tests build on each other's notes (one app, one data folder)
    sequence: { concurrent: false },
  },
});
