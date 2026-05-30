import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globals: true, root: "./", setupFiles: ["reflect-metadata", "./vitest.setup.ts"] },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
