import { z } from "zod";
import type { FraudCheckDriver, ProviderDriverDefinition } from "../types.ts";

/**
 * Stand-in for the "courier history" risk signal (docs/PROJECT_SPEC.md
 * §6.6) — no real BD courier-history HTTP service is integrated yet (none
 * of the ones mentioned in the spec have a confirmed public API at the
 * time this was written). `deliverySuccessRatio: null` (the default) means
 * "no data," which `RiskScoringService` treats as a neutral signal (no
 * score added) rather than guessing — see docs/DECISIONS.md.
 */
export const mockFraudCheckConfigSchema = z.object({
  deliverySuccessRatio: z.number().min(0).max(1).nullable().default(null),
  sampleSize: z.number().int().min(0).default(0),
});
export type MockFraudCheckConfig = z.infer<typeof mockFraudCheckConfigSchema>;

export function createMockFraudCheckDriver(config: MockFraudCheckConfig): FraudCheckDriver {
  return {
    async checkPhone() {
      return { deliverySuccessRatio: config.deliverySuccessRatio, sampleSize: config.sampleSize };
    },
  };
}

export const mockFraudCheckDriverDefinition: ProviderDriverDefinition<MockFraudCheckConfig> = {
  capability: "fraud_check",
  driver: "mock",
  label: { bn: "মক ফ্রড চেক (পরীক্ষার জন্য)", en: "Mock fraud check (for testing)" },
  configSchema: mockFraudCheckConfigSchema,
  secretFields: [],
  async testConnection() {
    return { ok: true, message: "Mock driver returns the configured sample data for every phone number." };
  },
};
