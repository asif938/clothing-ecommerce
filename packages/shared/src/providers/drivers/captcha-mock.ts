import { z } from "zod";
import type { CaptchaDriver, ProviderDriverDefinition } from "../types.ts";

export const mockCaptchaConfigSchema = z.object({
  simulate: z.enum(["success", "failure"]).default("success"),
});
export type MockCaptchaConfig = z.infer<typeof mockCaptchaConfigSchema>;

export function createMockCaptchaDriver(config: MockCaptchaConfig): CaptchaDriver {
  return {
    async verify() {
      return config.simulate === "success" ? { success: true } : { success: false, reason: "mock-configured-failure" };
    },
  };
}

export const mockCaptchaDriverDefinition: ProviderDriverDefinition<MockCaptchaConfig> = {
  capability: "captcha",
  driver: "mock",
  label: { bn: "মক ক্যাপচা (পরীক্ষার জন্য)", en: "Mock captcha (for testing)" },
  configSchema: mockCaptchaConfigSchema,
  secretFields: [],
  async testConnection(config) {
    return config.simulate === "success" ? { ok: true, message: "Mock driver is configured to simulate success." } : { ok: false, message: "Mock driver is configured to simulate failure." };
  },
};
