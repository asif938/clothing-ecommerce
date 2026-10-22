import { createHash } from "node:crypto";
import { z } from "zod";
import type { ProviderDriverDefinition, ProviderTestResult, ProviderUsageResult } from "../types.ts";

/**
 * Cloudinary driver (docs/PROJECT_SPEC.md §4.3, change request 2026-10-22):
 * an optional alternative to the default S3/R2 storage for the media
 * library. On-the-fly image transforms instead of pre-generated sizes —
 * see packages/shared/src/media/url.ts and apps/api's media module.
 *
 * Talks to Cloudinary's plain REST API with `fetch` + a hand-rolled
 * signature (sha1 of the sorted param string + the API secret, exactly as
 * Cloudinary's own SDKs do it) rather than pulling in the official `cloudinary`
 * SDK — it's a thin, well-understood protocol and this keeps the dependency
 * footprint the same as the existing S3 driver (golden rule 9 integration
 * boundary). `config.mock` is the required mock mode (docs/PROJECT_SPEC.md
 * "every integration has a mock driver"): dev/tests exercise the full
 * provider-framework + Integrations UI + direct-upload flow with no real
 * Cloudinary account.
 */
export const cloudinaryConfigSchema = z.object({
  cloudName: z.string().min(1),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  folderPrefix: z.string().default(""),
  deliveryDomain: z.string().url().nullable().default(null),
  mock: z.boolean().default(false),
});
export type CloudinaryConfig = z.infer<typeof cloudinaryConfigSchema>;

export type CloudinaryResourceType = "image" | "video" | "raw";

function sign(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

export interface CloudinaryUploadResult {
  publicId: string;
  version: number;
  width: number | null;
  height: number | null;
  bytes: number;
  format: string;
  resourceType: string;
}

export async function cloudinaryUpload(
  config: CloudinaryConfig,
  input: { buffer: Buffer; resourceType: CloudinaryResourceType; publicId: string; folder: string },
): Promise<CloudinaryUploadResult> {
  if (config.mock) {
    return {
      publicId: input.publicId,
      version: Math.floor(Date.now() / 1000),
      width: input.resourceType === "image" ? 800 : null,
      height: input.resourceType === "image" ? 600 : null,
      bytes: input.buffer.length,
      format: input.resourceType === "image" ? "webp" : input.resourceType,
      resourceType: input.resourceType,
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign({ folder: input.folder, public_id: input.publicId, timestamp }, config.apiSecret);

  const form = new FormData();
  form.append("file", new Blob([input.buffer]), input.publicId);
  form.append("api_key", config.apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", input.folder);
  form.append("public_id", input.publicId);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/${input.resourceType}/upload`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(`Cloudinary upload failed (${response.status}): ${await response.text()}`);
  const json = await readJson(response);
  return {
    publicId: json.public_id as string,
    version: json.version as number,
    width: (json.width as number | undefined) ?? null,
    height: (json.height as number | undefined) ?? null,
    bytes: json.bytes as number,
    format: json.format as string,
    resourceType: json.resource_type as string,
  };
}

export async function cloudinaryDestroy(
  config: CloudinaryConfig,
  publicId: string,
  resourceType: CloudinaryResourceType,
): Promise<void> {
  if (config.mock) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign({ public_id: publicId, timestamp }, config.apiSecret);

  const form = new FormData();
  form.append("public_id", publicId);
  form.append("api_key", config.apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/destroy`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(`Cloudinary destroy failed (${response.status}): ${await response.text()}`);
}

export async function cloudinaryUsage(config: CloudinaryConfig): Promise<ProviderUsageResult> {
  if (config.mock) return { usedPercent: 0, details: { mock: true } };

  const auth = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/usage`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) throw new Error(`Cloudinary usage check failed (${response.status}): ${await response.text()}`);
  const json = await readJson(response);
  const credits = (json.credits as { usage?: number; limit?: number; used_percent?: number } | undefined) ?? {};
  return {
    usedPercent: credits.used_percent ?? 0,
    details: { creditsUsed: credits.usage ?? null, creditsLimit: credits.limit ?? null },
  };
}

export interface CloudinaryDirectUploadTicket {
  url: string;
  fields: Record<string, string>;
}

export function cloudinaryDirectUploadTicket(
  config: CloudinaryConfig,
  input: { publicId: string; folder: string; resourceType: CloudinaryResourceType },
): CloudinaryDirectUploadTicket {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = config.mock ? "mock-signature" : sign({ folder: input.folder, public_id: input.publicId, timestamp }, config.apiSecret);
  return {
    url: `https://api.cloudinary.com/v1_1/${config.cloudName}/${input.resourceType}/upload`,
    fields: {
      api_key: config.apiKey,
      timestamp: String(timestamp),
      signature,
      folder: input.folder,
      public_id: input.publicId,
    },
  };
}

export const cloudinaryStorageDriverDefinition: ProviderDriverDefinition<CloudinaryConfig> = {
  capability: "storage",
  driver: "cloudinary",
  label: { bn: "ক্লাউডিনারি", en: "Cloudinary" },
  configSchema: cloudinaryConfigSchema,
  secretFields: ["apiSecret"],
  async testConnection(config): Promise<ProviderTestResult> {
    try {
      const usage = await cloudinaryUsage(config);
      return {
        ok: true,
        message: config.mock ? "Mock mode — no network call made." : `Connected. Credit usage: ${usage.usedPercent.toFixed(1)}%.`,
        details: { usedPercent: usage.usedPercent },
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
  async usage(config): Promise<ProviderUsageResult> {
    return await cloudinaryUsage(config);
  },
};
