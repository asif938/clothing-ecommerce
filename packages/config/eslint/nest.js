// @ts-check
const base = require("./base");

module.exports = [
  ...base,
  {
    rules: {
      // Nest uses parameter decorators and empty constructors for DI.
      "@typescript-eslint/no-useless-constructor": "off",
      "@typescript-eslint/no-extraneous-class": "off",
      // A type-only import would be erased from the emitted JS, taking the
      // `design:paramtypes` metadata Nest's DI relies on with it.
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
