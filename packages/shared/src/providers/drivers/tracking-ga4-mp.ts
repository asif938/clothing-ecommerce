import { z } from "zod";
import type { ProviderDriverDefinition, TrackingDriver } from "../types.ts";

/**
 * GA4 Measurement Protocol (docs/PROJECT_SPEC.md §10.5). Implemented
 * against Google's documented `POST /mp/collect` endpoint
 * (`measurement_id`/`api_secret` query params, a `client_id` identifying
 * the visitor — we reuse our own first-party `anonymous_id` for it since
 * GA4's own client id isn't something our server has) — not verified
 * against a live GA4 property in this environment (no credentials exist,
 * same caveat as every other real driver since M5). GA4 MP has no event-id
 * based dedup the way Meta/TikTok do; `event_id` is still sent as a custom
 * param (`transaction_id` for Purchase) so it's visible in GA4's reports.
 */
export const ga4MpConfigSchema = z.object({
  measurementId: z.string().min(1),
  apiSecret: z.string().min(1),
  baseUrl: z.string().url().default("https://www.google-analytics.com"),
});
export type Ga4MpConfig = z.infer<typeof ga4MpConfigSchema>;

export function createGa4MpDriver(config: Ga4MpConfig): TrackingDriver {
  return {
    async send(event) {
      const clientId = event.userData.phone ?? event.eventId;
      const body = {
        client_id: clientId,
        events: [
          {
            name: event.eventName.toLowerCase(),
            params: {
              transaction_id: event.eventId,
              currency: event.currency,
              value: event.value,
              items: event.contents?.map((c) => ({ item_id: c.id, quantity: c.quantity, price: c.price })),
            },
          },
        ],
      };
      const response = await fetch(`${config.baseUrl}/mp/collect?measurement_id=${encodeURIComponent(config.measurementId)}&api_secret=${encodeURIComponent(config.apiSecret)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // GA4 MP returns 204 with no body on success and does not echo
      // validation errors on the real collect endpoint (only /debug/mp/collect does) — any non-2xx is a real failure.
      if (!response.ok) {
        throw new Error(`GA4 Measurement Protocol send failed (HTTP ${response.status})`);
      }
    },
  };
}

export const ga4MpDriverDefinition: ProviderDriverDefinition<Ga4MpConfig> = {
  capability: "tracking",
  driver: "ga4_mp",
  label: { bn: "GA4 Measurement Protocol", en: "GA4 Measurement Protocol" },
  configSchema: ga4MpConfigSchema,
  secretFields: ["apiSecret"],
  async testConnection(config) {
    try {
      const response = await fetch(`${config.baseUrl}/debug/mp/collect?measurement_id=${encodeURIComponent(config.measurementId)}&api_secret=${encodeURIComponent(config.apiSecret)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: "test-connection", events: [{ name: "test_connection" }] }),
      });
      const body = (await response.json().catch(() => ({}))) as { validationMessages?: { description?: string }[] };
      if (!response.ok) return { ok: false, message: `HTTP ${response.status}` };
      if (body.validationMessages && body.validationMessages.length > 0) {
        return { ok: false, message: body.validationMessages.map((m) => m.description).join("; ") };
      }
      return { ok: true, message: "GA4 accepted the test event (validated via /debug/mp/collect)." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
