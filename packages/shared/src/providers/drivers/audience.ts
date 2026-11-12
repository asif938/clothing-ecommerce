import { createHash } from "node:crypto";
import { z } from "zod";
import type { AudienceDriver, AudienceMember, ProviderDriverDefinition } from "../types.ts";

/**
 * Audience sync drivers (docs/PROJECT_SPEC.md §8.2 Customers "audience sync
 * to Meta/Google (phase 2)", §16 M13): mock, Meta Custom Audiences and
 * Google Ads Customer Match. Identifiers are SHA-256 hashed here per each
 * platform's documented normalization (phone: digits with country code,
 * no "+"; email: trimmed lowercase). Both real drivers are written against
 * the platforms' public docs and have not been run against live accounts in
 * this environment (no credentials) — same caveat as M8's tracking drivers.
 * Uploads are add-only: members who leave a segment are not removed from
 * the platform audience (docs/DECISIONS.md).
 */

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizePhoneForAds(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export function normalizeEmailForAds(email: string): string {
  return email.trim().toLowerCase();
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// --- mock -------------------------------------------------------------------

export const mockAudienceConfigSchema = z.object({ simulate: z.enum(["success", "failure"]).default("success") });
export type MockAudienceConfig = z.infer<typeof mockAudienceConfigSchema>;

export function createMockAudienceDriver(config: MockAudienceConfig): AudienceDriver {
  return {
    async ensureAudience(name, existingId) {
      if (config.simulate === "failure") throw new Error("Mock audience driver configured to simulate failure");
      return existingId ?? `mock-audience-${sha256(name).slice(0, 12)}`;
    },
    async addMembers(_audienceId, members) {
      if (config.simulate === "failure") throw new Error("Mock audience driver configured to simulate failure");
      return { received: members.filter((m) => m.phone || m.email).length };
    },
  };
}

export const mockAudienceDriverDefinition: ProviderDriverDefinition<MockAudienceConfig> = {
  capability: "audience",
  driver: "mock",
  label: { bn: "মক (পরীক্ষার জন্য)", en: "Mock (for testing)" },
  configSchema: mockAudienceConfigSchema,
  secretFields: [],
  async testConnection(config) {
    return config.simulate === "failure" ? { ok: false, message: "Mock driver is configured to simulate failure." } : { ok: true, message: "Mock driver is configured to simulate success." };
  },
};

// --- Meta Custom Audiences ---------------------------------------------------

export const metaAudienceConfigSchema = z.object({
  adAccountId: z.string().min(1).transform((v) => v.replace(/^act_/, "")),
  accessToken: z.string().min(1),
  apiVersion: z.string().default("v21.0"),
  baseUrl: z.string().url().default("https://graph.facebook.com"),
});
export type MetaAudienceConfig = z.infer<typeof metaAudienceConfigSchema>;

async function metaCall<T>(config: MetaAudienceConfig, path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${config.baseUrl}/${config.apiVersion}/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${config.accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? `Meta API error (HTTP ${response.status})`);
  return json;
}

export function metaAudienceRows(members: AudienceMember[]): string[][] {
  return members
    .filter((m) => m.phone || m.email)
    .map((m) => [m.phone ? sha256(normalizePhoneForAds(m.phone)) : "", m.email ? sha256(normalizeEmailForAds(m.email)) : ""]);
}

export function createMetaAudienceDriver(config: MetaAudienceConfig): AudienceDriver {
  return {
    async ensureAudience(name, existingId) {
      if (existingId) return existingId;
      const created = await metaCall<{ id: string }>(config, `act_${config.adAccountId}/customaudiences`, { name, subtype: "CUSTOM", customer_file_source: "USER_PROVIDED_ONLY", description: "Synced from the store's customer segments" });
      return created.id;
    },
    async addMembers(audienceId, members) {
      let received = 0;
      // Meta accepts up to 10,000 rows per request.
      for (const batch of chunk(metaAudienceRows(members), 10_000)) {
        const result = await metaCall<{ num_received?: number }>(config, `${audienceId}/users`, { payload: { schema: ["PHONE", "EMAIL"], data: batch } });
        received += result.num_received ?? batch.length;
      }
      return { received };
    },
  };
}

export const metaAudienceDriverDefinition: ProviderDriverDefinition<MetaAudienceConfig> = {
  capability: "audience",
  driver: "meta_custom_audience",
  label: { bn: "Meta কাস্টম অডিয়েন্স", en: "Meta Custom Audiences" },
  configSchema: metaAudienceConfigSchema,
  secretFields: ["accessToken"],
  async testConnection(config) {
    try {
      const account = await metaCall<{ id?: string; name?: string }>(config, `act_${config.adAccountId}?fields=id,name`);
      return { ok: true, message: `Connected to ad account ${account.name ?? account.id ?? config.adAccountId}.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};

// --- Google Ads Customer Match ----------------------------------------------

export const googleAudienceConfigSchema = z.object({
  developerToken: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  refreshToken: z.string().min(1),
  /** Ads customer id, digits only (dashes are stripped). */
  customerId: z.string().min(1).transform((v) => v.replace(/-/g, "")),
  /** Manager (MCC) account id when access goes through one. */
  loginCustomerId: z.string().optional().transform((v) => v?.replace(/-/g, "") || undefined),
  apiVersion: z.string().default("v22"),
  baseUrl: z.string().url().default("https://googleads.googleapis.com"),
  membershipLifeSpanDays: z.number().int().min(1).max(10_000).default(540),
});
export type GoogleAudienceConfig = z.input<typeof googleAudienceConfigSchema>;
type GoogleAudienceParsed = z.output<typeof googleAudienceConfigSchema>;

async function googleAccessToken(config: GoogleAudienceParsed): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken, grant_type: "refresh_token" }).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description ?? `Google OAuth failed (HTTP ${response.status})`);
  return body.access_token;
}

async function googleCall<T>(config: GoogleAudienceParsed, token: string, path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${config.baseUrl}/${config.apiVersion}/customers/${config.customerId}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "developer-token": config.developerToken,
      "Content-Type": "application/json",
      ...(config.loginCustomerId ? { "login-customer-id": config.loginCustomerId } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? `Google Ads API error (HTTP ${response.status})`);
  return json;
}

export function googleUserIdentifiers(member: AudienceMember): Record<string, string>[] {
  const ids: Record<string, string>[] = [];
  if (member.phone) ids.push({ hashedPhoneNumber: sha256(`+${normalizePhoneForAds(member.phone)}`) });
  if (member.email) ids.push({ hashedEmail: sha256(normalizeEmailForAds(member.email)) });
  return ids;
}

export function createGoogleAudienceDriver(raw: GoogleAudienceConfig): AudienceDriver {
  const config = googleAudienceConfigSchema.parse(raw);
  return {
    async ensureAudience(name, existingId) {
      if (existingId) return existingId;
      const token = await googleAccessToken(config);
      const result = await googleCall<{ results?: { resourceName?: string }[] }>(config, token, "/userLists:mutate", {
        operations: [{ create: { name, description: "Synced from the store's customer segments", membershipLifeSpan: config.membershipLifeSpanDays, crmBasedUserList: { uploadKeyType: "CONTACT_INFO" } } }],
      });
      const resourceName = result.results?.[0]?.resourceName;
      if (!resourceName) throw new Error("Google Ads did not return the new user list");
      return resourceName;
    },
    async addMembers(audienceId, members) {
      const operations = members.map(googleUserIdentifiers).filter((ids) => ids.length > 0);
      if (operations.length === 0) return { received: 0 };
      const token = await googleAccessToken(config);
      const job = await googleCall<{ resourceName?: string }>(config, token, "/offlineUserDataJobs:create", {
        job: { type: "CUSTOMER_MATCH_USER_LIST", customerMatchUserListMetadata: { userList: audienceId } },
      });
      if (!job.resourceName) throw new Error("Google Ads did not return an offline user data job");
      const jobPath = `/${job.resourceName.split("/").slice(2).join("/")}`;
      for (const batch of chunk(operations, 10_000)) {
        await googleCall(config, token, `${jobPath}:addOperations`, { enablePartialFailure: true, operations: batch.map((userIdentifiers) => ({ create: { userIdentifiers } })) });
      }
      await googleCall(config, token, `${jobPath}:run`, {});
      return { received: operations.length };
    },
  };
}

export const googleAudienceDriverDefinition: ProviderDriverDefinition<GoogleAudienceConfig> = {
  capability: "audience",
  driver: "google_customer_match",
  label: { bn: "Google Ads কাস্টমার ম্যাচ", en: "Google Ads Customer Match" },
  configSchema: googleAudienceConfigSchema as unknown as z.ZodType<GoogleAudienceConfig>,
  secretFields: ["developerToken", "clientSecret", "refreshToken"],
  async testConnection(raw) {
    try {
      const config = googleAudienceConfigSchema.parse(raw);
      await googleAccessToken(config);
      return { ok: true, message: "Google OAuth credentials work. The Ads account is checked on the first sync." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
