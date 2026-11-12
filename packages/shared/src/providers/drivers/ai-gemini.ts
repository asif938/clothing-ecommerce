import { z } from "zod";
import type { AiDriver, ProviderDriverDefinition } from "../types.ts";

/**
 * Google Gemini (docs/PROJECT_SPEC.md §10.4) — `models/{model}:generateContent`
 * over plain `fetch` with the key in the `x-goog-api-key` header (never in
 * the URL, so it can't leak into logs). Images go as `inlineData`. The
 * model is required. Not verified against a live key here.
 */
export const geminiConfigSchema = z.object({
  apiKey: z.string().min(1),
  defaultModel: z.string().min(1),
  baseUrl: z.string().url().default("https://generativelanguage.googleapis.com"),
  apiVersion: z.string().default("v1beta"),
  inputCentsPerMTok: z.number().int().min(0).default(0),
  outputCentsPerMTok: z.number().int().min(0).default(0),
  timeoutMs: z.number().int().min(5_000).max(600_000).default(120_000),
});
export type GeminiConfig = z.infer<typeof geminiConfigSchema>;

function modelPath(model: string): string {
  return model.startsWith("models/") ? model : `models/${model}`;
}

export function createGeminiDriver(config: GeminiConfig): AiDriver {
  return {
    async generate(input) {
      const response = await fetch(`${config.baseUrl}/${config.apiVersion}/${modelPath(input.model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [
            {
              role: "user",
              parts: [{ text: input.prompt }, ...(input.images ?? []).map((image) => ({ inlineData: { mimeType: image.mediaType, data: image.base64 } }))],
            },
          ],
          generationConfig: {
            maxOutputTokens: input.maxTokens,
            ...(input.temperature !== null && input.temperature !== undefined ? { temperature: input.temperature } : {}),
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        modelVersion?: string;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? `Gemini request failed (HTTP ${response.status})`);
      if (body.promptFeedback?.blockReason) throw new Error(`The model declined this request (${body.promptFeedback.blockReason}).`);
      const candidate = body.candidates?.[0];
      const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      if (!text) throw new Error(candidate?.finishReason === "MAX_TOKENS" ? "The reply was cut off — raise max tokens for this feature." : `The model returned no text (${candidate?.finishReason ?? "unknown"}).`);
      return { text, model: body.modelVersion ?? input.model, inputTokens: body.usageMetadata?.promptTokenCount ?? 0, outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0 };
    },
  };
}

export const geminiDriverDefinition: ProviderDriverDefinition<GeminiConfig> = {
  capability: "ai",
  driver: "gemini",
  label: { bn: "Google Gemini", en: "Google Gemini" },
  configSchema: geminiConfigSchema,
  secretFields: ["apiKey"],
  async testConnection(config) {
    try {
      const response = await fetch(`${config.baseUrl}/${config.apiVersion}/${modelPath(config.defaultModel)}`, { headers: { "x-goog-api-key": config.apiKey }, signal: AbortSignal.timeout(15_000) });
      const body = (await response.json().catch(() => ({}))) as { displayName?: string; error?: { message?: string } };
      if (!response.ok) return { ok: false, message: body.error?.message ?? `HTTP ${response.status}` };
      return { ok: true, message: `Connected — ${body.displayName ?? config.defaultModel} is available.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
