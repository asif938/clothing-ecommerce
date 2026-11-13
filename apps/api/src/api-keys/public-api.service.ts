import { Injectable, NotFoundException } from "@nestjs/common";
import type { OrderStatus, Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";

export interface PageQuery {
  limit: number;
  after?: string;
}

/** Cursor-paginated envelope (docs/PROJECT_SPEC.md §11.1): `nextCursor` is null on the last page. */
function page<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, meta: { nextCursor: hasMore ? data[data.length - 1]!.id : null } };
}

const cursor = (after: string | undefined): { cursor?: { id: string }; skip?: number } => (after ? { cursor: { id: after }, skip: 1 } : {});

/**
 * Read-only data for the public API (docs/PROJECT_SPEC.md §11.1, §16 M17).
 * Every response is an explicit allow-list of fields — notably no cost
 * prices, risk scores, IPs, device ids or internal notes — so adding a column
 * to a table never leaks it to API consumers by accident.
 */
@Injectable()
export class PublicApiService {
  constructor(private readonly prisma: PrismaService) {}

  private productSelect = {
    id: true,
    slug: true,
    title: true,
    subtitle: true,
    shortDescription: true,
    status: true,
    productType: true,
    tags: true,
    categoryId: true,
    isFeatured: true,
    updatedAt: true,
    variants: { where: { isActive: true }, orderBy: { position: "asc" as const }, select: { id: true, sku: true, barcode: true, price: true, compareAtPrice: true, weightGrams: true, optionValueIds: true } },
  } satisfies Prisma.ProductSelect;

  async products(query: PageQuery & { updatedSince?: Date }) {
    const rows = await this.prisma.product.findMany({
      where: { status: "active", deletedAt: null, ...(query.updatedSince ? { updatedAt: { gte: query.updatedSince } } : {}) },
      select: this.productSelect,
      orderBy: { id: "asc" },
      take: query.limit + 1,
      ...cursor(query.after),
    });
    return page(rows, query.limit);
  }

  async product(idOrSlug: string) {
    const product = await this.prisma.product.findFirst({ where: { status: "active", deletedAt: null, OR: [{ id: idOrSlug }, { slug: idOrSlug }] }, select: this.productSelect });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    return product;
  }

  /** Stock per variant, summed over locations. */
  async inventory(query: PageQuery & { sku?: string }) {
    const variants = await this.prisma.productVariant.findMany({
      where: { isActive: true, product: { status: "active", deletedAt: null }, ...(query.sku ? { sku: query.sku } : {}) },
      select: { id: true, sku: true, productId: true, inventoryLevels: { select: { onHand: true, reserved: true, available: true } } },
      orderBy: { id: "asc" },
      take: query.limit + 1,
      ...cursor(query.after),
    });
    const rows = variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      productId: v.productId,
      onHand: v.inventoryLevels.reduce((a, l) => a + l.onHand, 0),
      reserved: v.inventoryLevels.reduce((a, l) => a + l.reserved, 0),
      available: v.inventoryLevels.reduce((a, l) => a + l.available, 0),
    }));
    return page(rows, query.limit);
  }

  private orderSelect = {
    id: true,
    orderNumber: true,
    status: true,
    paymentStatus: true,
    fulfillmentStatus: true,
    channel: true,
    currency: true,
    subtotal: true,
    discountTotal: true,
    shippingFee: true,
    total: true,
    paidTotal: true,
    refundedTotal: true,
    codAmount: true,
    shippingAddress: true,
    billingContact: true,
    createdAt: true,
    updatedAt: true,
    items: { select: { id: true, sku: true, title: true, quantity: true, unitPrice: true, lineTotal: true, fulfilledQty: true, returnedQty: true, rejectedQty: true } },
    shipments: { select: { courierDriver: true, consignmentId: true, trackingCode: true, trackingUrl: true, status: true } },
  } satisfies Prisma.OrderSelect;

  async orders(query: PageQuery & { placedSince?: Date; status?: OrderStatus }) {
    const rows = await this.prisma.order.findMany({
      where: { ...(query.placedSince ? { createdAt: { gte: query.placedSince } } : {}), ...(query.status ? { status: query.status } : {}) },
      select: this.orderSelect,
      orderBy: { id: "asc" },
      take: query.limit + 1,
      ...cursor(query.after),
    });
    return page(rows, query.limit);
  }

  async order(orderNumber: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber }, select: this.orderSelect });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    return order;
  }
}
