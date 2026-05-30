import { fileURLToPath } from "node:url";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// vitest/esbuild does NOT emit emitDecoratorMetadata, which NestJS DI needs to
// resolve type-based constructor injection (e.g. AuthController -> AuthService).
// unplugin-swc compiles with full decorator + metadata support so DI resolves.
export default defineConfig({
  resolve: {
    // @m/bot is a sibling app (not a published workspace dep here); map it to its
    // source barrel so vitest resolves it without a node_modules link. Mirrors the
    // tsconfig `paths` entry that lets tsc resolve it outside this project's rootDir.
    alias: {
      "@m/bot": fileURLToPath(new URL("../bot/src/index.ts", import.meta.url)),
    },
  },
  test: {
    globals: true,
    root: "./",
    // reflect-metadata: required by NestJS at runtime.
    // ./vitest.setup.ts: loads the repo-root .env (forward-compat for DB-backed tests).
    setupFiles: ["reflect-metadata", "./vitest.setup.ts"],
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
