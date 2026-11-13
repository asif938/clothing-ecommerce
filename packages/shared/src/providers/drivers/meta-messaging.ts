import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ChatChannelDriver, InboundChatMessage, InboxEvent, ProviderDriverDefinition } from "../types.ts";

/**
 * Meta messaging webhooks and send APIs for the support inbox
 * (docs/PROJECT_SPEC.md §10.3, §16 M15): WhatsApp Cloud, Messenger and
 * Instagram all deliver webhooks signed with the Meta app secret
 * (`X-Hub-Signature-256: sha256=<hex HMAC of the raw body>`) and verify the
 * subscription with a `hub.verify_token` GET. Payload shapes follow Meta's
 * documented webhook objects (`whatsapp_business_account`, `page`,
 * `instagram`); not exercised against a live Meta app here.
 */

/** Constant-time check of `X-Hub-Signature-256` against the raw request body. */
export function verifyMetaSignature(rawBody: Buffer | string, header: string | undefined | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : typeof value === "number" ? String(value) : null;
}

const ATTACHMENT_TYPES = new Set(["image", "video", "audio", "file", "location", "sticker"]);

function attachmentType(type: string | null): InboundChatMessage["attachments"][number]["type"] {
  if (type === "document") return "file";
  return type && ATTACHMENT_TYPES.has(type) ? (type as InboundChatMessage["attachments"][number]["type"]) : "other";
}

/**
 * WhatsApp Cloud API webhook → inbox events. Media arrives as a media id
 * (downloading it needs a second authenticated call), so attachments carry
 * their type and caption only; staff see "[image]" and can ask the customer
 * to resend elsewhere if needed.
 */
export function parseWhatsappWebhook(payload: unknown): InboxEvent[] {
  const events: InboxEvent[] = [];
  const body = asRecord(payload);
  if (body.object !== "whatsapp_business_account") return events;
  for (const entry of asArray(body.entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const value = asRecord(asRecord(change).value);
      const names = new Map<string, string>();
      for (const contact of asArray(value.contacts)) {
        const c = asRecord(contact);
        const waId = str(c.wa_id);
        const name = str(asRecord(c.profile).name);
        if (waId && name) names.set(waId, name);
      }
      for (const message of asArray(value.messages)) {
        const m = asRecord(message);
        const from = str(m.from);
        const id = str(m.id);
        if (!from || !id) continue;
        const type = str(m.type);
        const media = type ? asRecord(m[type]) : {};
        const text = type === "text" ? (str(asRecord(m.text).body) ?? "") : type === "button" ? (str(asRecord(m.button).text) ?? "") : type === "interactive" ? (str(asRecord(asRecord(m.interactive).button_reply).title) ?? str(asRecord(asRecord(m.interactive).list_reply).title) ?? "") : (str(media.caption) ?? "");
        const attachments = type && type !== "text" && type !== "button" && type !== "interactive" ? [{ type: attachmentType(type), url: null, caption: str(media.caption) }] : [];
        const seconds = Number(str(m.timestamp) ?? NaN);
        events.push({
          kind: "message",
          contactId: from,
          externalMessageId: id,
          contactName: names.get(from) ?? null,
          phone: `+${from.replace(/^\+/, "")}`,
          text,
          attachments,
          timestamp: Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date(),
        });
      }
      for (const status of asArray(value.statuses)) {
        const s = asRecord(status);
        const id = str(s.id);
        const state = str(s.status);
        if (!id || !state || !["sent", "delivered", "read", "failed"].includes(state)) continue;
        const error = asArray(s.errors).map((e) => str(asRecord(e).title) ?? str(asRecord(e).message)).find(Boolean) ?? null;
        events.push({ kind: "status", externalMessageId: id, status: state as "sent" | "delivered" | "read" | "failed", error });
      }
    }
  }
  return events;
}

