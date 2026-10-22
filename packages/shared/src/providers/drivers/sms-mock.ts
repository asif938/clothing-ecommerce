import { z } from "zod";
import type { ProviderDriverDefinition, SmsDriver } from "../types.ts";

export const mockSmsConfigSchema = z.object({
  simulate: z.enum(["success", "failure"]).default("success"),
  delayMs: z.number().int().min(0).max(10_000).default(0),
});
export type MockSmsConfig = z.infer<typeof mockSmsConfigSchema>;

export function createMockSmsDriver(config: MockSmsConfig, onSend?: (to: string, text: string) => void): SmsDriver {
  return {
    async send(to, text) {
      if (config.delayMs > 0) await new Promise((r) => setTimeout(r, config.delayMs));
      onSend?.(to, text);
      if (config.simulate === "failure") {
        throw new Error("Mock SMS driver configured to simulate failure");
      }
    },
    async balance() {
      return 1_000;
    },
  };
}

export const mockSmsDriverDefinition: ProviderDriverDefinition<MockSmsConfig> = {
  capability: "sms",
  driver: "mock",
  label: { bn: "মক (পরীক্ষার জন্য)", en: "Mock (for testing)" },
  configSchema: mockSmsConfigSchema,
  secretFields: [],
  async testConnection(config) {
    if (config.simulate === "failure") {
      return { ok: false, message: "Mock driver is configured to simulate failure." };
    }
    return { ok: true, message: "Mock driver is configured to simulate success." };
  },
};
