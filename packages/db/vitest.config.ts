import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Load repo-root .env so PrismaClient gets DATABASE_URL under vitest.
    setupFiles: ["./vitest.setup.ts"],
  },
});
