import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateFlashSaleDto, UpdateFlashSaleDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/** Basic flash sales (docs/PROJECT_SPEC.md §5.8, §16 M5: "basic flash sales") — a scheduled per-variant sale price with an optional stock cap; no countdown-widget config or "shop the look" bundling, that's richer M10/M13 territory. */
@Injectable()
export class FlashSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    // Variant SKU and product title so the admin list can name what is on sale instead of showing ids.
    return this.prisma.flashSale.findMany({ include: { items: { include: { variant: { select: { sku: true, product: { select: { title: true } } } } } } }, orderBy: { startsAt: "desc" } });
  }

  async get(id: string) {
    const flashSale = await this.prisma.flashSale.findUnique({ where: { id }, include: { items: true } });
    if (!flashSale) throw new NotFoundException("Flash sale not found");
    return flashSale;
  }

  async create(dto: CreateFlashSaleDto, actor: AuthenticatedStaff) {
    const flashSale = await this.prisma.flashSale.create({
      data: {
        name: toJsonInput(dto.name) as Prisma.InputJsonValue,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        status: dto.status,
        bannerText: toJsonInput(dto.bannerText),
        items: { create: dto.items.map((item) => ({ variantId: item.variantId, salePrice: item.salePrice, stockCap: item.stockCap ?? null })) },
      },
      include: { items: true },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "flash_sale.create", entityType: "flash_sale", entityId: flashSale.id, after: flashSale });
    return flashSale;
  }

  async update(id: string, dto: UpdateFlashSaleDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const { items, name, bannerText, ...rest } = dto;
    const flashSale = await this.prisma.flashSale.update({
      where: { id },
      data: {
        ...rest,
        ...(name !== undefined ? { name: toJsonInput(name) as Prisma.InputJsonValue } : {}),
        ...(bannerText !== undefined ? { bannerText: toJsonInput(bannerText) } : {}),
        ...(items !== undefined
          ? { items: { deleteMany: {}, create: items.map((item) => ({ variantId: item.variantId, salePrice: item.salePrice, stockCap: item.stockCap ?? null })) } }
          : {}),
      },
      include: { items: true },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "flash_sale.update", entityType: "flash_sale", entityId: id, before, after: flashSale });
    return flashSale;
  }

  async remove(id: string, actor: AuthenticatedStaff): Promise<void> {
    const before = await this.get(id);
    await this.prisma.flashSale.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "flash_sale.delete", entityType: "flash_sale", entityId: id, before });
  }

  /** §6.3 step 1: "flash sale price wins if lower; respect flash-sale stock caps." Returns null when no active flash sale covers this variant, or its stock cap is already used up. */
  async getActivePrice(variantId: string, now = new Date()): Promise<{ flashSaleId: string; itemId: string; price: number } | null> {
    const item = await this.prisma.flashSaleItem.findFirst({
      where: { variantId, flashSale: { status: "active", startsAt: { lte: now }, endsAt: { gte: now } } },
    });
    if (!item) return null;
    if (item.stockCap !== null && item.soldCount >= item.stockCap) return null;
    return { flashSaleId: item.flashSaleId, itemId: item.id, price: item.salePrice };
  }

  /** Called once a line with a flash-sale price is actually ordered — the stock-cap counter is separate from inventory (§5.8 `flash_sales.items.stock_cap`), tracked here, not in `inventory_levels`. */
  async recordSold(itemId: string, quantity: number): Promise<void> {
    await this.prisma.flashSaleItem.update({ where: { id: itemId }, data: { soldCount: { increment: quantity } } });
  }
}
