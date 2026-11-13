import { z } from "zod";
import { assertPublicHttpUrl } from "../ssrf-guard.ts";
import type { ProviderDriverDefinition, TelephonyCallUpdate, TelephonyDriver } from "../types.ts";

/**
 * Click-to-call (docs/PROJECT_SPEC.md §8.2, §16 M15 "telephony integration
 * (generic provider)"). BD cloud-PBX / call-centre services (and global ones
 * like Twilio-style "call bridge" APIs) all follow the same pattern: an HTTP
 * request asking the provider to ring the agent and connect them to the
 * customer, plus a status webhook. Like the generic SMS gateway, the request
 * and the webhook mapping are configured in admin — no code per provider.
 */

const STATUSES = ["initiated", "ringing", "answered", "completed", "no_answer", "busy", "failed"] as const;

export const genericTelephonyConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).default("POST"),
  bodyType: z.enum(["query", "json", "form"]).default("json"),
  /** Values may use `{agent}`, `{customer}`, `{reference}`, `{api_key}`, `{caller_id}`. */
  params: z.record(z.string(), z.string()).default({ from: "{agent}", to: "{customer}", reference: "{reference}", api_key: "{api_key}" }),
  apiKey: z.string().min(1),
  /** Header to put the API key in, e.g. "Authorization" with prefix "Bearer " — leave empty to send it only via params. */
  authHeader: z.string().default(""),
  authPrefix: z.string().default(""),
  callerId: z.string().default(""),
  /** Dot-path of the provider's call id in the start-call response, e.g. "data.call_id". */
  callIdPath: z.string().default("call_id"),
  /** Phone format the provider expects: "e164" (+8801…), "local" (01…), or "digits" (8801…). */
  numberFormat: z.enum(["e164", "local", "digits"]).default("local"),
  /** Optional shared secret the provider must send back in the webhook (`?secret=` or `X-Webhook-Secret`). */
  webhookSecret: z.string().optional(),
  /** Dot-paths into the status webhook payload. */
  webhook: z
    .object({
      idPath: z.string().default("call_id"),
      referencePath: z.string().default("reference"),
      statusPath: z.string().default("status"),
      durationPath: z.string().default("duration"),
      recordingPath: z.string().default("recording_url"),
      /** Provider status → our status; unknown values are ignored. */
      statusMap: z.record(z.string(), z.enum(STATUSES)).default({
        initiated: "initiated",
        ringing: "ringing",
        answered: "answered",
        completed: "completed",
        "no-answer": "no_answer",
        no_answer: "no_answer",
        busy: "busy",
        failed: "failed",
      }),
    })
    .default({
      idPath: "call_id",
      referencePath: "reference",
      statusPath: "status",
      durationPath: "duration",
      recordingPath: "recording_url",
      statusMap: { initiated: "initiated", ringing: "ringing", answered: "answered", completed: "completed", "no-answer": "no_answer", no_answer: "no_answer", busy: "busy", failed: "failed" },
    }),
});
export type GenericTelephonyConfig = z.infer<typeof genericTelephonyConfigSchema>;

export function readPath(body: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), body);
}

export function formatNumber(e164: string, format: GenericTelephonyConfig["numberFormat"]): string {
  const digits = e164.replace(/^\+/, "");
  if (format === "e164") return `+${digits}`;
  if (format === "digits") return digits;
  return digits.startsWith("880") ? `0${digits.slice(3)}` : digits;
}

export function buildTelephonyParams(config: GenericTelephonyConfig, vars: { agent: string; customer: string; reference: string }): Record<string, string> {
  const values: Record<string, string> = {
    agent: formatNumber(vars.agent, config.numberFormat),
    customer: formatNumber(vars.customer, config.numberFormat),
    reference: vars.reference,
    api_key: config.apiKey,
    caller_id: config.callerId,
  };
  const out: Record<string, string> = {};
  for (const [key, template] of Object.entries(config.params)) {
    out[key] = template.replace(/\{(agent|customer|reference|api_key|caller_id)\}/g, (match, name: string) => values[name] ?? match);
  }
  return out;
}

