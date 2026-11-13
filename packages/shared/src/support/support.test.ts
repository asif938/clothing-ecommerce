import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ASSISTANT_TOOLS, canReply, detectLanguage, formatTranscript, renderCannedReply, slaDueAt, slaState, wantsHuman } from "./index.ts";
import { parseMessengerWebhook, parseMockChatWebhook, parseWhatsappWebhook, verifyMetaSignature } from "../providers/drivers/meta-messaging.ts";
import { buildTelephonyParams, formatNumber, genericTelephonyConfigSchema, parseGenericTelephonyWebhook } from "../providers/drivers/telephony.ts";
import { toAnthropicMessages } from "../providers/drivers/ai-anthropic.ts";
import { toOpenAiMessages } from "../providers/drivers/ai-openai.ts";
import { toGeminiContents } from "../providers/drivers/ai-gemini.ts";
import { mockChat } from "../providers/drivers/ai-mock.ts";
import type { AiChatMessage } from "../providers/types.ts";

describe("SLA", () => {
  const minutes = { low: 1440, normal: 480, high: 120, urgent: 30 };
  const start = new Date("2026-11-13T04:00:00Z");

  it("computes deadlines by priority", () => {
    expect(slaDueAt(start, "urgent", minutes).toISOString()).toBe("2026-11-13T04:30:00.000Z");
    expect(slaDueAt(start, "normal", minutes).toISOString()).toBe("2026-11-13T12:00:00.000Z");
  });

  it("classifies on track, due soon, breached and met", () => {
    const due = slaDueAt(start, "high", minutes); // 06:00
    expect(slaState(due, null, new Date("2026-11-13T04:30:00Z"), 120)).toBe("on_track");
    expect(slaState(due, null, new Date("2026-11-13T05:40:00Z"), 120)).toBe("due_soon");
    expect(slaState(due, null, new Date("2026-11-13T06:01:00Z"), 120)).toBe("breached");
    expect(slaState(due, new Date("2026-11-13T05:59:00Z"), new Date("2026-11-14T00:00:00Z"), 120)).toBe("met");
    expect(slaState(due, new Date("2026-11-13T06:30:00Z"), new Date(), 120)).toBe("breached");
    expect(slaState(null, null, new Date(), 120)).toBeNull();
  });
});

describe("conversation rules", () => {
  it("enforces Meta's 24-hour reply window but not on live chat", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    expect(canReply("live_chat", null, now)).toBe(true);
    expect(canReply("whatsapp", new Date("2026-11-12T13:00:00Z"), now)).toBe(true);
    expect(canReply("messenger", new Date("2026-11-12T11:00:00Z"), now)).toBe(false);
    expect(canReply("instagram", null, now)).toBe(false);
  });

  it("spots requests for a person in English, Bangla and Banglish", () => {
    expect(wantsHuman("Can I talk to a human please")).toBe(true);
    expect(wantsHuman("আমি মানুষের সাথে কথা বলতে চাই")).toBe(true);
    expect(wantsHuman("manush er sathe kotha bolbo")).toBe(true);
    expect(wantsHuman("Do you have this in XL?")).toBe(false);
  });

  it("renders canned replies, transcripts and detects language", () => {
    expect(renderCannedReply("Hi {customer_name}, order {order_number}", { customer_name: "Rina" })).toBe("Hi Rina, order {order_number}");
    expect(formatTranscript([{ authorType: "customer", body: "hello\n there" }, { authorType: "staff", body: "Hi!" }])).toBe("Customer: hello there\nAgent: Hi!");
    expect(detectLanguage("দাম কত?")).toBe("Bangla");
    expect(detectLanguage("dam koto?")).toBe("English");
  });

  it("declares strict object schemas for every assistant tool", () => {
    for (const tool of ASSISTANT_TOOLS) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
    expect(ASSISTANT_TOOLS.map((t) => t.name)).toContain("handoff_to_human");
  });
});

describe("Meta webhooks", () => {
  it("verifies X-Hub-Signature-256 in constant time", () => {
    const body = Buffer.from('{"object":"page"}');
    const sig = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyMetaSignature(body, sig, "secret")).toBe(true);
    expect(verifyMetaSignature(body, sig, "other")).toBe(false);
    expect(verifyMetaSignature(body, undefined, "secret")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=abc", "secret")).toBe(false);
  });

  it("parses WhatsApp messages, media captions and statuses", () => {
    const events = parseWhatsappWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "8801712345678", profile: { name: "Rina" } }],
                messages: [
                  { from: "8801712345678", id: "wamid.1", timestamp: "1763020800", type: "text", text: { body: "XL ache?" } },
                  { from: "8801712345678", id: "wamid.2", timestamp: "1763020801", type: "image", image: { id: "m1", caption: "this one" } },
                ],
                statuses: [{ id: "wamid.out", status: "read" }, { id: "wamid.bad", status: "failed", errors: [{ title: "Re-engagement message" }] }],
              },
            },
          ],
        },
      ],
    });
    expect(events[0]).toMatchObject({ kind: "message", contactId: "8801712345678", phone: "+8801712345678", contactName: "Rina", text: "XL ache?", attachments: [] });
    expect(events[1]).toMatchObject({ text: "this one", attachments: [{ type: "image", caption: "this one" }] });
    expect(events[2]).toEqual({ kind: "status", externalMessageId: "wamid.out", status: "read", error: null });
    expect(events[3]).toMatchObject({ status: "failed", error: "Re-engagement message" });
    expect(parseWhatsappWebhook({ object: "page" })).toEqual([]);
  });

  it("parses Messenger and Instagram messages, skipping echoes", () => {
    const payload = (object: string) => ({
      object,
      entry: [
        {
          messaging: [
            { sender: { id: "psid1" }, timestamp: 1763020800000, message: { mid: "m1", text: "hi", attachments: [{ type: "image", payload: { url: "https://x/y.jpg" } }] } },
            { sender: { id: "page" }, message: { mid: "m2", text: "our reply", is_echo: true } },
            { sender: { id: "psid1" }, delivery: { mids: ["m3"] } },
            { sender: { id: "psid1" }, read: { mid: "m4" } },
          ],
        },
      ],
    });
    const events = parseMessengerWebhook(payload("page"), "page");
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ contactId: "psid1", externalMessageId: "m1", text: "hi", attachments: [{ type: "image", url: "https://x/y.jpg" }] });
    expect(events[1]).toEqual({ kind: "status", externalMessageId: "m3", status: "delivered" });
    expect(parseMessengerWebhook(payload("page"), "instagram")).toEqual([]);
    expect(parseMessengerWebhook(payload("instagram"), "instagram")).toHaveLength(3);
  });

  it("accepts the mock's simple payload", () => {
    expect(parseMockChatWebhook({ contactId: "c1", text: "hello", name: "Test" })[0]).toMatchObject({ contactId: "c1", text: "hello", contactName: "Test" });
    expect(parseMockChatWebhook([{ contactId: "c1" }])).toEqual([]);
  });
});

