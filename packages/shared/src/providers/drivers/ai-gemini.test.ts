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

describe("Gemini thought signatures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the signature from a function call and sends it back on the next turn", async () => {
    const replies = [
      { candidates: [{ content: { parts: [{ functionCall: { name: "search_products", args: { query: "silk" } }, thoughtSignature: "sig-1" }] } }] },
      { candidates: [{ content: { parts: [{ text: "Yes, we have silk sarees." }] } }] },
    ];
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(replies.shift()), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const driver = createGeminiDriver({ apiKey: "k", defaultModel: "m", baseUrl: "https://example.test", apiVersion: "v1beta", inputCentsPerMTok: 0, outputCentsPerMTok: 0, timeoutMs: 10_000 });

    const first = await driver.chat!({ model: "m", system: "s", messages: [{ role: "user", text: "silk?" }], tools: ASSISTANT_TOOLS, maxTokens: 100 } as never);
    expect(first.toolCalls[0]).toMatchObject({ name: "search_products", signature: "sig-1" });

    await driver.chat!({
      model: "m",
      system: "s",
      messages: [
        { role: "user", text: "silk?" },
        { role: "assistant", text: first.text, toolCalls: first.toolCalls },
        { role: "tool", results: [{ toolCallId: first.toolCalls[0]!.id, name: "search_products", content: "[]", isError: false }] },
      ],
      tools: ASSISTANT_TOOLS,
      maxTokens: 100,
    } as never);
    const sent = JSON.parse(String((fetchMock.mock.calls[1]![1] as RequestInit).body)) as { contents: { role: string; parts: Record<string, unknown>[] }[] };
    expect(sent.contents[1]!.parts[0]).toEqual({ functionCall: { name: "search_products", args: { query: "silk" } }, thoughtSignature: "sig-1" });
  });
});
