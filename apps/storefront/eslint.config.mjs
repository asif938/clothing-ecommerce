import nextPlugin from "@next/eslint-plugin-next";
import reactConfig from "@clothing/config/eslint/next";

// `next/core-web-vitals` itself (via FlatCompat) crashes under ESLint 10 —
// a circular-reference JSON.stringify deep in eslint-plugin-react's flat
// config, triggered by @eslint/eslintrc's legacy validator. Using
// @next/eslint-plugin-next's own flat `core-web-vitals` config directly
// (it doesn't go through that validator) avoids it entirely. See
// docs/DECISIONS.md.
export default [
  ...reactConfig,
  nextPlugin.configs["core-web-vitals"],
  {
    ignores: [".next/**"],
  },
];
