import { z } from "zod";
import { exampleFromContract } from "../../ai/features.ts";
import type { AiChatInput, AiChatResult, AiDriver, ProviderDriverDefinition } from "../types.ts";

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

/** Order numbers look like `ABC2611130001` (spec §17 default format). */
const ORDER_NUMBER = /\b[A-Z]{2,5}\d{6,}\b/;
const HANDOFF_WORDS = /\b(human|agent|person|refund|complain|complaint)\b|মানুষ|এজেন্ট|রিফান্ড|অভিযোগ/i;
const PRODUCT_WORDS = /\b(price|stock|available|have|size)\b|দাম|আছে|সাইজ/i;

/**
 * Deterministic tool-using chat for demos and tests: an order number →
 * `order_status`, a request for a person → `handoff_to_human`, a product
 * question → `search_products`; after tool results it replies with the
 * first result. Lets the whole assistant loop (tools, budgets, handoff)
 * run with no API key.
 */
export function mockChat(input: AiChatInput): Omit<AiChatResult, "model"> {
  const last = input.messages[input.messages.length - 1];
  const has = (name: string) => input.tools.some((t) => t.name === name);
  const usage = { inputTokens: Math.ceil(JSON.stringify(input.messages).length / 4) + Math.ceil(input.system.length / 4), outputTokens: 30 };
  if (last?.role === "tool") {
    const first = last.results[0];
    return { text: `[mock] ${first ? first.content.slice(0, 400) : "Done."}`, toolCalls: [], stopReason: "end", ...usage };
  }
  const text = last?.role === "user" ? last.text : "";
  const call = (name: string, toolInput: Record<string, unknown>): Omit<AiChatResult, "model"> => ({
    text: "",
    toolCalls: [{ id: `mock_${name}_${input.messages.length}`, name, input: toolInput }],
    stopReason: "tool_use",
    ...usage,
  });
  if (has("handoff_to_human") && HANDOFF_WORDS.test(text)) return call("handoff_to_human", { reason: "Customer asked for a person" });
  const order = ORDER_NUMBER.exec(text);
  if (order && has("order_status")) return call("order_status", { order_number: order[0] });
  if (has("search_products") && PRODUCT_WORDS.test(text)) return call("search_products", { query: text.slice(0, 80) });
  return { text: "[mock] Thanks for your message. How can I help you with our products or your order?", toolCalls: [], stopReason: "end", ...usage };
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
    async chat(input) {
      if (config.delayMs > 0) await new Promise((r) => setTimeout(r, config.delayMs));
      if (config.simulate === "failure") throw new Error("Mock AI driver configured to simulate failure");
      return { ...mockChat(input), model: input.model };
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
