import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import { Prisma } from "@clothing/db";
import type { StorageDriver } from "@clothing/shared/providers";
import { STORAGE_DRIVER, STORAGE_DRIVER_NAME } from "../storage/storage.module";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { UpdateMediaDto } from "./dto";

const IMAGE_VARIANT_WIDTHS = { thumb: 200, md: 800, lg: 1600 } as const;
type VariantName = keyof typeof IMAGE_VARIANT_WIDTHS;

type RequestContext = { ip: string | null; userAgent: string | null };

// Prisma rejects a plain `null` for a nullable Json column — see AuditService.
function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function kindFromMimeType(mimeType: string): "image" | "video" | "document" | "font" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("font/") || mimeType.includes("font")) return "font";
  return "document";
}

@Injectable()
export class MediaService {
  constructor(
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    @Inject(STORAGE_DRIVER_NAME) private readonly storageDriverName: string,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async upload(file: { originalname: string; mimetype: string; buffer: Buffer; size: number }, folderId: string | null, actor: AuthenticatedStaff, context: RequestContext) {
    if (!file || file.size === 0) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "No file uploaded" });
    }

    const kind = kindFromMimeType(file.mimetype);
    const media = await this.prisma.media.create({
      data: {
        folderId,
        kind,
        storageDriver: this.storageDriverName,
        storageKey: "",
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedBy: actor.id,
      },
    });

    const originalKey = `media/${media.id}/original-${file.originalname}`;
    await this.storage.put(originalKey, file.buffer, file.mimetype);

    let variants: Record<string, { key: string; width: number; height: number }> | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let blurDataUrl: string | null = null;

    if (kind === "image") {
      const image = sharp(file.buffer, { failOn: "none" });
      const metadata = await image.metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;

      variants = {};
      for (const [name, targetWidth] of Object.entries(IMAGE_VARIANT_WIDTHS) as [VariantName, number][]) {
        const resized = await sharp(file.buffer, { failOn: "none" })
          .resize({ width: targetWidth, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer({ resolveWithObject: true });
        const key = `media/${media.id}/${name}.webp`;
        await this.storage.put(key, resized.data, "image/webp");
        variants[name] = { key, width: resized.info.width, height: resized.info.height };
      }

      const blurBuffer = await sharp(file.buffer, { failOn: "none" })
        .resize({ width: 16, withoutEnlargement: true })
        .webp({ quality: 40 })
        .toBuffer();
      blurDataUrl = `data:image/webp;base64,${blurBuffer.toString("base64")}`;
    }

    const updated = await this.prisma.media.update({
      where: { id: media.id },
      data: {
        storageKey: originalKey,
        width,
        height,
        variants: toJsonInput(variants),
        blurDataUrl,
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
      after: { originalName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.withUrls(updated);
  }

  async list(folderId: string | null | undefined) {
    const items = await this.prisma.media.findMany({
      where: { deletedAt: null, ...(folderId !== undefined ? { folderId } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return items.map((item) => this.withUrls(item));
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

    return this.withUrls(updated);
  }

  async softDelete(id: string, actor: AuthenticatedStaff, context: RequestContext) {
    const existing = await this.prisma.media.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException("Media not found");

    const usageCount = await this.prisma.mediaUsage.count({ where: { mediaId: id } });
    if (usageCount > 0) {
      throw new BadRequestException({ code: "MEDIA_IN_USE", message: `Used in ${usageCount} place(s) — remove those references first` });
    }

    await this.prisma.media.update({ where: { id }, data: { deletedAt: new Date() } });
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

  async getFileForServing(storageKey: string): Promise<Uint8Array> {
    return await this.storage.get(storageKey);
  }

  private withUrls<T extends { storageKey: string; variants: unknown }>(media: T) {
    const variants = media.variants as Record<string, { key: string; width: number; height: number }> | null;
    return {
      ...media,
      url: this.storage.publicUrl(media.storageKey),
      variantUrls: variants
        ? Object.fromEntries(Object.entries(variants).map(([name, v]) => [name, this.storage.publicUrl(v.key)]))
        : null,
    };
  }
}
