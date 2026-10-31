import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/globalSetup.ts"],
    // all test files share one PostgreSQL test database, so run them one at a time
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
