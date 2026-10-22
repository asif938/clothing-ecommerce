import sharp from "sharp";
import type { StorageDriver } from "@clothing/shared/providers";
import { cloudinaryDestroy, cloudinaryDirectUploadTicket, cloudinaryUpload, type CloudinaryConfig } from "@clothing/shared/providers";
import { getMediaUrl, type MediaRef } from "@clothing/shared/media";
import type { MediaKind } from "@clothing/db";

export const IMAGE_VARIANT_WIDTHS = { thumb: 200, md: 800, lg: 1600 } as const;
export type VariantName = keyof typeof IMAGE_VARIANT_WIDTHS;
export type MediaVariantMap = Record<string, { key: string; width: number; height: number }>;

export function kindFromMimeType(mimeType: string): MediaKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("font/") || mimeType.includes("font")) return "font";
  return "document";
}

/** Cloudinary's own resource_type vocabulary — distinct from our `MediaKind` enum. */
export function toCloudinaryResourceType(kind: MediaKind): "image" | "video" | "raw" {
  if (kind === "image") return "image";
  if (kind === "video") return "video";
  return "raw";
}

export interface MediaDriverUploadInput {
  buffer: Buffer;
  mimeType: string;
  mediaId: string;
  kind: MediaKind;
}

export interface MediaDriverUploadOutput {
  storageKey: string;
  externalId: string | null;
  version: number | null;
  width: number | null;
  height: number | null;
  variants: MediaVariantMap | null;
  blurDataUrl: string | null;
}

export interface MediaAssetRef {
  storageKey: string;
  externalId: string | null;
  resourceType: string;
  variants: MediaVariantMap | null;
}

export interface DirectUploadTicket {
  supported: boolean;
  method?: "PUT" | "POST";
  url?: string;
  fields?: Record<string, string>;
  headers?: Record<string, string>;
  storageKey: string;
  externalId: string | null;
}

export interface DirectUploadFinalizeInput {
  storageKey: string;
  externalId: string | null;
  mimeType: string;
  kind: MediaKind;
  /** Reported by the provider's own direct-upload response (cloudinary) — avoids re-fetching the full file. */
  reportedWidth?: number | null;
  reportedHeight?: number | null;
  reportedVersion?: number | null;
}

export interface DirectUploadFinalizeResult {
  width: number | null;
  height: number | null;
  variants: MediaVariantMap | null;
  blurDataUrl: string | null;
  version: number | null;
  sizeBytes: number | null;
}

export interface MediaRefInput {
  storageKey: string;
  externalId: string | null;
  resourceType: string;
  version: number | null;
  variants: MediaVariantMap | null;
  focalX: number | null;
  focalY: number | null;
}

export interface MediaDriver {
  readonly kind: "local" | "s3" | "cloudinary";
  readonly providerInstanceId: string | null;
  upload(input: MediaDriverUploadInput): Promise<MediaDriverUploadOutput>;
  delete(asset: MediaAssetRef): Promise<void>;
  /** `tempId` namespaces the storage key before any DB row exists — MediaService creates the real `Media` row only at finalize. */
  createDirectUploadTicket(input: { mimeType: string; kind: MediaKind; tempId: string }): Promise<DirectUploadTicket>;
  finalizeDirectUpload(input: DirectUploadFinalizeInput): Promise<DirectUploadFinalizeResult>;
  toMediaRef(input: MediaRefInput): MediaRef;
  /** Only the migration job needs this — fetches an asset's original bytes from wherever it currently lives. */
  downloadOriginal(asset: MediaAssetRef): Promise<Buffer>;
}

