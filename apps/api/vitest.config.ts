import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// NestJS relies on emitDecoratorMetadata for constructor-based DI, which
// esbuild (vite's default transform) does not support — hence swc here.
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    globals: false,
    root: "./",
  },
  plugins: [swc.vite()],
});
