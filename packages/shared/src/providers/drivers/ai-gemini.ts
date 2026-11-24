import { z } from "zod";
import type { AiChatMessage, AiDriver, ProviderDriverDefinition } from "../types.ts";

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

/** Schema keywords Gemini's `functionDeclarations[].parameters` accepts (its OpenAPI 3.0 subset). */
const GEMINI_SCHEMA_KEYS = new Set(["type", "format", "title", "description", "nullable", "enum", "required", "minItems", "maxItems", "minLength", "maxLength", "pattern", "minimum", "maximum", "propertyOrdering"]);

/**
 * Tool input schema (JSON Schema, shared with the other AI drivers) → the
 * subset Gemini accepts. Gemini rejects the whole request on an unknown
 * keyword (e.g. `additionalProperties: false`, which the chat assistant's
 * tools use for the stricter providers), so anything outside the subset is
 * dropped; `properties`, `items` and `anyOf` are converted recursively.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, toGeminiSchema(child)]));
    } else if (key === "items" || key === "anyOf") {
      out[key] = toGeminiSchema(value);
    } else if (GEMINI_SCHEMA_KEYS.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Neutral transcript → Gemini `contents`. Gemini function calls carry no
 * id, so ours are minted as `gemini_<n>_<name>` and the function name for
 * each `functionResponse` comes from the result itself.
 */
export function toGeminiContents(messages: AiChatMessage[]): Record<string, unknown>[] {
  const out: { role: string; parts: Record<string, unknown>[] }[] = [];
  const push = (role: "user" | "model", parts: Record<string, unknown>[]) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else out.push({ role, parts });
  };
  for (const message of messages) {
    if (message.role === "user") push("user", [{ text: message.text }]);
    else if (message.role === "assistant") {
      const parts: Record<string, unknown>[] = [];
      if (message.text) parts.push({ text: message.text });
      // Gemini 3 rejects a follow-up turn unless each function call carries back the `thoughtSignature` it came with.
      for (const call of message.toolCalls ?? []) parts.push({ functionCall: { name: call.name, args: call.input }, ...(call.signature ? { thoughtSignature: call.signature } : {}) });
      if (parts.length > 0) push("model", parts);
    } else {
      push(
        "user",
        message.results.map((r) => ({ functionResponse: { name: r.name, response: { content: r.content, ...(r.isError ? { error: true } : {}) } } })),
      );
    }
  }
  return out;
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

    async chat(input) {
      const response = await fetch(`${config.baseUrl}/${config.apiVersion}/${modelPath(input.model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: toGeminiContents(input.messages),
          tools: [{ functionDeclarations: input.tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.inputSchema) })) }],
          generationConfig: {
            maxOutputTokens: input.maxTokens,
            ...(input.temperature !== null && input.temperature !== undefined ? { temperature: input.temperature } : {}),
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        candidates?: { content?: { parts?: { text?: string; functionCall?: { name?: string; args?: Record<string, unknown> }; thoughtSignature?: string }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        modelVersion?: string;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? `Gemini request failed (HTTP ${response.status})`);
      if (body.promptFeedback?.blockReason) throw new Error(`The model declined this request (${body.promptFeedback.blockReason}).`);
      const candidate = body.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const toolCalls = parts
        .filter((p) => p.functionCall?.name)
        .map((p, i) => ({ id: `gemini_${i}_${p.functionCall!.name!}`, name: p.functionCall!.name!, input: p.functionCall!.args ?? {}, ...(p.thoughtSignature ? { signature: p.thoughtSignature } : {}) }));
      return {
        text: parts.map((p) => p.text ?? "").join(""),
        toolCalls,
        stopReason: toolCalls.length > 0 ? "tool_use" : candidate?.finishReason === "MAX_TOKENS" ? "max_tokens" : "end",
        model: body.modelVersion ?? input.model,
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      };
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
