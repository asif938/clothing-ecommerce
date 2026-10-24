import { z } from "zod";
import type { CaptchaDriver, ProviderDriverDefinition } from "../types.ts";

/** Cloudflare Turnstile (docs/PROJECT_SPEC.md §10.6) — invisible on checkout/OTP/review/contact. `siteKey` is public (the storefront widget needs it); `secretKey` stays server-side. */
export const turnstileConfigSchema = z.object({
  siteKey: z.string().min(1),
  secretKey: z.string().min(1),
});
export type TurnstileConfig = z.infer<typeof turnstileConfigSchema>;

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function createTurnstileDriver(config: TurnstileConfig): CaptchaDriver {
  return {
    async verify(token, remoteIp) {
      const body = new URLSearchParams({ secret: config.secretKey, response: token });
      if (remoteIp) body.set("remoteip", remoteIp);
      const response = await fetch(VERIFY_URL, { method: "POST", body });
      const data = (await response.json()) as { success: boolean; "error-codes"?: string[] };
      return { success: data.success, reason: data["error-codes"]?.join(", ") };
    },
  };
}

export const turnstileDriverDefinition: ProviderDriverDefinition<TurnstileConfig> = {
  capability: "captcha",
  driver: "turnstile",
  label: { bn: "ক্লাউডফ্লেয়ার টার্নস্টাইল", en: "Cloudflare Turnstile" },
  configSchema: turnstileConfigSchema,
  secretFields: ["secretKey"],
  async testConnection(config) {
    try {
      const body = new URLSearchParams({ secret: config.secretKey, response: "test-token-will-fail" });
      const response = await fetch(VERIFY_URL, { method: "POST", body });
      const data = (await response.json()) as { "error-codes"?: string[] };
      const onlyTokenError = (data["error-codes"] ?? []).every((code) => code === "invalid-input-response" || code === "timeout-or-duplicate");
      return { ok: onlyTokenError, message: onlyTokenError ? "Secret key accepted by Turnstile (test token correctly rejected)." : `Turnstile rejected the secret key: ${data["error-codes"]?.join(", ")}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Could not reach Turnstile." };
    }
  },
};
