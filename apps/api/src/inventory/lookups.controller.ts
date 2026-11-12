import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";

const variantLookupSchema = z.object({ q: z.string().trim().min(1).max(100) });

type Localized = { bn?: string; en?: string } | null;

/**
 * Small read-only pickers for the M12 admin screens (purchase orders,
 * transfers, stock takes, size curve), which are used by staff holding
 * `procurement.manage` or `inventory.manage` but not necessarily
 * `catalog.manage`. Authenticated staff only; nothing sensitive (no cost
 * price) is returned.
 */
@ApiTags("inventory")
@Controller("admin/lookups")
@UseGuards(StaffAuthGuard)
export class LookupsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Variants by SKU/barcode prefix or product title (bn/en substring). */
  @Get("variants")
  async variants(@Query(new ZodValidationPipe(variantLookupSchema)) query: z.infer<typeof variantLookupSchema>) {
    const q = query.q;
    const variants = await this.prisma.productVariant.findMany({
      where: {
        OR: [
          { sku: { startsWith: q, mode: "insensitive" } },
          { barcode: q },
          { product: { title: { path: ["en"], string_contains: q } } },
          { product: { title: { path: ["bn"], string_contains: q } } },
        ],
      },
      select: { id: true, sku: true, barcode: true, price: true, optionValueIds: true, product: { select: { id: true, title: true } } },
      orderBy: { sku: "asc" },
      take: 20,
    });
    const valueIds = [...new Set(variants.flatMap((v) => v.optionValueIds))];
    const values = valueIds.length ? await this.prisma.productOptionValue.findMany({ where: { id: { in: valueIds } }, select: { id: true, value: true } }) : [];
    const valueById = new Map(values.map((v) => [v.id, v.value as Localized]));
    return variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      barcode: v.barcode,
      price: v.price,
      productId: v.product.id,
      title: v.product.title,
      options: v.optionValueIds.map((id) => valueById.get(id)).filter((x): x is NonNullable<Localized> => !!x),
    }));
  }

  @Get("categories")
  async categories() {
    return this.prisma.category.findMany({ select: { id: true, name: true, parentId: true }, orderBy: { sortOrder: "asc" } });
  }

  @Get("stock-locations")
  async stockLocations() {
    return this.prisma.stockLocation.findMany({ where: { isActive: true }, select: { id: true, name: true, isDefault: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  }
}