export function parseGenericTelephonyWebhook(config: GenericTelephonyConfig, payload: unknown): TelephonyCallUpdate | null {
  const raw = readPath(payload, config.webhook.statusPath);
  const status = typeof raw === "string" ? config.webhook.statusMap[raw.toLowerCase()] : undefined;
  if (!status) return null;
  const text = (path: string) => {
    const value = readPath(payload, path);
    return typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null;
  };
  const duration = Number(text(config.webhook.durationPath));
  return {
    externalId: text(config.webhook.idPath),
    reference: text(config.webhook.referencePath),
    status,
    durationSeconds: Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : null,
    recordingUrl: text(config.webhook.recordingPath),
  };
}

export function createGenericTelephonyDriver(config: GenericTelephonyConfig): TelephonyDriver {
  return {
    async startCall(request) {
      await assertPublicHttpUrl(config.url);
      const params = buildTelephonyParams(config, { agent: request.agentNumber, customer: request.customerNumber, reference: request.reference });
      const headers: Record<string, string> = {};
      if (config.authHeader) headers[config.authHeader] = `${config.authPrefix}${config.apiKey}`;
      let response: Response;
      if (config.bodyType === "query" || config.method === "GET") {
        const url = new URL(config.url);
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        response = await fetch(url.toString(), { method: config.method, headers, signal: AbortSignal.timeout(20_000) });
      } else if (config.bodyType === "json") {
        response = await fetch(config.url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(params), signal: AbortSignal.timeout(20_000) });
      } else {
        response = await fetch(config.url, { method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params), signal: AbortSignal.timeout(20_000) });
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`Telephony provider rejected the call (HTTP ${response.status}): ${JSON.stringify(body)?.slice(0, 300)}`);
      const id = readPath(body, config.callIdPath);
      return { externalId: typeof id === "string" || typeof id === "number" ? String(id) : null };
    },
    parseWebhook(payload) {
      return parseGenericTelephonyWebhook(config, payload);
    },
  };
}

export const genericTelephonyDriverDefinition: ProviderDriverDefinition<GenericTelephonyConfig> = {
  capability: "telephony",
  driver: "generic_http",
  label: { bn: "জেনেরিক HTTP টেলিফোনি (ক্লিক-টু-কল)", en: "Generic HTTP telephony (click-to-call)" },
  configSchema: genericTelephonyConfigSchema,
  secretFields: ["apiKey", "webhookSecret"],
  async testConnection() {
    return { ok: true, message: "Configuration looks valid. Place a test call from Support → Calls to verify." };
  },
};

export const mockTelephonyConfigSchema = z.object({
  simulate: z.enum(["success", "failure"]).default("success"),
});
export type MockTelephonyConfig = z.infer<typeof mockTelephonyConfigSchema>;

/** Mock: "places" the call and accepts `{ reference, status, duration? }` at the webhook to move it along. */
export function createMockTelephonyDriver(config: MockTelephonyConfig): TelephonyDriver {
  return {
    async startCall(request) {
      if (config.simulate === "failure") throw new Error("Mock telephony configured to simulate failure");
      return { externalId: `mock_call_${request.reference}` };
    },
    parseWebhook(payload) {
      const body = (payload ?? {}) as { reference?: unknown; status?: unknown; duration?: unknown };
      if (typeof body.status !== "string" || !(STATUSES as readonly string[]).includes(body.status)) return null;
      return {
        externalId: typeof body.reference === "string" ? `mock_call_${body.reference}` : null,
        reference: typeof body.reference === "string" ? body.reference : null,
        status: body.status as TelephonyCallUpdate["status"],
        durationSeconds: typeof body.duration === "number" ? body.duration : null,
        recordingUrl: null,
      };
    },
  };
}

export const mockTelephonyDriverDefinition: ProviderDriverDefinition<MockTelephonyConfig> = {
  capability: "telephony",
  driver: "mock",
  label: { bn: "মক (পরীক্ষার জন্য)", en: "Mock (for testing)" },
  configSchema: mockTelephonyConfigSchema,
  secretFields: [],
  async testConnection(config) {
    return config.simulate === "failure" ? { ok: false, message: "Mock driver is configured to simulate failure." } : { ok: true, message: "Mock driver is configured to simulate success." };
  },
};
