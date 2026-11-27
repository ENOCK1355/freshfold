import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 45000,
    hookTimeout: 120000,
    fileParallelism: false,
    maxWorkers: 1,
    reporters: ["default"],
    sequence: { concurrent: false },
  },
});
