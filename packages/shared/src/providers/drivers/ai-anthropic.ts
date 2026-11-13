import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AiChatMessage, AiDriver, ProviderDriverDefinition } from "../types.ts";

/**
 * Anthropic Claude (docs/PROJECT_SPEC.md §10.4) through the official
 * `@anthropic-ai/sdk`. Current Claude models reject sampling parameters
 * (`temperature`), so the feature config's temperature is not sent; depth
 * is controlled with `output_config.effort` instead. Server-side refusal
 * fallback is opted into for the models that support it, so a safety
 * decline on one model is retried on another inside the same call rather
 * than failing the draft. Not exercised against a live key in this
 * environment (no credentials), same caveat as every real driver.
 */
export const anthropicAiConfigSchema = z.object({
  apiKey: z.string().min(1),
  defaultModel: z.string().min(1).default("claude-opus-5-5"),
  baseUrl: z.string().url().optional(),
  /** Opus 5.5 list prices (US cents per million tokens) — edit when using another model. */
  inputCentsPerMTok: z.number().int().min(0).default(400),
  outputCentsPerMTok: z.number().int().min(0).default(2000),
  refusalFallback: z.boolean().default(true),
  timeoutMs: z.number().int().min(5_000).max(600_000).default(120_000),
});
export type AnthropicAiConfig = z.infer<typeof anthropicAiConfigSchema>;

/** Models that accept the server-side `fallbacks` parameter (Haiku has no server-side fallback). */
const FALLBACK_CAPABLE = /^claude-(opus-5|fable-5|mythos-5|sonnet-5-5)/;

function client(config: AnthropicAiConfig): Anthropic {
  return new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl, timeout: config.timeoutMs, maxRetries: 2 });
}

/**
 * Neutral transcript → Messages API turns. Tool results go back as a user
 * turn of `tool_result` blocks; consecutive user content is merged so the
 * turns always alternate. Thinking is not enabled for chat (latency), so
 * rebuilding assistant turns from text + tool calls loses nothing.
 */
export function toAnthropicMessages(messages: AiChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  const push = (role: "user" | "assistant", blocks: Anthropic.Beta.BetaContentBlockParam[]) => {
    const last = out[out.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };
  for (const message of messages) {
    if (message.role === "user") push("user", [{ type: "text", text: message.text }]);
    else if (message.role === "assistant") {
      const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (message.text) blocks.push({ type: "text", text: message.text });
      for (const call of message.toolCalls ?? []) blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
      if (blocks.length > 0) push("assistant", blocks);
    } else {
      push(
        "user",
        message.results.map((result) => ({ type: "tool_result" as const, tool_use_id: result.toolCallId, content: result.content, ...(result.isError ? { is_error: true } : {}) })),
      );
    }
  }
  return out;
}

export function createAnthropicAiDriver(config: AnthropicAiConfig): AiDriver {
  const anthropic = client(config);
  return {
    async generate(input) {
      const useFallback = config.refusalFallback && FALLBACK_CAPABLE.test(input.model);
      const response = await anthropic.beta.messages.create({
        model: input.model,
        max_tokens: input.maxTokens,
        system: input.system,
        messages: [
          {
            role: "user",
            content: [
              ...(input.images ?? []).map((image) => ({ type: "image" as const, source: { type: "base64" as const, media_type: image.mediaType, data: image.base64 } })),
              { type: "text" as const, text: input.prompt },
            ],
          },
        ],
        ...(input.effort ? { output_config: { effort: input.effort } } : {}),
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });

      if (response.stop_reason === "refusal") {
        const category = response.stop_details?.category ?? "unspecified";
        throw new Error(`The model declined this request (${category}).`);
      }
      const text = response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (!text) throw new Error(response.stop_reason === "max_tokens" ? "The reply was cut off — raise max tokens for this feature." : "The model returned no text.");
      return { text, model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    },

    async chat(input) {
      const useFallback = config.refusalFallback && FALLBACK_CAPABLE.test(input.model);
      const response = await anthropic.beta.messages.create({
        model: input.model,
        max_tokens: input.maxTokens,
        system: input.system,
        messages: toAnthropicMessages(input.messages),
        tools: input.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema as Anthropic.Beta.BetaTool["input_schema"] })),
        ...(input.effort ? { output_config: { effort: input.effort } } : {}),
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      if (response.stop_reason === "refusal") throw new Error(`The model declined this request (${response.stop_details?.category ?? "unspecified"}).`);
      const text = response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      const toolCalls = response.content
        .filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use")
        .map((block) => ({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> }));
      return {
        text,
        toolCalls,
        stopReason: toolCalls.length > 0 ? "tool_use" : response.stop_reason === "max_tokens" ? "max_tokens" : "end",
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    },
  };
}

export const anthropicAiDriverDefinition: ProviderDriverDefinition<AnthropicAiConfig> = {
  capability: "ai",
  driver: "anthropic",
  label: { bn: "Anthropic Claude", en: "Anthropic Claude" },
  configSchema: anthropicAiConfigSchema,
  secretFields: ["apiKey"],
  async testConnection(config) {
    try {
      const model = await client(config).models.retrieve(config.defaultModel);
      return { ok: true, message: `Connected — ${model.display_name} is available.`, details: { model: model.id } };
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) return { ok: false, message: "The API key was rejected." };
      if (error instanceof Anthropic.NotFoundError) return { ok: false, message: `Model "${config.defaultModel}" was not found for this key.` };
      if (error instanceof Anthropic.APIError) return { ok: false, message: `Anthropic API error ${error.status ?? ""}: ${error.message}` };
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