/** Messenger (`object: "page"`) and Instagram (`object: "instagram"`) webhooks share the `entry[].messaging[]` shape. Echoes of our own sends are skipped. */
export function parseMessengerWebhook(payload: unknown, expectedObject: "page" | "instagram"): InboxEvent[] {
  const events: InboxEvent[] = [];
  const body = asRecord(payload);
  if (body.object !== expectedObject) return events;
  for (const entry of asArray(body.entry)) {
    for (const item of asArray(asRecord(entry).messaging)) {
      const event = asRecord(item);
      const sender = str(asRecord(event.sender).id);
      const message = asRecord(event.message);
      if (sender && str(message.mid) && message.is_echo !== true) {
        const attachments = asArray(message.attachments).map((a) => {
          const att = asRecord(a);
          return { type: attachmentType(str(att.type)), url: str(asRecord(att.payload).url), caption: null };
        });
        const ms = Number(event.timestamp);
        events.push({
          kind: "message",
          contactId: sender,
          externalMessageId: str(message.mid)!,
          contactName: null,
          phone: null,
          text: str(message.text) ?? "",
          attachments,
          timestamp: Number.isFinite(ms) ? new Date(ms) : new Date(),
        });
      }
      for (const mid of asArray(asRecord(event.delivery).mids)) {
        const id = str(mid);
        if (id) events.push({ kind: "status", externalMessageId: id, status: "delivered" });
      }
      const readMid = str(asRecord(event.read).mid);
      if (readMid) events.push({ kind: "status", externalMessageId: readMid, status: "read" });
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Messenger / Instagram drivers (capability `chat_channel`)
// ---------------------------------------------------------------------------

export const metaChatConfigSchema = z.object({
  /** Facebook Page id (Messenger) — also the page the Instagram account is linked to. */
  pageId: z.string().min(1),
  pageAccessToken: z.string().min(1),
  /** App secret for `X-Hub-Signature-256` webhook verification. */
  appSecret: z.string().min(1),
  /** Any string you also enter in the Meta app's webhook setup. */
  verifyToken: z.string().min(8),
  apiVersion: z.string().default("v22.0"),
  baseUrl: z.string().url().default("https://graph.facebook.com"),
});
export type MetaChatConfig = z.infer<typeof metaChatConfigSchema>;

function createMetaChatDriver(channel: "messenger" | "instagram", config: MetaChatConfig): ChatChannelDriver {
  return {
    channel,
    async sendText(contactId, text) {
      const response = await fetch(`${config.baseUrl}/${config.apiVersion}/${config.pageId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.pageAccessToken}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ recipient: { id: contactId }, messaging_type: "RESPONSE", message: { text } }),
      });
      const body = (await response.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? `Meta send failed (HTTP ${response.status})`);
      return { externalMessageId: body.message_id ?? null };
    },
    parseWebhook(payload) {
      return parseMessengerWebhook(payload, channel === "messenger" ? "page" : "instagram");
    },
  };
}

export function createMessengerDriver(config: MetaChatConfig): ChatChannelDriver {
  return createMetaChatDriver("messenger", config);
}

export function createInstagramDriver(config: MetaChatConfig): ChatChannelDriver {
  return createMetaChatDriver("instagram", config);
}

async function testMetaChat(config: MetaChatConfig) {
  try {
    const response = await fetch(`${config.baseUrl}/${config.apiVersion}/${config.pageId}?fields=name`, { headers: { Authorization: `Bearer ${config.pageAccessToken}` }, signal: AbortSignal.timeout(15_000) });
    const body = (await response.json().catch(() => ({}))) as { name?: string; error?: { message?: string } };
    if (!response.ok) return { ok: false, message: body.error?.message ?? `HTTP ${response.status}` };
    return { ok: true, message: `Connected to page "${body.name ?? config.pageId}".` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

export const messengerDriverDefinition: ProviderDriverDefinition<MetaChatConfig> = {
  capability: "chat_channel",
  driver: "messenger",
  label: { bn: "Facebook Messenger", en: "Facebook Messenger" },
  configSchema: metaChatConfigSchema,
  secretFields: ["pageAccessToken", "appSecret"],
  testConnection: testMetaChat,
};

export const instagramDriverDefinition: ProviderDriverDefinition<MetaChatConfig> = {
  capability: "chat_channel",
  driver: "instagram",
  label: { bn: "Instagram ডাইরেক্ট মেসেজ", en: "Instagram Direct" },
  configSchema: metaChatConfigSchema,
  secretFields: ["pageAccessToken", "appSecret"],
  testConnection: testMetaChat,
};

// ---------------------------------------------------------------------------
// Mock chat channel — lets the whole inbox flow run with no Meta app.
// ---------------------------------------------------------------------------

export const mockChatConfigSchema = z.object({
  channel: z.enum(["messenger", "instagram"]).default("messenger"),
  simulate: z.enum(["success", "failure"]).default("success"),
});
export type MockChatConfig = z.infer<typeof mockChatConfigSchema>;

/**
 * Accepts `{ contactId, text, name?, messageId? }` (or an array of them) at
 * the webhook URL, unsigned — post one with curl or the admin "simulate"
 * button to see a message land in the inbox.
 */
export function parseMockChatWebhook(payload: unknown): InboxEvent[] {
  const items = Array.isArray(payload) ? payload : [payload];
  const events: InboxEvent[] = [];
  for (const raw of items) {
    const item = asRecord(raw);
    const contactId = str(item.contactId);
    const text = str(item.text);
    if (!contactId || !text) continue;
    events.push({
      kind: "message",
      contactId,
      externalMessageId: str(item.messageId) ?? `mock_in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      contactName: str(item.name),
      phone: str(item.phone),
      text,
      attachments: [],
      timestamp: new Date(),
    });
  }
  return events;
}

export function createMockChatDriver(config: MockChatConfig, onSend?: (contactId: string, text: string) => void): ChatChannelDriver {
  return {
    channel: config.channel,
    async sendText(contactId, text) {
      onSend?.(contactId, text);
      if (config.simulate === "failure") throw new Error("Mock chat channel configured to simulate failure");
      return { externalMessageId: `mock_out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    },
    parseWebhook: parseMockChatWebhook,
  };
}

export const mockChatDriverDefinition: ProviderDriverDefinition<MockChatConfig> = {
  capability: "chat_channel",
  driver: "mock",
  label: { bn: "মক (পরীক্ষার জন্য)", en: "Mock (for testing)" },
  configSchema: mockChatConfigSchema,
  secretFields: [],
  async testConnection(config) {
    return config.simulate === "failure" ? { ok: false, message: "Mock driver is configured to simulate failure." } : { ok: true, message: "Mock driver is configured to simulate success." };
  },
};
