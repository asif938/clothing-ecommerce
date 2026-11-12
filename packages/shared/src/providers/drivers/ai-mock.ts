import { z } from "zod";
import { exampleFromContract } from "../../ai/features.ts";
import type { AiDriver, ProviderDriverDefinition } from "../types.ts";

/**
 * Mock AI driver (golden rule 2). Returns the `<example>` JSON from the
 * feature's output contract with "[mock]" text, so every AI flow — drafts,
 * budgets, usage logs, apply — works end to end with no API key. Token
 * counts are a rough chars/4 so budgets and the usage report move.
 */
export const mockAiConfigSchema = z.object({
  simulate: z.enum(["success", "failure"]).default("success"),
  defaultModel: z.string().default("mock-model"),
  inputCentsPerMTok: z.number().int().min(0).default(0),
  outputCentsPerMTok: z.number().int().min(0).default(0),
  delayMs: z.number().int().min(0).max(10_000).default(0),
});
export type MockAiConfig = z.infer<typeof mockAiConfigSchema>;

function fillExample(example: string): string {
  return example.replace(/"…"/g, '"[mock] Sample text written by the mock AI driver."').replace(/"<p>…<\/p>"/g, '"<p>[mock] Sample description written by the mock AI driver.</p>"');
}

export function createMockAiDriver(config: MockAiConfig): AiDriver {
  return {
    async generate(input) {
      if (config.delayMs > 0) await new Promise((r) => setTimeout(r, config.delayMs));
      if (config.simulate === "failure") throw new Error("Mock AI driver configured to simulate failure");
      const example = exampleFromContract(input.prompt) ?? exampleFromContract(input.system) ?? "{}";
      const text = fillExample(example);
      return { text, model: input.model, inputTokens: Math.ceil((input.system.length + input.prompt.length) / 4) + (input.images?.length ?? 0) * 1000, outputTokens: Math.ceil(text.length / 4) };
    },
  };
}

export const mockAiDriverDefinition: ProviderDriverDefinition<MockAiConfig> = {
  capability: "ai",
  driver: "mock",
  label: { bn: "মক (পরীক্ষার জন্য)", en: "Mock (for testing)" },
  configSchema: mockAiConfigSchema,
  secretFields: [],
  async testConnection(config) {
    return config.simulate === "failure" ? { ok: false, message: "Mock driver is configured to simulate failure." } : { ok: true, message: "Mock driver is configured to simulate success." };
  },
};
