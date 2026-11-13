export * from "./registry.ts";
// Registers every Milestone 1 setting as a module-load side effect — import
// this module (directly or via the barrel) before reading the registry.
import "./definitions.ts";
// Milestone 13 (§16 M13) — CRM, marketing automation and AI settings.
import "./definitions-m13.ts";
// Milestone 14 (§16 M14) — personalization and experimentation settings.
import "./definitions-m14.ts";
// Milestone 15 (§16 M15) - support settings.
import "./definitions-m15.ts";
export { AD_PLATFORMS, type AdPlatform, type AdSpendSourceMap } from "./definitions-m13.ts";
