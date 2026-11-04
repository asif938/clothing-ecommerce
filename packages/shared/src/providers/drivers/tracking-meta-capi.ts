import { createHash } from "node:crypto";
import { z } from "zod";
import type { ProviderDriverDefinition, TrackingDriver } from "../types.ts";

/**
 * Meta Conversions API (docs/PROJECT_SPEC.md §10.5). Implemented against
 * Meta's documented `POST /{api_version}/{pixel_id}/events` endpoint
 * (`access_token` query param, `user_data` fields hashed SHA-256 lowercase
 * per Meta's own spec, `event_id` shared with the client Pixel call for
 * dedup) — not verified against a live Meta Pixel/Business account in this
 * environment (no merchant credentials exist, same caveat as every other
 * real driver since M5).
 */
export const metaCapiConfigSchema = z.object({
  pixelId: z.string().min(1),
  accessToken: z.string().min(1),
  apiVersion: z.string().default("v21.0"),
  testEventCode: z.string().optional(),
  baseUrl: z.string().url().default("https://graph.facebook.com"),
});
export type MetaCapiConfig = z.infer<typeof metaCapiConfigSchema>;

function sha256Lower(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function createMetaCapiDriver(config: MetaCapiConfig): TrackingDriver {
  return {
    async send(event) {
      const userData: Record<string, unknown> = {};
      if (event.userData.phone) userData.ph = [sha256Lower(event.userData.phone.replace(/[^\d]/g, ""))];
      if (event.userData.email) userData.em = [sha256Lower(event.userData.email)];
      if (event.userData.clientIp) userData.client_ip_address = event.userData.clientIp;
      if (event.userData.userAgent) userData.client_user_agent = event.userData.userAgent;
      if (event.userData.fbc) userData.fbc = event.userData.fbc;
      if (event.userData.fbp) userData.fbp = event.userData.fbp;

      const body = {
        data: [
          {
            event_name: event.eventName,
            event_time: event.eventTimeUnixSeconds,
            event_id: event.eventId,
            action_source: "website",
            event_source_url: event.sourceUrl,
            user_data: userData,
            custom_data: {
              currency: event.currency,
              value: event.value,
              contents: event.contents?.map((c) => ({ id: c.id, quantity: c.quantity, item_price: c.price })),
            },
          },
        ],
        ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
      };

      const response = await fetch(`${config.baseUrl}/${config.apiVersion}/${config.pixelId}/events?access_token=${encodeURIComponent(config.accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(errBody.error?.message ?? `Meta CAPI send failed (HTTP ${response.status})`);
      }
    },
  };
}

export const metaCapiDriverDefinition: ProviderDriverDefinition<MetaCapiConfig> = {
  capability: "tracking",
  driver: "meta_capi",
  label: { bn: "Meta Conversions API", en: "Meta Conversions API" },
  configSchema: metaCapiConfigSchema,
  secretFields: ["accessToken"],
  async testConnection(config) {
    try {
      const response = await fetch(`${config.baseUrl}/${config.apiVersion}/${config.pixelId}?fields=id&access_token=${encodeURIComponent(config.accessToken)}`);
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
      if (!response.ok) return { ok: false, message: body.error?.message ?? `HTTP ${response.status}` };
      return { ok: true, message: "Connected to the Meta Pixel.", details: { pixelId: body.id } };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