async function buildImageVariants(buffer: Buffer, mediaId: string, put: (key: string, bytes: Buffer, contentType: string) => Promise<void>) {
  const image = sharp(buffer, { failOn: "none" });
  const metadata = await image.metadata();
  const variants: MediaVariantMap = {};
  for (const [name, targetWidth] of Object.entries(IMAGE_VARIANT_WIDTHS) as [VariantName, number][]) {
    const resized = await sharp(buffer, { failOn: "none" })
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const key = `media/${mediaId}/${name}.webp`;
    await put(key, resized.data, "image/webp");
    variants[name] = { key, width: resized.info.width, height: resized.info.height };
  }
  const blurBuffer = await sharp(buffer, { failOn: "none" }).resize({ width: 16, withoutEnlargement: true }).webp({ quality: 40 }).toBuffer();
  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    variants,
    blurDataUrl: `data:image/webp;base64,${blurBuffer.toString("base64")}`,
  };
}

/**
 * The free-tier default: wraps the existing byte-level `StorageDriver`
 * (local disk or S3/R2, docs/DECISIONS.md — configured from env, not
 * `provider_instances`) with sharp pre-generated sizes, unchanged from
 * Milestone 1. Direct browser uploads are only supported when the
 * underlying driver exposes `signedPutUrl` (s3) — local has no such concept
 * and falls back to the existing server-side multipart path.
 */
export function createEnvMediaDriver(storage: StorageDriver, driverKind: "local" | "s3"): MediaDriver {
  return {
    kind: driverKind,
    providerInstanceId: null,

    async upload({ buffer, mimeType, mediaId, kind }) {
      const originalKey = `media/${mediaId}/original`;
      await storage.put(originalKey, buffer, mimeType);

      if (kind !== "image") {
        return { storageKey: originalKey, externalId: null, version: null, width: null, height: null, variants: null, blurDataUrl: null };
      }
      const { width, height, variants, blurDataUrl } = await buildImageVariants(buffer, mediaId, (key, bytes, contentType) => storage.put(key, bytes, contentType));
      return { storageKey: originalKey, externalId: null, version: null, width, height, variants, blurDataUrl };
    },

    async delete(asset) {
      await storage.delete(asset.storageKey);
      if (asset.variants) {
        await Promise.all(Object.values(asset.variants).map((variant) => storage.delete(variant.key)));
      }
    },

    async createDirectUploadTicket({ mimeType, tempId }) {
      if (!storage.signedPutUrl) {
        return { supported: false, storageKey: "", externalId: null };
      }
      const storageKey = `media/${tempId}/original`;
      const url = await storage.signedPutUrl(storageKey, mimeType, 900);
      return { supported: true, method: "PUT", url, headers: { "Content-Type": mimeType }, storageKey, externalId: null };
    },

    async finalizeDirectUpload({ storageKey, kind }) {
      const buffer = Buffer.from(await storage.get(storageKey));
      if (kind !== "image") {
        return { width: null, height: null, variants: null, blurDataUrl: null, version: null, sizeBytes: buffer.length };
      }
      const { width, height, variants, blurDataUrl } = await buildImageVariants(buffer, storageKey.split("/")[1] ?? storageKey, (key, bytes, contentType) =>
        storage.put(key, bytes, contentType),
      );
      return { width, height, variants, blurDataUrl, version: null, sizeBytes: buffer.length };
    },

    toMediaRef({ storageKey, resourceType, variants, focalX, focalY }) {
      const ref: MediaRef = {
        provider: driverKind,
        resourceType: resourceType as MediaRef["resourceType"],
        url: storage.publicUrl(storageKey),
        variants: variants
          ? Object.fromEntries(Object.entries(variants).map(([name, v]) => [name, { url: storage.publicUrl(v.key), width: v.width, height: v.height }]))
          : null,
        focalX,
        focalY,
      };
      return ref;
    },

    async downloadOriginal(asset) {
      return Buffer.from(await storage.get(asset.storageKey));
    },
  };
}

