import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    // All integration tests share one Postgres test database and reset it
    // with TRUNCATE between tests — running test files in parallel would
    // let them stomp on each other's data.
    fileParallelism: false,
  },
});
