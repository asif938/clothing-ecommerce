import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, type CollectionType } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { buildProductWhereFromRules, type CollectionRules } from "../collections/collection-rules";
import type { AuthenticatedStaff } from "../common/types";
import { computeScheduledPrice } from "./price-math";
import type { CreatePriceScheduleDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

type ScheduleRow = { targetType: string; targetId: string };

@Injectable()
export class PriceSchedulesService {
  private readonly logger = new Logger(PriceSchedulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Each row carries `targetLabel` (product title, collection/category name, SKU or tag) so the admin list never has to show a raw id. */
  async list() {
    const schedules = await this.prisma.priceSchedule.findMany({ orderBy: { createdAt: "desc" } });
    const idsOf = (type: string) => [...new Set(schedules.filter((s) => s.targetType === type).map((s) => s.targetId))];
    const [variants, products, collections, categories] = await Promise.all([
      this.prisma.productVariant.findMany({ where: { id: { in: idsOf("variant") } }, select: { id: true, sku: true, product: { select: { title: true } } } }),
      this.prisma.product.findMany({ where: { id: { in: idsOf("product") } }, select: { id: true, title: true } }),
      this.prisma.collection.findMany({ where: { id: { in: idsOf("collection") } }, select: { id: true, name: true } }),
      this.prisma.category.findMany({ where: { id: { in: idsOf("category") } }, select: { id: true, name: true } }),
    ]);
    const labels = new Map<string, Prisma.JsonValue | string>([
      ...variants.map((v) => [`variant:${v.id}`, { ...(v.product.title as object), sku: v.sku }] as const),
      ...products.map((p) => [`product:${p.id}`, p.title] as const),
      ...collections.map((c) => [`collection:${c.id}`, c.name] as const),
      ...categories.map((c) => [`category:${c.id}`, c.name] as const),
    ]);
    return schedules.map((s) => ({ ...s, targetLabel: s.targetType === "tag" ? s.targetId : (labels.get(`${s.targetType}:${s.targetId}`) ?? null) }));
  }

  async create(dto: CreatePriceScheduleDto, actor: AuthenticatedStaff) {
    const schedule = await this.prisma.priceSchedule.create({
      data: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        newPrice: dto.newPrice ?? null,
        percentChange: dto.percentChange ?? null,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt ?? null,
        revertOnEnd: dto.revertOnEnd ?? true,
        createdBy: actor.id,
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "price_schedule.create", entityType: "price_schedule", entityId: schedule.id, after: { targetType: dto.targetType, targetId: dto.targetId } });
    return schedule;
  }

  async cancel(id: string, actor: AuthenticatedStaff) {
    const schedule = await this.prisma.priceSchedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException("Price schedule not found");
    if (schedule.status === "active") await this.revert(schedule);
    await this.prisma.priceSchedule.update({ where: { id }, data: { status: "cancelled" } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "price_schedule.cancel", entityType: "price_schedule", entityId: id });
  }

  async resolveVariantIds(target: ScheduleRow): Promise<string[]> {
    switch (target.targetType) {
      case "variant":
        return [target.targetId];
      case "product": {
        const variants = await this.prisma.productVariant.findMany({ where: { productId: target.targetId }, select: { id: true } });
        return variants.map((v) => v.id);
      }
      case "category": {
        const variants = await this.prisma.productVariant.findMany({ where: { product: { categoryId: target.targetId } }, select: { id: true } });
        return variants.map((v) => v.id);
      }
      case "tag": {
        const variants = await this.prisma.productVariant.findMany({ where: { product: { tags: { has: target.targetId } } }, select: { id: true } });
        return variants.map((v) => v.id);
      }
      case "collection": {
        const collection = await this.prisma.collection.findUnique({ where: { id: target.targetId } });
        if (!collection) return [];
        let productIds: string[];
        if ((collection.type as CollectionType) === "manual") {
          const rows = await this.prisma.collectionProduct.findMany({ where: { collectionId: target.targetId }, select: { productId: true } });
          productIds = rows.map((r) => r.productId);
        } else {
          if (!collection.rules) return [];
          const products = await this.prisma.product.findMany({ where: buildProductWhereFromRules(collection.rules as unknown as CollectionRules), select: { id: true } });
          productIds = products.map((p) => p.id);
        }
        const variants = await this.prisma.productVariant.findMany({ where: { productId: { in: productIds } }, select: { id: true } });
        return variants.map((v) => v.id);
      }
      default:
        return [];
    }
  }

  private async apply(schedule: { id: string; targetType: string; targetId: string; newPrice: number | null; percentChange: number | null }): Promise<void> {
    const variantIds = await this.resolveVariantIds(schedule);
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: variantIds } } });

    const snapshot: Record<string, number> = {};
    for (const variant of variants) {
      snapshot[variant.id] = variant.price;
      const newPrice = computeScheduledPrice(variant.price, schedule);
      await this.prisma.productVariant.update({ where: { id: variant.id }, data: { price: newPrice } });
    }

    await this.prisma.priceSchedule.update({ where: { id: schedule.id }, data: { status: "active", appliedSnapshot: toJsonInput(snapshot) } });
    await this.audit.record({ actorType: "system", action: "price_schedule.apply", entityType: "price_schedule", entityId: schedule.id, after: { variantCount: variants.length } });
  }

  private async revert(schedule: { id: string; appliedSnapshot: Prisma.JsonValue }): Promise<void> {
    const snapshot = (schedule.appliedSnapshot as Record<string, number> | null) ?? {};
    for (const [variantId, previousPrice] of Object.entries(snapshot)) {
      await this.prisma.productVariant.update({ where: { id: variantId }, data: { price: previousPrice } }).catch((error) => {
        this.logger.error(`Could not revert price for variant ${variantId}: ${error instanceof Error ? error.message : "Unknown error"}`);
      });
    }
    await this.audit.record({ actorType: "system", action: "price_schedule.revert", entityType: "price_schedule", entityId: schedule.id, after: { variantCount: Object.keys(snapshot).length } });
  }

  /** Recurring sweep (SchedulerService) — applies due schedules, reverts/ends expired ones. */
  async runSweep(): Promise<void> {
    const now = new Date();

    const due = await this.prisma.priceSchedule.findMany({ where: { status: "scheduled", startsAt: { lte: now } } });
    for (const schedule of due) await this.apply(schedule);

    const expired = await this.prisma.priceSchedule.findMany({ where: { status: "active", endsAt: { lte: now } } });
    for (const schedule of expired) {
      if (schedule.revertOnEnd) await this.revert(schedule);
      await this.prisma.priceSchedule.update({ where: { id: schedule.id }, data: { status: "ended" } });
    }
  }
}
