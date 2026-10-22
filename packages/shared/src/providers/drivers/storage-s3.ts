import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import type { ProviderDriverDefinition, StorageDriver } from "../types.ts";

/**
 * S3-compatible storage driver (docs/PROJECT_SPEC.md §4.3) — works against
 * AWS S3, Cloudflare R2, MinIO, or any S3-API-compatible endpoint by
 * pointing `endpoint` at it. `publicBaseUrl` is the CDN/bucket public URL
 * (or the API's proxy URL, if the bucket is private).
 */
export const s3StorageConfigSchema = z.object({
  endpoint: z.string().url().nullable().default(null),
  region: z.string().default("auto"),
  bucket: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  forcePathStyle: z.boolean().default(true),
  publicBaseUrl: z.string().url(),
});
export type S3StorageConfig = z.infer<typeof s3StorageConfigSchema>;

function createClient(config: S3StorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint ?? undefined,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function createS3StorageDriver(config: S3StorageConfig): StorageDriver {
  const client = createClient(config);

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async get(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) throw new Error(`Object "${key}" has no body`);
      return bytes;
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
    async signedUrl(key, expiresInSeconds) {
      const command = new GetObjectCommand({ Bucket: config.bucket, Key: key });
      return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },
    publicUrl(key) {
      return `${config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    },
    async signedPutUrl(key, contentType, expiresInSeconds) {
      const command = new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType });
      return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },
  };
}

export const s3StorageDriverDefinition: ProviderDriverDefinition<S3StorageConfig> = {
  capability: "storage",
  driver: "s3",
  label: { bn: "S3 / R2 / MinIO", en: "S3 / R2 / MinIO" },
  configSchema: s3StorageConfigSchema,
  secretFields: ["secretAccessKey"],
  async testConnection(config) {
    try {
      const driver = createS3StorageDriver(config);
      const probeKey = `.provider-test/${Date.now()}.txt`;
      await driver.put(probeKey, new TextEncoder().encode("ok"), "text/plain");
      await driver.get(probeKey);
      await driver.delete(probeKey);
      return { ok: true, message: "Put/get/delete against the bucket succeeded." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
