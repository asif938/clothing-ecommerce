import { z } from "zod";
import type { EmailDriver, ProviderDriverDefinition } from "../types.ts";

/**
 * Resend transactional email (docs/PROJECT_SPEC.md §10.3). Implemented
 * against Resend's documented `POST /emails` endpoint (`Authorization:
 * Bearer`, `from`/`to`/`subject`/`html` body) — not verified against a live
 * Resend account in this environment (no merchant credentials exist yet,
 * same caveat as every other real driver since M5).
 */
export const resendEmailConfigSchema = z.object({
  apiKey: z.string().min(1),
  fromAddress: z.string().email(),
  fromName: z.string().min(1),
  baseUrl: z.string().url().default("https://api.resend.com"),
});
export type ResendEmailConfig = z.infer<typeof resendEmailConfigSchema>;

export function createResendEmailDriver(config: ResendEmailConfig): EmailDriver {
  return {
    async send(message) {
      const response = await fetch(`${config.baseUrl}/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${config.fromName} <${config.fromAddress}>`,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Resend send failed (HTTP ${response.status})`);
      }
    },
  };
}

export const resendEmailDriverDefinition: ProviderDriverDefinition<ResendEmailConfig> = {
  capability: "email",
  driver: "resend",
  label: { bn: "Resend", en: "Resend" },
  configSchema: resendEmailConfigSchema,
  secretFields: ["apiKey"],
  async testConnection(config) {
    try {
      const response = await fetch(`${config.baseUrl}/domains`, { headers: { Authorization: `Bearer ${config.apiKey}` } });
      if (!response.ok) return { ok: false, message: `Resend returned HTTP ${response.status}` };
      return { ok: true, message: "Connected to Resend." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
