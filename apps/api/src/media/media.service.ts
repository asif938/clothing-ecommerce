import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@clothing/db";
import type { MediaRef } from "@clothing/shared/media";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { MediaProvidersService } from "./media-providers.service";
import { kindFromMimeType, toCloudinaryResourceType, type MediaVariantMap } from "./media-driver";
import type { CreateDirectUploadTicketDto, FinalizeDirectUploadDto, UpdateMediaDto } from "./dto";

type RequestContext = { ip: string | null; userAgent: string | null };

// Prisma rejects a plain `null` for a nullable Json column — see AuditService.
function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

@Injectable()
export class MediaService {
  constructor(
    private readonly providers: MediaProvidersService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async upload(file: { originalname: string; mimetype: string; buffer: Buffer; size: number }, folderId: string | null, actor: AuthenticatedStaff, context: RequestContext) {
    if (!file || file.size === 0) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "No file uploaded" });
    }

    const kind = kindFromMimeType(file.mimetype);
    const { driver, fellBackFromProviderInstanceId } = await this.providers.resolveActiveDriver();

    const media = await this.prisma.media.create({
      data: {
        folderId,
        kind,
        storageDriver: driver.kind,
        storageKey: "",
        resourceType: toCloudinaryResourceType(kind),
        providerInstanceId: driver.providerInstanceId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedBy: actor.id,
      },
    });

    const result = await driver.upload({ buffer: file.buffer, mimeType: file.mimetype, mediaId: media.id, kind });

    const updated = await this.prisma.media.update({
      where: { id: media.id },
      data: {
        storageKey: result.storageKey,
        externalId: result.externalId,
        version: result.version,
        width: result.width,
        height: result.height,
        variants: toJsonInput(result.variants),
        blurDataUrl: result.blurDataUrl,
        focalX: kind === "image" ? 0.5 : null,
        focalY: kind === "image" ? 0.5 : null,
      },
    });

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "media.upload",
      entityType: "media",
      entityId: media.id,
      after: { originalName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, provider: driver.kind, fellBackFromProviderInstanceId },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return await this.withRef(updated);
  }

  /** Step 1 of the direct-upload flow — see docs/PROJECT_SPEC.md change request 2026-10-22, §5. No `Media` row yet: created only at finalize. */
  async createDirectUploadTicket(dto: CreateDirectUploadTicketDto) {
    const kind = kindFromMimeType(dto.mimeType);
    const { driver } = await this.providers.resolveActiveDriver();
    const ticket = await driver.createDirectUploadTicket({ mimeType: dto.mimeType, kind, tempId: randomUUID() });

    if (!ticket.supported) {
      return { supported: false as const };
    }
    return {
      supported: true as const,
      storageDriver: driver.kind,
      providerInstanceId: driver.providerInstanceId,
      storageKey: ticket.storageKey,
      externalId: ticket.externalId,
      method: ticket.method,
      url: ticket.url,
      fields: ticket.fields,
      headers: ticket.headers,
    };
  }

  /** Step 2 — the browser already uploaded the bytes directly to the provider; this creates the `Media` row and finishes cheap server-side processing (blur placeholder, variants for s3). */
  async finalizeDirectUpload(dto: FinalizeDirectUploadDto, actor: AuthenticatedStaff, context: RequestContext) {
    const kind = kindFromMimeType(dto.mimeType);
    const driver = await this.providers.resolveDriverForAsset({ storageDriver: dto.storageDriver, providerInstanceId: dto.providerInstanceId });

    const media = await this.prisma.media.create({
      data: {
        folderId: dto.folderId ?? null,
        kind,
        storageDriver: dto.storageDriver,
        storageKey: dto.storageKey,
        externalId: dto.externalId,
        resourceType: toCloudinaryResourceType(kind),
        providerInstanceId: dto.providerInstanceId,
        originalName: dto.originalName,
        mimeType: dto.mimeType,
        sizeBytes: dto.bytes ?? 0,
        uploadedBy: actor.id,
      },
    });

    const result = await driver.finalizeDirectUpload({
      storageKey: dto.storageKey,
      externalId: dto.externalId,
      mimeType: dto.mimeType,
      kind,
      reportedWidth: dto.width,
      reportedHeight: dto.height,
      reportedVersion: dto.version,
    });

    const updated = await this.prisma.media.update({
      where: { id: media.id },
      data: {
        width: result.width,
        height: result.height,
        variants: toJsonInput(result.variants),
        blurDataUrl: result.blurDataUrl,
        version: result.version,
        sizeBytes: result.sizeBytes ?? dto.bytes ?? 0,
        focalX: kind === "image" ? 0.5 : null,
        focalY: kind === "image" ? 0.5 : null,
      },
    });

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "media.upload",
      entityType: "media",
      entityId: media.id,
      after: { originalName: dto.originalName, mimeType: dto.mimeType, sizeBytes: updated.sizeBytes, provider: dto.storageDriver, direct: true },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return await this.withRef(updated);
  }

  async list(folderId: string | null | undefined) {
    const items = await this.prisma.media.findMany({
      where: { deletedAt: null, ...(folderId !== undefined ? { folderId } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return await Promise.all(items.map((item) => this.withRef(item)));
  }

  async update(id: string, dto: UpdateMediaDto, actor: AuthenticatedStaff, context: RequestContext) {
    const existing = await this.prisma.media.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException("Media not found");

    const updated = await this.prisma.media.update({
      where: { id },
      data: {
        ...(dto.folderId !== undefined ? { folderId: dto.folderId } : {}),
        ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
        ...(dto.focalX !== undefined ? { focalX: dto.focalX } : {}),
        ...(dto.focalY !== undefined ? { focalY: dto.focalY } : {}),
      },
    });

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "media.update",
      entityType: "media",
      entityId: id,
      before: { folderId: existing.folderId, focalX: existing.focalX, focalY: existing.focalY },
      after: dto,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return await this.withRef(updated);
  }

  async softDelete(id: string, actor: AuthenticatedStaff, context: RequestContext) {
    const existing = await this.prisma.media.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException("Media not found");

    const usageCount = await this.prisma.mediaUsage.count({ where: { mediaId: id } });
    if (usageCount > 0) {
      throw new BadRequestException({ code: "MEDIA_IN_USE", message: `Used in ${usageCount} place(s) — remove those references first` });
    }

    await this.prisma.media.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.providers.deleteWithRetry(existing);

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "media.delete",
      entityType: "media",
      entityId: id,
      before: { originalName: existing.originalName },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  async usage(id: string) {
    return await this.prisma.mediaUsage.findMany({ where: { mediaId: id } });
  }

  /** Only ever reachable for env/local-backed assets — S3/Cloudinary files are served from their own public URL (see MediaFilesController). */
  async getFileForServing(storageKey: string): Promise<Uint8Array> {
    return await this.providers.getEnvBytes(storageKey);
  }

  private async withRef<T extends { storageKey: string; externalId: string | null; resourceType: string; version: number | null; variants: unknown; focalX: number | null; focalY: number | null; storageDriver: string; providerInstanceId: string | null }>(
    media: T,
  ) {
    const driver = await this.providers.resolveDriverForAsset(media);
    const ref: MediaRef = driver.toMediaRef({
      storageKey: media.storageKey,
      externalId: media.externalId,
      resourceType: media.resourceType,
      version: media.version,
      variants: media.variants as MediaVariantMap | null,
      focalX: media.focalX,
      focalY: media.focalY,
    });
    return {
      ...media,
      url: ref.url,
      // Back-compat convenience for the admin media page (pre-dates the Cloudinary change) — name -> absolute URL, only populated for local/s3.
      variantUrls: ref.variants ? Object.fromEntries(Object.entries(ref.variants).map(([name, v]) => [name, v.url])) : null,
      mediaRef: ref,
    };
  }
}
