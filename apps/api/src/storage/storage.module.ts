import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createLocalStorageDriver, createS3StorageDriver, type StorageDriver } from "@clothing/shared/providers";
import type { Env } from "../config/env.schema";

export const STORAGE_DRIVER = Symbol("STORAGE_DRIVER");
export const STORAGE_DRIVER_NAME = Symbol("STORAGE_DRIVER_NAME");

/**
 * Storage is configured entirely from environment variables, not
 * `provider_instances` — docs/PROJECT_SPEC.md §4.1 explicitly names "storage
 * bucket credentials" as infra-only, and the driver choice (local/s3) has to
 * be known at boot before any DB-backed config could be read. See
 * docs/DECISIONS.md. Still a provider behind the shared `StorageDriver`
 * interface (golden rule 2) — only its *configuration source* differs from
 * the merchant-configurable providers (payment, courier, sms, …).
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): StorageDriver => {
        const driver = config.get("STORAGE_DRIVER", { infer: true });
        if (driver === "s3") {
          return createS3StorageDriver({
            endpoint: config.get("S3_ENDPOINT", { infer: true }) ?? null,
            region: config.get("S3_REGION", { infer: true }) ?? "auto",
            bucket: config.getOrThrow("S3_BUCKET", { infer: true }),
            accessKeyId: config.getOrThrow("S3_ACCESS_KEY_ID", { infer: true }),
            secretAccessKey: config.getOrThrow("S3_SECRET_ACCESS_KEY", { infer: true }),
            forcePathStyle: true,
            publicBaseUrl: config.getOrThrow("S3_PUBLIC_URL", { infer: true }),
          });
        }
        return createLocalStorageDriver({
          rootDir: config.get("STORAGE_LOCAL_ROOT", { infer: true }) ?? "./.data/media",
          publicBaseUrl: `${config.getOrThrow("API_URL", { infer: true })}/media`,
        });
      },
    },
    {
      provide: STORAGE_DRIVER_NAME,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): string => config.get("STORAGE_DRIVER", { infer: true }),
    },
  ],
  exports: [STORAGE_DRIVER, STORAGE_DRIVER_NAME],
})
export class StorageModule {}
