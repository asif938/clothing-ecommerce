import { z } from "zod";
import type { ProviderDriverDefinition, SmsDriver } from "../types.ts";

/**
 * SSL Wireless SMS Plus (docs/PROJECT_SPEC.md §10.3, one of the two named BD
 * gateways — see docs/DECISIONS.md for why these two). Implemented against
 * the `POST /api/v3/send-sms` shape (JSON body carrying `api_token`/`sid`,
 * 13-digit `msisdn` without `+`) documented by SSL Wireless integration
 * guides; not SSL Wireless's own published reference (no merchant account
 * exists in this environment to confirm against — same caveat as every
 * other real driver since M5). Re-verify field names/response codes against
 * the current SSL Wireless API docs before going live.
 */
export const sslWirelessConfigSchema = z.object({
  apiToken: z.string().min(1),
  sid: z.string().min(1),
  baseUrl: z.string().url().default("https://smsplus.sslwireless.com/api/v3"),
});
export type SslWirelessConfig = z.infer<typeof sslWirelessConfigSchema>;

function toMsisdn(to: string): string {
  return to.replace(/^\+/, "");
}

export function createSslWirelessDriver(config: SslWirelessConfig): SmsDriver {
  return {
    async send(to, text) {
      const response = await fetch(`${config.baseUrl}/send-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_token: config.apiToken,
          sid: config.sid,
          msisdn: toMsisdn(to),
          sms: text,
          csms_id: `${Date.now()}`,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { status?: string; status_code?: number; error?: string };
      if (!response.ok || body.status !== "SUCCESS") {
        throw new Error(body.error ?? `SSL Wireless send-sms failed (status_code ${body.status_code ?? response.status})`);
      }
    },
  };
}

export const sslWirelessDriverDefinition: ProviderDriverDefinition<SslWirelessConfig> = {
  capability: "sms",
  driver: "sslwireless",
  label: { bn: "SSL Wireless SMS", en: "SSL Wireless SMS" },
  configSchema: sslWirelessConfigSchema,
  secretFields: ["apiToken"],
  async testConnection(config) {
    // SSL Wireless's documented API has no dedicated health-check endpoint;
    // a zero-length-tolerant probe isn't safe (it would send a real SMS), so
    // this only confirms the config shape parses — real delivery is
    // confirmed via the Notifications screen's "send test message" action,
    // which exercises `createSslWirelessDriver` for real.
    void config;
    return { ok: true, message: "Configuration looks valid. Use \"Send test message\" on the Notifications screen to verify delivery." };
  },
};
