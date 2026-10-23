// @ts-check
const base = require("./base");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");

module.exports = [
  ...base,
  {
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      // TypeScript's own types already validate component props far more
      // strictly than React.PropTypes can — this rule is redundant on a
      // TS codebase and (per eslint-plugin-react's own guidance for
      // TypeScript projects) meant to be turned off, not satisfied with
      // PropTypes declarations. First surfaced in Milestone 3's CMS block
      // editor, which destructures a typed, cast object inline in JSX.
      "react/prop-types": "off",
    },
    // Explicit version, not "detect": eslint-plugin-react 7.37.5's
    // auto-detection calls an ESLint rule-context API that ESLint 10
    // removed, crashing the linter. See docs/DECISIONS.md.
    settings: { react: { version: "19.3.1" } },
  },
];
