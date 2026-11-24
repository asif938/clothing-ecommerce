import { afterEach, describe, expect, it, vi } from "vitest";
import { ASSISTANT_TOOLS } from "../../support/index.ts";
import { createGeminiDriver, toGeminiSchema } from "./ai-gemini.ts";

describe("toGeminiSchema", () => {
  it("drops keywords Gemini rejects, at every level, and keeps the supported ones", () => {
    const schema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      additionalProperties: false,
      properties: {
        fit: { type: "string", enum: ["snug", "loose"], default: "snug" },
        tags: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" } } } },
      },
      required: ["fit"],
    };
    expect(toGeminiSchema(schema)).toEqual({
      type: "object",
      properties: {
        fit: { type: "string", enum: ["snug", "loose"] },
        tags: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
      },
      required: ["fit"],
    });
  });

  it("keeps a property literally named like a dropped keyword", () => {
    expect(toGeminiSchema({ type: "object", properties: { default: { type: "string" } } })).toEqual({ type: "object", properties: { default: { type: "string" } } });
  });
});

describe("Gemini chat request", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the chat assistant's tools without additionalProperties", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hi!" }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const driver = createGeminiDriver({ apiKey: "k", defaultModel: "m", baseUrl: "https://example.test", apiVersion: "v1beta", inputCentsPerMTok: 0, outputCentsPerMTok: 0, timeoutMs: 10_000 });
    const result = await driver.chat!({ model: "m", system: "s", messages: [{ role: "user", text: "hi" }], tools: ASSISTANT_TOOLS, maxTokens: 100 } as never);
    const body = String((fetchMock.mock.calls[0]![1] as RequestInit).body);
    expect(body).not.toContain("additionalProperties");
    expect(JSON.parse(body).tools[0].functionDeclarations).toHaveLength(ASSISTANT_TOOLS.length);
    expect(result.text).toBe("Hi!");
  });
});
