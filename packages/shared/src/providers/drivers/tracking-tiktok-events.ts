import { createHash } from "node:crypto";
import { z } from "zod";
import type { ProviderDriverDefinition, TrackingDriver } from "../types.ts";

/**
 * TikTok Events API (docs/PROJECT_SPEC.md §10.5). Implemented against
 * TikTok's documented `POST /open_api/v1.3/pixel/track/` endpoint
 * (`Access-Token` header, SHA-256-hashed `phone_number`/`email` in
 * `user`, an `event_id` shared with the client pixel for dedup) — not
 * verified against a live TikTok Business account in this environment (no
 * credentials exist, same caveat as every other real driver since M5).
 */
export const tiktokEventsConfigSchema = z.object({
  pixelCode: z.string().min(1),
  accessToken: z.string().min(1),
  baseUrl: z.string().url().default("https://business-api.tiktok.com/open_api/v1.3"),
});
export type TiktokEventsConfig = z.infer<typeof tiktokEventsConfigSchema>;

function sha256Lower(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function createTiktokEventsDriver(config: TiktokEventsConfig): TrackingDriver {
  return {
    async send(event) {
      const user: Record<string, string> = {};
      if (event.userData.phone) user.phone_number = sha256Lower(event.userData.phone.replace(/[^\d]/g, ""));
      if (event.userData.email) user.email = sha256Lower(event.userData.email);
      if (event.userData.clientIp) user.ip = event.userData.clientIp;
      if (event.userData.userAgent) user.user_agent = event.userData.userAgent;

      const body = {
        pixel_code: config.pixelCode,
        event: event.eventName,
        event_id: event.eventId,
        timestamp: new Date(event.eventTimeUnixSeconds * 1000).toISOString(),
        context: { user, page: { url: event.sourceUrl } },
        properties: {
          currency: event.currency,
          value: event.value,
          contents: event.contents?.map((c) => ({ content_id: c.id, quantity: c.quantity, price: c.price })),
        },
      };

      const response = await fetch(`${config.baseUrl}/pixel/track/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Access-Token": config.accessToken },
        body: JSON.stringify(body),
      });
      const resBody = (await response.json().catch(() => ({}))) as { code?: number; message?: string };
      if (!response.ok || (resBody.code !== undefined && resBody.code !== 0)) {
        throw new Error(resBody.message ?? `TikTok Events API send failed (HTTP ${response.status})`);
      }
    },
  };
}

export const tiktokEventsDriverDefinition: ProviderDriverDefinition<TiktokEventsConfig> = {
  capability: "tracking",
  driver: "tiktok_events",
  label: { bn: "TikTok Events API", en: "TikTok Events API" },
  configSchema: tiktokEventsConfigSchema,
  secretFields: ["accessToken"],
  async testConnection(config) {
    try {
      const response = await fetch(`${config.baseUrl}/pixel/list/?business_id=&pixel_code=${encodeURIComponent(config.pixelCode)}`, {
        headers: { "Access-Token": config.accessToken },
      });
      const body = (await response.json().catch(() => ({}))) as { code?: number; message?: string };
      if (!response.ok || (body.code !== undefined && body.code !== 0)) return { ok: false, message: body.message ?? `HTTP ${response.status}` };
      return { ok: true, message: "Connected to the TikTok Events API." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
