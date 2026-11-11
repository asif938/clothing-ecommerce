import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { OrderStatus, Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { OrderNumberService } from "../checkout/order-number.service";
import { computeMerge, computeSplit, SplitError } from "./merge-split-math";
import type { MergeOrdersDto, SplitOrderDto } from "./dto";

/** Merge/split only while nothing physical has happened to the order (no pick list, no parcel). */
const MERGE_SPLIT_STATUSES: OrderStatus[] = ["pending", "confirmed", "on_hold"];

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * Merge and split orders (docs/PROJECT_SPEC.md §8.2, §16 M11).
 *
 * Merge folds duplicate/related orders from one customer into a survivor:
 * items, discounts and coupon usage move across, totals are recomputed, and
 * the absorbed orders become `cancelled` with `mergedIntoOrderId` set. They
 * are cancelled *directly*, not through `OrdersLifecycleService`, because the
 * lifecycle's cancellation releases stock and refunds payments - here the
 * stock reservation travels with the items and the customer must not receive
 * a "your order was cancelled" message. Split does the reverse: carves items
 * into a new order in the same status. Both refuse orders with payments on
 * the absorbed/split side, so no money has to be re-allocated.
 */
@Injectable()
export class OrderMergeSplitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orderNumbers: OrderNumberService,
  ) {}

  async merge(dto: MergeOrdersDto, actor: AuthenticatedStaff) {
    const ids = [dto.targetOrderId, ...dto.sourceOrderIds];
    if (new Set(ids).size !== ids.length) throw new BadRequestException({ code: "DUPLICATE_ORDER", message: "An order can't be merged into itself or listed twice." });

    const orders = await this.prisma.order.findMany({ where: { id: { in: ids } }, include: { items: true } });
    if (orders.length !== ids.length) throw new NotFoundException("One of the orders wasn't found");
    const target = orders.find((o) => o.id === dto.targetOrderId)!;
    const sources = dto.sourceOrderIds.map((id) => orders.find((o) => o.id === id)!);

    for (const order of orders) {
      if (!MERGE_SPLIT_STATUSES.includes(order.status)) {
        throw new BadRequestException({ code: "INVALID_STATE", message: `Order ${order.orderNumber} is ${order.status} - only pending, confirmed or on-hold orders can be merged.` });
      }
    }
    for (const source of sources) {
      if (source.paidTotal > 0) {
        throw new BadRequestException({ code: "HAS_PAYMENTS", message: `Order ${source.orderNumber} has a payment on it - refund or merge into the paid order instead.` });
      }
    }
    if (!sameCustomer(target, sources)) {
      throw new BadRequestException({ code: "DIFFERENT_CUSTOMERS", message: "Only orders from the same customer (same account or phone number) can be merged." });
    }

    const totals = computeMerge(target, sources);
    const sourceIds = sources.map((s) => s.id);
    const mergedTags = [...new Set([...target.tags, ...sources.flatMap((s) => s.tags)])];
    const previousTotals = orders.reduce((sum, o) => sum + o.total, 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({ where: { orderId: { in: sourceIds } }, data: { orderId: target.id } });
      await tx.orderDiscount.updateMany({ where: { orderId: { in: sourceIds } }, data: { orderId: target.id } });
      await tx.discountUsage.updateMany({ where: { orderId: { in: sourceIds } }, data: { orderId: target.id } });

      await tx.order.update({
        where: { id: target.id },
        data: {
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          total: totals.total,
          codAmount: totals.codAmount,
          totalWeightGrams: totals.totalWeightGrams,
          tags: mergedTags,
          possibleDuplicateOrderIds: target.possibleDuplicateOrderIds.filter((id) => !sourceIds.includes(id)),
        },
      });

      for (const source of sources) {
        await tx.order.update({
          where: { id: source.id },
          data: {
            status: "cancelled",
            cancelledReason: `Merged into ${target.orderNumber}`,
            mergedIntoOrderId: target.id,
            // The reservation travelled with the items; flag it so nothing tries to release it again.
            reservationReleasedAt: new Date(),
            subtotal: 0,
            discountTotal: 0,
            shippingFee: 0,
            total: 0,
            codAmount: 0,
            totalWeightGrams: 0,
            possibleDuplicateOrderIds: [],
          },
        });
        await tx.orderEvent.create({
          data: { orderId: source.id, type: "merge", data: { mergedInto: target.id, mergedIntoNumber: target.orderNumber, reason: dto.reason }, actor: { type: "staff", id: actor.id } },
        });
        await tx.orderEvent.create({ data: { orderId: source.id, type: "status_change", data: { from: source.status, to: "cancelled", reason: `Merged into ${target.orderNumber}` }, actor: { type: "staff", id: actor.id } } });
      }
      await tx.orderEvent.create({
        data: {
          orderId: target.id,
          type: "merge",
          data: { absorbed: sources.map((s) => ({ id: s.id, orderNumber: s.orderNumber, total: s.total })), before: { total: target.total }, after: { total: totals.total }, reason: dto.reason },
          actor: { type: "staff", id: actor.id },
        },
      });

      if (target.customerId) {
        await tx.customer.update({ where: { id: target.customerId }, data: { ordersCount: { decrement: sources.length }, totalSpent: { increment: totals.total - previousTotals } } });
      }
    });

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "order.merge",
      entityType: "order",
      entityId: target.id,
      before: { orders: orders.map((o) => ({ id: o.id, total: o.total })) },
      after: { total: totals.total, absorbed: sourceIds, reason: dto.reason },
    });
    return await this.prisma.order.findUniqueOrThrow({ where: { id: target.id }, include: { items: true } });
  }

  async split(orderId: string, dto: SplitOrderDto, actor: AuthenticatedStaff) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (!MERGE_SPLIT_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "INVALID_STATE", message: "Only pending, confirmed or on-hold orders can be split." });
    }
    if (order.paidTotal > 0) {
      throw new BadRequestException({ code: "HAS_PAYMENTS", message: "This order has a payment on it, so it can't be split. Refund the payment first." });
    }

    let plan;
    try {
      plan = computeSplit(order, dto.items);
    } catch (error) {
      if (error instanceof SplitError) throw new BadRequestException({ code: error.code, message: error.message });
      throw error;
    }

    const newOrderNumber = await this.orderNumbers.generate();
    const newShippingFee = dto.shippingFee;
    const newTotal = plan.newSubtotal - plan.newDiscount + newShippingFee;
    const remainingTotal = Math.max(0, plan.remainingSubtotal - plan.remainingDiscount + order.shippingFee - order.shippingDiscount);

    const created = await this.prisma.$transaction(async (tx) => {
      for (const kept of plan.remainingItems) {
        const original = order.items.find((i) => i.id === kept.orderItemId)!;
        if (kept.quantity !== original.quantity) {
          await tx.orderItem.update({ where: { id: original.id }, data: { quantity: kept.quantity, lineTotal: kept.lineTotal, discountAllocated: kept.discountAllocated } });
        }
      }

      const newOrder = await tx.order.create({
        data: {
          orderNumber: newOrderNumber,
          customerId: order.customerId,
          channel: "admin",
          status: order.status,
          confirmedAt: order.confirmedAt,
          confirmedBy: order.confirmedBy,
          currency: order.currency,
          subtotal: plan.newSubtotal,
          discountTotal: plan.newDiscount,
          shippingFee: newShippingFee,
          total: newTotal,
          codAmount: newTotal,
          totalWeightGrams: plan.newWeight,
          shippingAddress: toJson(order.shippingAddress),
          billingContact: toJson(order.billingContact),
          customerNote: order.customerNote,
          riskScore: order.riskScore,
          riskReasonCodes: order.riskReasonCodes,
          riskLevel: order.riskLevel,
          assignedTo: order.assignedTo,
          tags: [...new Set([...order.tags, "split"])],
          splitFromOrderId: order.id,
          events: {
            create: [
              { type: "status_change", data: { from: null, to: order.status, splitFrom: order.orderNumber }, actor: { type: "staff", id: actor.id } },
              { type: "split", data: { from: order.id, fromNumber: order.orderNumber, reason: dto.reason }, actor: { type: "staff", id: actor.id } },
            ],
          },
        },
      });

      for (const move of plan.moved) {
        const original = order.items.find((i) => i.id === move.orderItemId)!;
        if (move.wholeRow) {
          await tx.orderItem.update({ where: { id: original.id }, data: { orderId: newOrder.id } });
        } else {
          await tx.orderItem.create({
            data: {
              orderId: newOrder.id,
              variantId: original.variantId,
              locationId: original.locationId,
              title: toJson(original.title),
              sku: original.sku,
              optionsSnapshot: toJson(original.optionsSnapshot),
              imageUrl: original.imageUrl,
              unitPrice: original.unitPrice,
              compareAtPrice: original.compareAtPrice,
              quantity: move.quantity,
              discountAllocated: move.discountAllocated,
              lineTotal: move.lineTotal,
              costPrice: original.costPrice,
            },
          });
        }
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          subtotal: plan.remainingSubtotal,
          discountTotal: plan.remainingDiscount,
          total: remainingTotal,
          codAmount: remainingTotal,
          totalWeightGrams: plan.remainingWeight,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "split",
          data: { to: newOrder.id, toNumber: newOrder.orderNumber, before: { total: order.total }, after: { total: remainingTotal }, reason: dto.reason },
          actor: { type: "staff", id: actor.id },
        },
      });

      if (order.customerId) {
        await tx.customer.update({ where: { id: order.customerId }, data: { ordersCount: { increment: 1 }, totalSpent: { increment: newTotal + remainingTotal - order.total } } });
      }
      return newOrder;
    });

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "order.split",
      entityType: "order",
      entityId: order.id,
      before: { total: order.total },
      after: { total: remainingTotal, newOrderId: created.id, newOrderTotal: newTotal, reason: dto.reason },
    });
    return {
      original: await this.prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } }),
      created: await this.prisma.order.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } }),
    };
  }
}

function phoneOf(order: { billingContact: unknown }): string | null {
  const phone = (order.billingContact as { phone?: string } | null)?.phone;
  return phone ?? null;
}

function sameCustomer(target: { customerId: string | null; billingContact: unknown }, others: { customerId: string | null; billingContact: unknown }[]): boolean {
  return others.every((o) => (target.customerId && o.customerId ? target.customerId === o.customerId : phoneOf(target) !== null && phoneOf(target) === phoneOf(o)));
}
