import { z } from "zod";
import type { EmailDriver, ProviderDriverDefinition } from "../types.ts";

/**
 * Brevo transactional email (docs/PROJECT_SPEC.md §10.3). Implemented
 * against Brevo's documented `POST /v3/smtp/email` endpoint (`api-key`
 * header, `sender`/`to`/`subject`/`htmlContent` body) — not verified
 * against a live Brevo account in this environment (no merchant
 * credentials exist yet, same caveat as every other real driver since M5).
 */
export const brevoEmailConfigSchema = z.object({
  apiKey: z.string().min(1),
  fromAddress: z.string().email(),
  fromName: z.string().min(1),
  baseUrl: z.string().url().default("https://api.brevo.com/v3"),
});
export type BrevoEmailConfig = z.infer<typeof brevoEmailConfigSchema>;

export function createBrevoEmailDriver(config: BrevoEmailConfig): EmailDriver {
  return {
    async send(message) {
      const response = await fetch(`${config.baseUrl}/smtp/email`, {
        method: "POST",
        headers: { "api-key": config.apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { email: config.fromAddress, name: config.fromName },
          to: [{ email: message.to }],
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Brevo send failed (HTTP ${response.status})`);
      }
    },
  };
}

export const brevoEmailDriverDefinition: ProviderDriverDefinition<BrevoEmailConfig> = {
  capability: "email",
  driver: "brevo",
  label: { bn: "Brevo", en: "Brevo" },
  configSchema: brevoEmailConfigSchema,
  secretFields: ["apiKey"],
  async testConnection(config) {
    try {
      const response = await fetch(`${config.baseUrl}/account`, { headers: { "api-key": config.apiKey } });
      if (!response.ok) return { ok: false, message: `Brevo returned HTTP ${response.status}` };
      const body = (await response.json().catch(() => ({}))) as { email?: string };
      return { ok: true, message: "Connected to Brevo.", details: { account: body.email } };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
