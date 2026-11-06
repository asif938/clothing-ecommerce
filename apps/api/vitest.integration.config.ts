import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * §14 API integration tests — separate from `vitest.config.ts` (unit
 * tests, mocked Prisma) because these boot the real `AppModule` against a
 * real Postgres (`test/setup.ts`) and take materially longer per test.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.integration-spec.ts"],
    globals: false,
    root: "./",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Integration specs share one real database — truncating it between
    // files while another file's tests are still running would be racy.
    fileParallelism: false,
  },
  plugins: [swc.vite()],
});
