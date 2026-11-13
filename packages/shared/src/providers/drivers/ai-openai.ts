import { z } from "zod";
import type { AiChatMessage, AiDriver, ProviderDriverDefinition } from "../types.ts";

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

/** Neutral transcript → Chat Completions messages (tool results become `role: "tool"` messages, one per call). */
export function toOpenAiMessages(system: string, messages: AiChatMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "user") out.push({ role: "user", content: message.text });
    else if (message.role === "assistant") {
      out.push({
        role: "assistant",
        content: message.text || null,
        ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input) } })) } : {}),
      });
    } else {
      for (const result of message.results) out.push({ role: "tool", tool_call_id: result.toolCallId, content: result.content });
    }
  }
  return out;
}

function parseArguments(raw: string | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(raw ?? "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
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

    async chat(input) {
      const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: headers(config),
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify({
          model: input.model,
          messages: toOpenAiMessages(input.system, input.messages),
          tools: input.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
          max_completion_tokens: input.maxTokens,
          ...(input.temperature !== null && input.temperature !== undefined ? { temperature: input.temperature } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        model?: string;
        choices?: { message?: { content?: string | null; refusal?: string | null; tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? `OpenAI request failed (HTTP ${response.status})`);
      const choice = body.choices?.[0];
      if (choice?.message?.refusal) throw new Error(`The model declined this request: ${choice.message.refusal}`);
      const toolCalls = (choice?.message?.tool_calls ?? []).filter((c) => c.function?.name).map((c) => ({ id: c.id, name: c.function!.name!, input: parseArguments(c.function?.arguments) }));
      return {
        text: choice?.message?.content ?? "",
        toolCalls,
        stopReason: toolCalls.length > 0 ? "tool_use" : choice?.finish_reason === "length" ? "max_tokens" : "end",
        model: body.model ?? input.model,
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      };
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
