import nextPlugin from "@next/eslint-plugin-next";
import reactConfig from "@clothing/config/eslint/next";

// See apps/storefront/eslint.config.mjs and docs/DECISIONS.md for why this
// doesn't go through `next/core-web-vitals` + FlatCompat.
export default [
  ...reactConfig,
  nextPlugin.configs["core-web-vitals"],
  {
    ignores: [".next/**"],
  },
];
