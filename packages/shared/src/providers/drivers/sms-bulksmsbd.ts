import { z } from "zod";
import type { ProviderDriverDefinition, SmsDriver } from "../types.ts";
import { isGsm7Text } from "../../notifications/sms-length.ts";

/**
 * BulkSMSBD (docs/PROJECT_SPEC.md §10.3, the second of the two named BD
 * gateways — see docs/DECISIONS.md). Implemented against the `GET
 * /api/smsapi` (send) and `GET /api/getBalanceApi` (balance) shape
 * documented by BulkSMSBD's own community client libraries (response_code
 * 202 = submitted); not BulkSMSBD's own published reference and not
 * verified against a live account (no merchant credentials exist in this
 * environment — same caveat as every other real driver since M5). Note:
 * BulkSMSBD requires IP whitelisting disabled, or the sending server's IP
 * added to the account dashboard, before any of this works — operational
 * step for whoever configures this in production, not something the driver
 * can do. Re-verify endpoint paths/response codes against BulkSMSBD's
 * current docs before going live.
 */
export const bulkSmsBdConfigSchema = z.object({
  apiKey: z.string().min(1),
  senderId: z.string().min(1),
  baseUrl: z.string().url().default("http://bulksmsbd.net/api"),
});
export type BulkSmsBdConfig = z.infer<typeof bulkSmsBdConfigSchema>;

interface BulkSmsBdResponse {
  response_code?: number;
  error_message?: string;
  message_id?: string;
  balance?: number;
}

export function createBulkSmsBdDriver(config: BulkSmsBdConfig): SmsDriver {
  return {
    async send(to, text) {
      const url = new URL(`${config.baseUrl}/smsapi`);
      url.searchParams.set("api_key", config.apiKey);
      url.searchParams.set("type", isGsm7Text(text) ? "text" : "unicode");
      url.searchParams.set("number", to.replace(/^\+/, ""));
      url.searchParams.set("senderid", config.senderId);
      url.searchParams.set("message", text);
      const response = await fetch(url.toString());
      const body = (await response.json().catch(() => ({}))) as BulkSmsBdResponse;
      if (!response.ok || body.response_code !== 202) {
        throw new Error(body.error_message ?? `BulkSMSBD send failed (response_code ${body.response_code ?? "unknown"})`);
      }
    },
    async balance() {
      const url = new URL(`${config.baseUrl}/getBalanceApi`);
      url.searchParams.set("api_key", config.apiKey);
      const response = await fetch(url.toString());
      const body = (await response.json().catch(() => ({}))) as BulkSmsBdResponse;
      return body.balance ?? 0;
    },
  };
}

export const bulkSmsBdDriverDefinition: ProviderDriverDefinition<BulkSmsBdConfig> = {
  capability: "sms",
  driver: "bulksmsbd",
  label: { bn: "BulkSMSBD", en: "BulkSMSBD" },
  configSchema: bulkSmsBdConfigSchema,
  secretFields: ["apiKey"],
  async testConnection(config) {
    try {
      const url = new URL(`${config.baseUrl}/getBalanceApi`);
      url.searchParams.set("api_key", config.apiKey);
      const response = await fetch(url.toString());
      const body = (await response.json().catch(() => ({}))) as BulkSmsBdResponse;
      if (!response.ok) return { ok: false, message: `HTTP ${response.status}` };
      return { ok: true, message: "Connected to BulkSMSBD.", details: { balance: body.balance } };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
