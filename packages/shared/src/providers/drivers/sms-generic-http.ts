import { z } from "zod";
import type { ProviderDriverDefinition, SmsDriver } from "../types.ts";

/**
 * "Any BD SMS gateway without code" driver (docs/PROJECT_SPEC.md §10.3): the
 * admin defines the request shape (URL, method, query/JSON/form body) as a
 * template with `{to}`, `{message}`, `{api_key}`, `{sender_id}` placeholders
 * and a success-detection rule — golden rule 2's escape hatch for the many
 * smaller BD gateways that will never get a named driver. The two named
 * gateways below (SSL Wireless, BulkSMSBD) are just pre-filled, tested
 * special cases of exactly this shape.
 */
export const genericHttpSmsConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).default("GET"),
  bodyType: z.enum(["query", "json", "form"]).default("query"),
  /** Each value may reference `{to}`, `{message}`, `{api_key}`, `{sender_id}` — substituted at send time. */
  params: z.record(z.string(), z.string()).default({ to: "{to}", message: "{message}", api_key: "{api_key}", sender_id: "{sender_id}" }),
  apiKey: z.string().min(1),
  senderId: z.string().optional(),
  /** A response is a success when `body[successField]` (dot-path, e.g. "status" or "data.status") stringifies to `successValue`. */
  successField: z.string().default("status"),
  successValue: z.string().default("success"),
});
export type GenericHttpSmsConfig = z.infer<typeof genericHttpSmsConfigSchema>;

function renderTemplateValue(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(to|message|api_key|sender_id)\}/g, (match, key: string) => vars[key] ?? match);
}

function buildParams(config: GenericHttpSmsConfig, to: string, text: string): Record<string, string> {
  const vars: Record<string, string> = { to, message: text, api_key: config.apiKey, sender_id: config.senderId ?? "" };
  const result: Record<string, string> = {};
  for (const [key, template] of Object.entries(config.params)) {
    result[key] = renderTemplateValue(template, vars);
  }
  return result;
}

function readPath(body: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), body);
}

export async function genericHttpSmsRequest(config: GenericHttpSmsConfig, to: string, text: string): Promise<{ ok: boolean; body: unknown; status: number }> {
  const params = buildParams(config, to, text);
  let response: Response;
  if (config.bodyType === "query") {
    const url = new URL(config.url);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    response = await fetch(url.toString(), { method: config.method });
  } else if (config.bodyType === "json") {
    response = await fetch(config.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
  } else {
    response = await fetch(config.url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  }
  const body = await response.json().catch(() => null);
  return { ok: response.ok, body, status: response.status };
}

export function createGenericHttpSmsDriver(config: GenericHttpSmsConfig): SmsDriver {
  return {
    async send(to, text) {
      const { ok, body, status } = await genericHttpSmsRequest(config, to, text);
      const success = ok && String(readPath(body, config.successField)) === config.successValue;
      if (!success) {
        throw new Error(`Generic HTTP SMS gateway did not report success (HTTP ${status}): ${JSON.stringify(body)}`);
      }
    },
  };
}

export const genericHttpSmsDriverDefinition: ProviderDriverDefinition<GenericHttpSmsConfig> = {
  capability: "sms",
  driver: "generic_http",
  label: { bn: "জেনেরিক HTTP SMS গেটওয়ে", en: "Generic HTTP SMS gateway" },
  configSchema: genericHttpSmsConfigSchema,
  secretFields: ["apiKey"],
  async testConnection() {
    return { ok: true, message: "Configuration looks valid. Generic HTTP gateways have no standard health-check endpoint — use \"Send test message\" on the Notifications screen to verify delivery." };
  },
};
