import type { Prisma } from "@clothing/db";

export interface ReversibleOrder {
  id: string;
  customerId: string | null;
  channel: string;
  total: number;
  items: { quantity: number; optionsSnapshot: Prisma.JsonValue }[];
}

/**
 * Undoes the counters an order bumped when it was placed, for an order that is cancelled or expires unpaid:
 * the customer's `ordersCount` / `totalSpent` (only web checkout increments them), the flash-sale units it took,
 * and — when `releaseCoupons` — its discount usage, including `discount.usedCount` (read by `totalUses` limits)
 * and a single-use bulk code's `used_count`. Runs inside the caller's transaction; never goes below zero.
 */
export async function reverseOrderBookkeepingInTx(tx: Prisma.TransactionClient, order: ReversibleOrder, options: { releaseCoupons: boolean }): Promise<void> {
  if (order.customerId && order.channel === "web") {
    await tx.$executeRaw`
      UPDATE customers
      SET orders_count = GREATEST(orders_count - 1, 0), total_spent = GREATEST(total_spent - ${order.total}, 0)
      WHERE id = ${order.customerId}
    `;
  }

  for (const item of order.items) {
    const flashSaleItemId = flashSaleItemIdOf(item.optionsSnapshot);
    if (!flashSaleItemId || item.quantity <= 0) continue;
    await tx.$executeRaw`UPDATE flash_sale_items SET sold_count = GREATEST(sold_count - ${item.quantity}, 0) WHERE id = ${flashSaleItemId}`;
  }

  if (options.releaseCoupons) {
    const usages = await tx.discountUsage.findMany({ where: { orderId: order.id }, select: { discountId: true, code: true } });
    for (const usage of usages) {
      await tx.discount.updateMany({ where: { id: usage.discountId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
      if (usage.code) await tx.discountCode.updateMany({ where: { code: usage.code, discountId: usage.discountId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    }
    await tx.discountUsage.deleteMany({ where: { orderId: order.id } });
  }
}

function flashSaleItemIdOf(snapshot: Prisma.JsonValue): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const value = (snapshot as Record<string, unknown>).flashSaleItemId;
  return typeof value === "string" && value.length > 0 ? value : null;
}