/**
 * Cloudinary: upload the original only (no pre-generated sizes — sized on
 * the fly via URL transforms, see packages/shared/src/media/url.ts). Blur
 * placeholders are still generated cheaply: from the in-memory buffer via
 * sharp on the server-side upload path, or from a tiny already-transformed
 * Cloudinary delivery URL (no local processing, no extra transformation
 * credits) on the direct-upload finalize path.
 */
export function createCloudinaryMediaDriver(config: CloudinaryConfig, instanceId: string): MediaDriver {
  const folder = config.folderPrefix ? config.folderPrefix.replace(/\/+$/, "") : "media";

  return {
    kind: "cloudinary",
    providerInstanceId: instanceId,

    async upload({ buffer, mediaId, kind }) {
      const resourceType = toCloudinaryResourceType(kind);
      const publicId = mediaId;
      const result = await cloudinaryUpload(config, { buffer, resourceType, publicId, folder });

      let blurDataUrl: string | null = null;
      if (kind === "image") {
        blurDataUrl = `data:image/webp;base64,${(await sharp(buffer, { failOn: "none" }).resize({ width: 16, withoutEnlargement: true }).webp({ quality: 40 }).toBuffer()).toString("base64")}`;
      }

      return {
        storageKey: `${folder}/${result.publicId}`,
        externalId: result.publicId,
        version: result.version,
        width: result.width,
        height: result.height,
        variants: null,
        blurDataUrl,
      };
    },

    async delete(asset) {
      if (!asset.externalId) return;
      await cloudinaryDestroy(config, asset.externalId, asset.resourceType as "image" | "video" | "raw");
    },

    async createDirectUploadTicket({ kind, tempId }) {
      const resourceType = toCloudinaryResourceType(kind);
      const ticket = cloudinaryDirectUploadTicket(config, { publicId: tempId, folder, resourceType });
      return {
        supported: true,
        method: "POST",
        url: ticket.url,
        fields: ticket.fields,
        storageKey: `${folder}/${tempId}`,
        externalId: tempId,
      };
    },

    async finalizeDirectUpload({ externalId, kind, reportedWidth, reportedHeight, reportedVersion }) {
      let blurDataUrl: string | null = null;
      if (kind === "image" && externalId) {
        try {
          const host = config.deliveryDomain ? config.deliveryDomain.replace(/\/+$/, "") : `res.cloudinary.com/${config.cloudName}`;
          const response = await fetch(`https://${host}/image/upload/f_webp,q_40,w_16/${externalId}`);
          if (response.ok) {
            const bytes = Buffer.from(await response.arrayBuffer());
            blurDataUrl = `data:image/webp;base64,${bytes.toString("base64")}`;
          }
        } catch {
          // Blur placeholder is a nice-to-have — a failed fetch must not fail the upload.
        }
      }
      return {
        width: reportedWidth ?? null,
        height: reportedHeight ?? null,
        variants: null,
        blurDataUrl,
        version: reportedVersion ?? null,
        sizeBytes: null,
      };
    },

    toMediaRef({ resourceType, externalId, version, focalX, focalY }) {
      const ref: MediaRef = {
        provider: "cloudinary",
        resourceType: resourceType as MediaRef["resourceType"],
        url: "",
        variants: null,
        cloudName: config.cloudName,
        publicId: externalId,
        version,
        deliveryDomain: config.deliveryDomain,
        focalX,
        focalY,
      };
      ref.url = getMediaUrl(ref);
      return ref;
    },

    async downloadOriginal(asset) {
      if (!asset.externalId) throw new Error("Cloudinary asset has no externalId to download");
      const segment = asset.resourceType === "video" ? "video" : asset.resourceType === "image" ? "image" : "raw";
      const host = config.deliveryDomain ? config.deliveryDomain.replace(/\/+$/, "") : `res.cloudinary.com/${config.cloudName}`;
      const response = await fetch(`https://${host}/${segment}/upload/${asset.externalId}`);
      if (!response.ok) throw new Error(`Failed to download cloudinary asset "${asset.externalId}" (${response.status})`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
