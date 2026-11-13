import { z } from "zod";
import type { ProviderDriverDefinition, WhatsappDriver } from "../types.ts";
import { parseMockChatWebhook } from "./meta-messaging.ts";

export const mockWhatsappConfigSchema = z.object({
  simulate: z.enum(["success", "failure"]).default("success"),
  delayMs: z.number().int().min(0).max(10_000).default(0),
});
export type MockWhatsappConfig = z.infer<typeof mockWhatsappConfigSchema>;

export function createMockWhatsappDriver(config: MockWhatsappConfig, onSend?: (to: string, text: string) => void): WhatsappDriver {
  async function send(to: string, text: string): Promise<void> {
    if (config.delayMs > 0) await new Promise((r) => setTimeout(r, config.delayMs));
    onSend?.(to, text);
    if (config.simulate === "failure") {
      throw new Error("Mock WhatsApp driver configured to simulate failure");
    }
  }
  return {
    send,
    async sendSession(to, text) {
      await send(to, text);
      return { externalMessageId: `mock_wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    },
    // §16 M15 — `{ contactId, text, name?, phone? }` posted to the inbox webhook lands as an inbound WhatsApp message.
    parseWebhook: parseMockChatWebhook,
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
