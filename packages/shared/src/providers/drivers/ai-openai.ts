import { z } from "zod";
import type { AiDriver, ProviderDriverDefinition } from "../types.ts";

/**
 * OpenAI (docs/PROJECT_SPEC.md §10.4) — Chat Completions over plain
 * `fetch`, matching how every other non-Anthropic vendor driver in this
 * package is written (no vendor SDK dependency). Images go as base64 data
 * URLs. The model is required: the admin picks it, we don't guess. Not
 * verified against a live account here (no credentials).
 */
export const openAiConfigSchema = z.object({
  apiKey: z.string().min(1),
  defaultModel: z.string().min(1),
  baseUrl: z.string().url().default("https://api.openai.com"),
  organization: z.string().optional(),
  inputCentsPerMTok: z.number().int().min(0).default(0),
  outputCentsPerMTok: z.number().int().min(0).default(0),
  timeoutMs: z.number().int().min(5_000).max(600_000).default(120_000),
});
export type OpenAiConfig = z.infer<typeof openAiConfigSchema>;

function headers(config: OpenAiConfig): Record<string, string> {
  return { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", ...(config.organization ? { "OpenAI-Organization": config.organization } : {}) };
}

export function createOpenAiDriver(config: OpenAiConfig): AiDriver {
  return {
    async generate(input) {
      const content = [
        { type: "text", text: input.prompt },
        ...(input.images ?? []).map((image) => ({ type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.base64}` } })),
      ];
      const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: headers(config),
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify({
          model: input.model,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content },
          ],
          max_completion_tokens: input.maxTokens,
          ...(input.temperature !== null && input.temperature !== undefined ? { temperature: input.temperature } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        model?: string;
        choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? `OpenAI request failed (HTTP ${response.status})`);
      const choice = body.choices?.[0];
      if (choice?.message?.refusal) throw new Error(`The model declined this request: ${choice.message.refusal}`);
      const text = choice?.message?.content ?? "";
      if (!text) throw new Error(choice?.finish_reason === "length" ? "The reply was cut off — raise max tokens for this feature." : "The model returned no text.");
      return { text, model: body.model ?? input.model, inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 };
    },
  };
}

export const openAiDriverDefinition: ProviderDriverDefinition<OpenAiConfig> = {
  capability: "ai",
  driver: "openai",
  label: { bn: "OpenAI", en: "OpenAI" },
  configSchema: openAiConfigSchema,
  secretFields: ["apiKey"],
  async testConnection(config) {
    try {
      const response = await fetch(`${config.baseUrl}/v1/models/${encodeURIComponent(config.defaultModel)}`, { headers: headers(config), signal: AbortSignal.timeout(15_000) });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
      if (!response.ok) return { ok: false, message: body.error?.message ?? `HTTP ${response.status}` };
      return { ok: true, message: `Connected — ${body.id ?? config.defaultModel} is available.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