describe("generic telephony", () => {
  const config = genericTelephonyConfigSchema.parse({ url: "https://pbx.example.com/call", apiKey: "k", params: { agent: "{agent}", number: "{customer}", ref: "{reference}", key: "{api_key}" } });

  it("formats numbers and fills the request template", () => {
    expect(formatNumber("+8801712345678", "local")).toBe("01712345678");
    expect(formatNumber("+8801712345678", "digits")).toBe("8801712345678");
    expect(buildTelephonyParams(config, { agent: "+8801811111111", customer: "+8801712345678", reference: "call_1" })).toEqual({ agent: "01811111111", number: "01712345678", ref: "call_1", key: "k" });
  });

  it("maps status webhooks and ignores unknown statuses", () => {
    expect(parseGenericTelephonyWebhook(config, { call_id: 77, reference: "call_1", status: "No-Answer", duration: "0" })).toEqual({ externalId: "77", reference: "call_1", status: "no_answer", durationSeconds: 0, recordingUrl: null });
    expect(parseGenericTelephonyWebhook(config, { status: "weird" })).toBeNull();
  });
});

describe("AI chat transcripts", () => {
  const transcript: AiChatMessage[] = [
    { role: "user", text: "Where is ABC2611130001?" },
    { role: "assistant", text: "Let me check.", toolCalls: [{ id: "t1", name: "order_status", input: { order_number: "ABC2611130001" } }] },
    { role: "tool", results: [{ toolCallId: "t1", name: "order_status", content: '{"status":"shipped"}' }] },
  ];

  it("maps to Anthropic turns with tool_use / tool_result blocks", () => {
    const messages = toAnthropicMessages([...transcript, { role: "user", text: "thanks" }]);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[1]!.content).toEqual([
      { type: "text", text: "Let me check." },
      { type: "tool_use", id: "t1", name: "order_status", input: { order_number: "ABC2611130001" } },
    ]);
    // Tool result and the following user text merge into one user turn.
    expect(messages[2]!.content).toEqual([
      { type: "tool_result", tool_use_id: "t1", content: '{"status":"shipped"}' },
      { type: "text", text: "thanks" },
    ]);
  });

  it("maps to OpenAI and Gemini formats", () => {
    const openai = toOpenAiMessages("sys", transcript);
    expect(openai[0]).toEqual({ role: "system", content: "sys" });
    expect(openai[2]).toMatchObject({ role: "assistant", tool_calls: [{ id: "t1", type: "function", function: { name: "order_status", arguments: '{"order_number":"ABC2611130001"}' } }] });
    expect(openai[3]).toEqual({ role: "tool", tool_call_id: "t1", content: '{"status":"shipped"}' });
    const gemini = toGeminiContents(transcript);
    expect(gemini[1]).toEqual({ role: "model", parts: [{ text: "Let me check." }, { functionCall: { name: "order_status", args: { order_number: "ABC2611130001" } } }] });
    expect(gemini[2]).toEqual({ role: "user", parts: [{ functionResponse: { name: "order_status", response: { content: '{"status":"shipped"}' } } }] });
  });

  it("mock chat picks tools deterministically", () => {
    const base = { model: "m", system: "s", tools: ASSISTANT_TOOLS, maxTokens: 100 };
    expect(mockChat({ ...base, messages: [{ role: "user", text: "status of ABC2611130001?" }] }).toolCalls[0]).toMatchObject({ name: "order_status", input: { order_number: "ABC2611130001" } });
    expect(mockChat({ ...base, messages: [{ role: "user", text: "I want a refund" }] }).toolCalls[0]!.name).toBe("handoff_to_human");
    expect(mockChat({ ...base, messages: [{ role: "user", text: "panjabi er dam koto, size ache?" }] }).toolCalls[0]!.name).toBe("search_products");
    expect(mockChat({ ...base, messages: transcript }).text).toContain("shipped");
    expect(mockChat({ ...base, messages: [{ role: "user", text: "hello" }] }).stopReason).toBe("end");
  });
});
