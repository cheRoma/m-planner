import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // @m/shared is a workspace package; map it to its source barrel so vitest's
    // vite resolver loads it without relying on node_modules symlink + main-field
    // resolution (which vite does not follow the same way Node's resolver does).
    alias: {
      "@m/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
    },
  },
  test: { globals: true },
});
