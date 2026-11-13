import { z } from "zod";
import type { ProviderDriverDefinition, WhatsappDriver } from "../types.ts";
import { parseWhatsappWebhook } from "./meta-messaging.ts";

/**
 * Meta WhatsApp Business Cloud API (docs/PROJECT_SPEC.md §10.3). Implemented
 * against Meta's documented `POST /{api_version}/{phone_number_id}/messages`
 * endpoint (Bearer access token, `messaging_product: "whatsapp"`,
 * E.164-without-`+` recipient numbers) — not verified against a live Meta
 * app/phone number in this environment (no merchant credentials exist yet,
 * same caveat as every other real driver added since M5). Re-verify the API
 * version and payload shape against Meta's current docs before going live;
 * see `WhatsappDriver`'s doc comment (types.ts) for the business-initiated
 * template-requirement limitation this driver does not model.
 */
export const whatsappCloudConfigSchema = z.object({
  accessToken: z.string().min(1),
  phoneNumberId: z.string().min(1),
  apiVersion: z.string().default("v21.0"),
  baseUrl: z.string().url().default("https://graph.facebook.com"),
  /** §16 M15 inbox — Meta app secret, verifies `X-Hub-Signature-256` on inbound webhooks. Required to receive messages. */
  appSecret: z.string().min(1).optional(),
  /** §16 M15 inbox — the verify token entered in the Meta app's webhook setup. */
  verifyToken: z.string().min(8).optional(),
});
export type WhatsappCloudConfig = z.infer<typeof whatsappCloudConfigSchema>;

function endpoint(config: WhatsappCloudConfig, path: string): string {
  return `${config.baseUrl}/${config.apiVersion}/${config.phoneNumberId}${path}`;
}

function normalizeRecipient(to: string): string {
  return to.replace(/^\+/, "");
}

export function createWhatsappCloudDriver(config: WhatsappCloudConfig): WhatsappDriver {
  async function sendText(to: string, text: string): Promise<{ externalMessageId: string | null }> {
    const response = await fetch(endpoint(config, "/messages"), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeRecipient(to),
        type: "text",
        text: { body: text },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string } };
    if (!response.ok) {
      throw new Error(body.error?.message ?? `WhatsApp Cloud API send failed (HTTP ${response.status})`);
    }
    return { externalMessageId: body.messages?.[0]?.id ?? null };
  }
  return {
    async send(to, text) {
      await sendText(to, text);
    },
    sendSession: sendText,
    parseWebhook: parseWhatsappWebhook,
  };
}

export const whatsappCloudDriverDefinition: ProviderDriverDefinition<WhatsappCloudConfig> = {
  capability: "whatsapp",
  driver: "whatsapp_cloud",
  label: { bn: "WhatsApp ক্লাউড API (Meta)", en: "WhatsApp Cloud API (Meta)" },
  configSchema: whatsappCloudConfigSchema,
  secretFields: ["accessToken", "appSecret"],
  async testConnection(config) {
    try {
      const response = await fetch(endpoint(config, "?fields=verified_name,display_phone_number"), {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      });
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string }; display_phone_number?: string };
      if (!response.ok) return { ok: false, message: body.error?.message ?? `HTTP ${response.status}` };
      return { ok: true, message: "Connected to WhatsApp Cloud API.", details: { displayPhoneNumber: body.display_phone_number } };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
