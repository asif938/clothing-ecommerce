import { z } from "zod";
import type { EmailDriver, ProviderDriverDefinition } from "../types.ts";

/**
 * Simulates success/failure/delay so the full flow (golden rule 2 / §4.3
 * rule 4) can be demoed and tested with no credentials. Delivered messages
 * are only logged via `onSend` (wired to `provider_logs` by the caller) —
 * nothing actually goes out.
 */
export const mockEmailConfigSchema = z.object({
  simulate: z.enum(["success", "failure"]).default("success"),
  delayMs: z.number().int().min(0).max(10_000).default(0),
});
export type MockEmailConfig = z.infer<typeof mockEmailConfigSchema>;

export function createMockEmailDriver(config: MockEmailConfig, onSend?: (payload: unknown) => void): EmailDriver {
  return {
    async send(message) {
      if (config.delayMs > 0) await new Promise((r) => setTimeout(r, config.delayMs));
      onSend?.(message);
      if (config.simulate === "failure") {
        throw new Error("Mock email driver configured to simulate failure");
      }
    },
  };
}

export const mockEmailDriverDefinition: ProviderDriverDefinition<MockEmailConfig> = {
  capability: "email",
  driver: "mock",
  label: { bn: "মক (পরীক্ষার জন্য)", en: "Mock (for testing)" },
  configSchema: mockEmailConfigSchema,
  secretFields: [],
  async testConnection(config) {
    if (config.simulate === "failure") {
      return { ok: false, message: "Mock driver is configured to simulate failure." };
    }
    return { ok: true, message: "Mock driver is configured to simulate success." };
  },
};
