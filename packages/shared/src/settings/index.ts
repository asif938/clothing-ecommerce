export * from "./registry.ts";
// Registers every Milestone 1 setting as a module-load side effect — import
// this module (directly or via the barrel) before reading the registry.
import "./definitions.ts";
// Milestone 13 (§16 M13) — CRM, marketing automation and AI settings.
import "./definitions-m13.ts";
export { AD_PLATFORMS, type AdPlatform, type AdSpendSourceMap } from "./definitions-m13.ts";
