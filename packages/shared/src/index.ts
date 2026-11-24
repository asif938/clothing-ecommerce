/**
 * @clothing/shared — cross-app zod schemas, types, the permission list and
 * settings registry (docs/PROJECT_SPEC.md §4.1, §11). This root barrel only
 * re-exports isomorphic (browser-safe) pieces with no load-order
 * requirements; Node-only subpaths (`./crypto`, `./providers`) and the
 * settings registry (`./settings`, whose definitions register as a
 * module-load side effect) are imported directly by their consumer instead.
 */
export const SHARED_PACKAGE_VERSION = "0.1.0";

export * from "./i18n/localized-text.ts";
export * from "./i18n/defaults.ts";
export * from "./permissions/index.ts";
export * from "./catalog/slug.ts";
export * from "./catalog/size-recommender.ts";
export * from "./dashboard/widgets.ts";
export * from "./catalog/bundle-pricing.ts";
export * from "./catalog/review-display.ts";
export * from "./phone/bd-phone.ts";
export type { ProviderCapability, ProviderTestResult } from "./providers/types.ts";
