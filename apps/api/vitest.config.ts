import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// vitest/esbuild does NOT emit emitDecoratorMetadata, which NestJS DI needs to
// resolve type-based constructor injection (e.g. AuthController -> AuthService).
// unplugin-swc compiles with full decorator + metadata support so DI resolves.
export default defineConfig({
  test: {
    globals: true,
    root: "./",
    // reflect-metadata: required by NestJS at runtime.
    // ./vitest.setup.ts: loads the repo-root .env (forward-compat for DB-backed tests).
    setupFiles: ["reflect-metadata", "./vitest.setup.ts"],
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
