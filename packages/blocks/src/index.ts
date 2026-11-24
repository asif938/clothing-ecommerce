/**
 * @clothing/blocks — CMS block library (docs/PROJECT_SPEC.md §9.1). Each block
 * type gets its own schema.ts, defaults.ts and Component.tsx under
 * src/blocks/<type>/, registered in library.ts.
 */
export const BLOCKS_PACKAGE_VERSION = "0.1.0";

export * from "./registry.ts";
export * from "./library.ts";
export * from "./product-tile.tsx";
export * from "./product-actions.tsx";
export * from "./section-heading.tsx";
