import { z } from "zod";
import type { ProviderDriverDefinition, WhatsappDriver } from "../types.ts";

export const mockWhatsappConfigSchema = z.object({
  simulate: z.enum(["success", "failure"]).default("success"),
  delayMs: z.number().int().min(0).max(10_000).default(0),
});
export type MockWhatsappConfig = z.infer<typeof mockWhatsappConfigSchema>;

export function createMockWhatsappDriver(config: MockWhatsappConfig, onSend?: (to: string, text: string) => void): WhatsappDriver {
  return {
    async send(to, text) {
      if (config.delayMs > 0) await new Promise((r) => setTimeout(r, config.delayMs));
      onSend?.(to, text);
      if (config.simulate === "failure") {
        throw new Error("Mock WhatsApp driver configured to simulate failure");
      }
    },
  };
}

export const mockWhatsappDriverDefinition: ProviderDriverDefinition<MockWhatsappConfig> = {
  capability: "whatsapp",
  driver: "mock",
  label: { bn: "মক (পরীক্ষার জন্য)", en: "Mock (for testing)" },
  configSchema: mockWhatsappConfigSchema,
  secretFields: [],
  async testConnection(config) {
    if (config.simulate === "failure") {
      return { ok: false, message: "Mock driver is configured to simulate failure." };
    }
    return { ok: true, message: "Mock driver is configured to simulate success." };
  },
};
