import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { Prisma, type MediaMigrationJobStatus } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SchedulerService } from "../queue/scheduler.service";
import type { AuthenticatedStaff } from "../common/types";
import { MediaProvidersService } from "./media-providers.service";
import type { MediaVariantMap } from "./media-driver";
import type { CreateMediaMigrationJobDto } from "./dto";

const TASK_TYPE = "media.migration_tick";
const CHUNK_SIZE = 20;

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/** `Media` rows not already on `toProvider` — same vocabulary as `media.defaultProvider` ("env" or a provider_instances.id). */
function notAlreadyOnProvider(toProvider: string) {
  return toProvider === "env" ? { providerInstanceId: { not: null } } : { providerInstanceId: { not: toProvider } };
}

/**
 * "Move media to provider X" (docs/PROJECT_SPEC.md change request
 * 2026-10-22, §7) — resumable and chunked so it stays free-tier safe (no
 * long-running request, bounded work per scheduler tick). Super Admin only
 * (see SuperAdminGuard). Verification is "the upload succeeded and returned
 * sane dimensions for images," not a byte-for-byte checksum — a deliberate
 * scope line for Milestone 1, see docs/DECISIONS.md.
 */
@Injectable()
export class MediaMigrationService implements OnModuleInit {
  private readonly logger = new Logger(MediaMigrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: MediaProvidersService,
    private readonly audit: AuditService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerHandler(TASK_TYPE, async (payload) => {
      const { jobId } = payload as { jobId: string };
      await this.processChunk(jobId);
    });
  }

  async countEligible(toProvider: string): Promise<number> {
    return await this.prisma.media.count({ where: { deletedAt: null, ...notAlreadyOnProvider(toProvider) } });
  }

  async create(dto: CreateMediaMigrationJobDto, actor: AuthenticatedStaff): Promise<{ totalCount: number; job?: { id: string; status: MediaMigrationJobStatus } }> {
    if (dto.toProvider !== "env") {
      const instance = await this.prisma.providerInstance.findUnique({ where: { id: dto.toProvider } });
      if (!instance || instance.capability !== "storage") {
        throw new BadRequestException({ code: "UNKNOWN_PROVIDER", message: `No storage provider instance "${dto.toProvider}"` });
      }
    }

    const totalCount = await this.countEligible(dto.toProvider);
    if (dto.dryRun) return { totalCount };

    const job = await this.prisma.mediaMigrationJob.create({
      data: { toProvider: dto.toProvider, dryRun: false, totalCount, createdBy: actor.id },
    });
    await this.prisma.scheduledTask.create({ data: { type: TASK_TYPE, payload: { jobId: job.id } as object, runAt: new Date() } });

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "media_migration.create",
      entityType: "media_migration_job",
      entityId: job.id,
      after: { toProvider: dto.toProvider, totalCount },
    });

    return { totalCount, job: { id: job.id, status: job.status } };
  }

  async get(id: string) {
    const job = await this.prisma.mediaMigrationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException("Migration job not found");
    return job;
  }

  async list() {
    return await this.prisma.mediaMigrationJob.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  }

  private async processChunk(jobId: string): Promise<void> {
    const job = await this.prisma.mediaMigrationJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === "done" || job.status === "cancelled" || job.status === "failed") return;

    if (job.status === "pending") {
      await this.prisma.mediaMigrationJob.update({ where: { id: jobId }, data: { status: "running" } });
    }

    const targetDriver = await this.providers.driverForProvider(job.toProvider);
    const batch = await this.prisma.media.findMany({
      where: { deletedAt: null, ...notAlreadyOnProvider(job.toProvider), ...(job.cursor ? { id: { gt: job.cursor } } : {}) },
      orderBy: { id: "asc" },
      take: CHUNK_SIZE,
    });

    let processedCount = job.processedCount;
    let failedCount = job.failedCount;
    let cursor = job.cursor;
    let lastError = job.lastError;

    for (const media of batch) {
      cursor = media.id;
      try {
        const sourceDriver = await this.providers.resolveDriverForAsset(media);
        const buffer = await sourceDriver.downloadOriginal({
          storageKey: media.storageKey,
          externalId: media.externalId,
          resourceType: media.resourceType,
          variants: media.variants as MediaVariantMap | null,
        });

        const result = await targetDriver.upload({ buffer, mimeType: media.mimeType, mediaId: media.id, kind: media.kind });
        if (media.kind === "image" && (result.width === null || result.height === null)) {
          throw new Error("Upload to target provider did not return image dimensions — treating as unverified");
        }

        await this.prisma.media.update({
          where: { id: media.id },
          data: {
            storageDriver: targetDriver.kind,
            providerInstanceId: targetDriver.providerInstanceId,
            storageKey: result.storageKey,
            externalId: result.externalId,
            version: result.version,
            variants: toJsonInput(result.variants),
            ...(result.width !== null ? { width: result.width } : {}),
            ...(result.height !== null ? { height: result.height } : {}),
            ...(result.blurDataUrl !== null ? { blurDataUrl: result.blurDataUrl } : {}),
          },
        });

        await this.providers.deleteAssetWithRetry(sourceDriver, {
          storageKey: media.storageKey,
          externalId: media.externalId,
          resourceType: media.resourceType,
          variants: media.variants as MediaVariantMap | null,
        });

        processedCount += 1;
      } catch (error) {
        failedCount += 1;
        lastError = `media ${media.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
        this.logger.error(`Migration job ${jobId} failed on media ${media.id}: ${lastError}`);
      }
    }

    const hasMore = batch.length === CHUNK_SIZE;
    await this.prisma.mediaMigrationJob.update({
      where: { id: jobId },
      data: {
        processedCount,
        failedCount,
        cursor,
        lastError,
        ...(hasMore ? {} : { status: "done", finishedAt: new Date() }),
      },
    });

    if (hasMore) {
      await this.prisma.scheduledTask.create({ data: { type: TASK_TYPE, payload: { jobId } as object, runAt: new Date() } });
    } else {
      await this.audit.record({
        actorType: "system",
        action: "media_migration.finish",
        entityType: "media_migration_job",
        entityId: jobId,
        after: { toProvider: job.toProvider, processedCount, failedCount },
      });
    }
  }
}
