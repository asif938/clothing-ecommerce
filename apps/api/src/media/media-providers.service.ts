import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { cloudinaryConfigSchema } from "@clothing/shared/providers";
import type { StorageDriver } from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { ProviderRegistryService } from "../providers/provider-registry.service";
import { SchedulerService } from "../queue/scheduler.service";
import { STORAGE_DRIVER, STORAGE_DRIVER_NAME } from "../storage/storage.module";
import { createCloudinaryMediaDriver, createEnvMediaDriver, type MediaAssetRef, type MediaDriver } from "./media-driver";

const DELETE_RETRY_TASK_TYPE = "media.remote_delete_retry";
const PROVIDER_LIMIT_FALLBACK_THRESHOLD = 95;

/**
 * Resolves *which* `MediaDriver` backs a given operation. Two distinct
 * questions (docs/PROJECT_SPEC.md change request 2026-10-22):
 *  - `resolveActiveDriver()`: where should a brand-new upload go? Reads
 *    `media.defaultProvider` ("env" or a provider_instances.id), with an
 *    automatic fallback to "env" when the configured provider is near its
 *    quota (`media.fallbackToEnvOnProviderLimit`).
 *  - `resolveDriverForAsset()`: where does an *existing* asset already
 *    live? Always resolved from the row's own stored fields, never from the
 *    current default — switching providers must never strand old assets.
 */
@Injectable()
export class MediaProvidersService implements OnModuleInit {
  private readonly logger = new Logger(MediaProvidersService.name);

  constructor(
    @Inject(STORAGE_DRIVER) private readonly envStorage: StorageDriver,
    @Inject(STORAGE_DRIVER_NAME) private readonly envStorageName: string,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly registry: ProviderRegistryService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerHandler(DELETE_RETRY_TASK_TYPE, async (payload) => {
      const asset = payload as MediaAssetRef & { providerInstanceId: string | null; storageDriver: string };
      const driver = await this.driverForStoredAsset(asset.storageDriver, asset.providerInstanceId);
      await driver.delete(asset);
    });
  }

  envDriver(): MediaDriver {
    return createEnvMediaDriver(this.envStorage, this.envStorageName as "local" | "s3");
  }

  /** Raw byte access to the env-configured driver — used only by the local-file-serving route, which never needs a Cloudinary/S3 asset (those are served from their own public URL). */
  getEnvBytes(storageKey: string): Promise<Uint8Array> {
    return this.envStorage.get(storageKey);
  }

  private async cloudinaryDriverFor(instanceId: string): Promise<MediaDriver> {
    const instance = await this.prisma.providerInstance.findUniqueOrThrow({ where: { id: instanceId } });
    const config = cloudinaryConfigSchema.parse(this.registry.decryptConfig(instance.config));
    return createCloudinaryMediaDriver(config, instanceId);
  }

  private async driverForStoredAsset(storageDriver: string, providerInstanceId: string | null): Promise<MediaDriver> {
    if (providerInstanceId) return await this.cloudinaryDriverFor(providerInstanceId);
    return createEnvMediaDriver(this.envStorage, storageDriver as "local" | "s3");
  }

  resolveDriverForAsset(media: { storageDriver: string; providerInstanceId: string | null }): Promise<MediaDriver> {
    return this.driverForStoredAsset(media.storageDriver, media.providerInstanceId);
  }

  /** "env" or a `provider_instances.id` — used by the migration job to resolve an explicit target, independent of the current default setting. */
  driverForProvider(toProvider: string): Promise<MediaDriver> {
    if (toProvider === "env") return Promise.resolve(this.envDriver());
    return this.cloudinaryDriverFor(toProvider);
  }


  /** The driver new uploads should use right now — may differ from `media.defaultProvider` under the usage-fallback rule. */
  async resolveActiveDriver(): Promise<{ driver: MediaDriver; fellBackFromProviderInstanceId: string | null }> {
    const defaultProvider = await this.settings.getValue<string>("media.defaultProvider");
    if (defaultProvider === "env") {
      return { driver: this.envDriver(), fellBackFromProviderInstanceId: null };
    }

    const fallbackEnabled = await this.settings.getValue<boolean>("media.fallbackToEnvOnProviderLimit");
    if (fallbackEnabled) {
      try {
        const usage = await this.registry.getUsage(defaultProvider);
        if (usage && usage.usedPercent >= PROVIDER_LIMIT_FALLBACK_THRESHOLD) {
          this.logger.warn(`Provider "${defaultProvider}" at ${usage.usedPercent}% usage — falling back to env storage for this upload`);
          return { driver: this.envDriver(), fellBackFromProviderInstanceId: defaultProvider };
        }
      } catch (error) {
        this.logger.error(`Usage check for provider "${defaultProvider}" failed — proceeding without fallback: ${error instanceof Error ? error.message : error}`);
      }
    }

    return { driver: await this.cloudinaryDriverFor(defaultProvider), fellBackFromProviderInstanceId: null };
  }

  /** Deletes the remote copy of an existing `Media` row; resolves the driver from the row's own stored fields. */
  async deleteWithRetry(media: { storageDriver: string; providerInstanceId: string | null; storageKey: string; externalId: string | null; resourceType: string; variants: unknown }): Promise<void> {
    const driver = await this.driverForStoredAsset(media.storageDriver, media.providerInstanceId);
    await this.deleteAssetWithRetry(driver, {
      storageKey: media.storageKey,
      externalId: media.externalId,
      resourceType: media.resourceType,
      variants: media.variants as MediaAssetRef["variants"],
    });
  }

  /** Deletes via an explicit driver (the migration job knows the *source* driver directly, not from a row that's already been updated to the new provider); on failure, logs and schedules exactly one retry rather than leaving the remote file orphaned. */
  async deleteAssetWithRetry(driver: MediaDriver, asset: MediaAssetRef): Promise<void> {
    try {
      await driver.delete(asset);
    } catch (error) {
      this.logger.error(`Remote delete failed for media asset (key="${asset.storageKey}") — scheduling a retry: ${error instanceof Error ? error.message : error}`);
      await this.prisma.scheduledTask.create({
        data: {
          type: DELETE_RETRY_TASK_TYPE,
          payload: { ...asset, providerInstanceId: driver.providerInstanceId, storageDriver: driver.kind } as object,
          runAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
    }
  }
}
