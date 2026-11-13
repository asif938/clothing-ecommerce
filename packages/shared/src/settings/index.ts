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
// Milestone 16 (§16 M16) - store credit, gift cards, referrals, affiliates.
import "./definitions-m16.ts";
export { AD_PLATFORMS, type AdPlatform, type AdSpendSourceMap } from "./definitions-m13.ts";
// Milestone 17 (§16 M17) - forecasting, materials, expenses, report builder, public API, webhooks.
import "./definitions-m17.ts";
