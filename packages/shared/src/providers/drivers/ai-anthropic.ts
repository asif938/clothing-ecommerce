import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AiDriver, ProviderDriverDefinition } from "../types.ts";

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
