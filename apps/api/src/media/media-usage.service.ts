import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Keeps `media_usages` in sync for any entity that references media assets
 * (product gallery images, category/collection images & banners, size chart
 * "how to measure" images, attribute value swatches, …) so Media's
 * safe-delete rule ("blocked while in use", Milestone 1) covers the whole
 * catalog, not just folders. Callers always pass the *current full list* of
 * media ids an entity references — this computes the diff against what's
 * stored and reconciles it, so single-image fields (`imageMediaId`) and
 * multi-image fields (a product's gallery) use the same call shape.
 */
@Injectable()
export class MediaUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(entityType: string, entityId: string, mediaIds: ReadonlyArray<string | null | undefined>): Promise<void> {
    const desired = new Set(mediaIds.filter((id): id is string => !!id));
    const existing = await this.prisma.mediaUsage.findMany({ where: { entityType, entityId } });
    const existingIds = new Set(existing.map((row) => row.mediaId));

    const toAdd = [...desired].filter((id) => !existingIds.has(id));
    const toRemove = existing.filter((row) => !desired.has(row.mediaId)).map((row) => row.id);

    if (toRemove.length > 0) {
      await this.prisma.mediaUsage.deleteMany({ where: { id: { in: toRemove } } });
    }
    for (const mediaId of toAdd) {
      await this.prisma.mediaUsage.create({ data: { mediaId, entityType, entityId } });
    }
  }

  /** Remove every usage row for an entity — call when the entity itself is deleted. */
  async clear(entityType: string, entityId: string): Promise<void> {
    await this.prisma.mediaUsage.deleteMany({ where: { entityType, entityId } });
  }
}
