import { z } from "zod";
import type { ProviderDriverDefinition, TrackingDriver } from "../types.ts";

export const mockTrackingConfigSchema = z.object({
  simulate: z.enum(["success", "failure"]).default("success"),
  delayMs: z.number().int().min(0).max(10_000).default(0),
});
export type MockTrackingConfig = z.infer<typeof mockTrackingConfigSchema>;

export function createMockTrackingDriver(config: MockTrackingConfig, onSend?: (payload: unknown) => void): TrackingDriver {
  return {
    async send(event) {
      if (config.delayMs > 0) await new Promise((r) => setTimeout(r, config.delayMs));
      onSend?.(event);
      if (config.simulate === "failure") {
        throw new Error("Mock tracking driver configured to simulate failure");
      }
    },
  };
}

export const mockTrackingDriverDefinition: ProviderDriverDefinition<MockTrackingConfig> = {
  capability: "tracking",
  driver: "mock",
  label: { bn: "মক (পরীক্ষার জন্য)", en: "Mock (for testing)" },
  configSchema: mockTrackingConfigSchema,
  secretFields: [],
  async testConnection(config) {
    if (config.simulate === "failure") {
      return { ok: false, message: "Mock driver is configured to simulate failure." };
    }
    return { ok: true, message: "Mock driver is configured to simulate success." };
  },
};
