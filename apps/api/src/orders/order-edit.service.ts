import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type OrderStatus } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { SettingsService } from "../settings/settings.service";
import { LocationsService } from "../locations/locations.service";
import { ShippingService } from "../shipping/shipping.service";
import { StockReservationService } from "../checkout/stock-reservation.service";
import { ApprovalsService } from "../approvals/approvals.service";
import type { EditOrderDto } from "./dto";

export interface ApprovalPending {
  approvalRequired: true;
  approvalRequestId: string;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

// §6.8: "Staff can edit items, quantities, prices, address, shipping fee, and discounts only before shipped."
const EDITABLE_STATUSES: OrderStatus[] = ["pending_payment", "pending", "confirmed", "on_hold", "processing", "packed"];

/**
 * Order edit-before-ship with re-pricing (§6.8, §8.2). Scoped down from a
 * full re-run of the cart pricing pipeline, see docs/DECISIONS.md: item
 * price/quantity changes and address/shipping-fee changes are recomputed
 * live; existing discounts are kept as-is rather than re-evaluated against
 * the edited line set (staff can remove/adjust a discount line directly if
 * it no longer applies) — the same "manual override, reason required"
 * escape hatch already used for the cart's margin guard.
 */
@Injectable()
export class OrderEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly locations: LocationsService,
    private readonly shipping: ShippingService,
    private readonly stock: StockReservationService,
    private readonly approvals: ApprovalsService,
  ) {}

  /** True when the edit overrides a price or the shipping fee and the brand requires a second pair of eyes for that (`approvals.priceOverride.required`). */
  private async needsApproval(dto: EditOrderDto, actor: AuthenticatedStaff): Promise<boolean> {
    if (actor.permissions.has("approvals.bypass")) return false;
    const overrides = dto.shippingFeeOverride != null || (dto.items ?? []).some((line) => line.unitPriceOverride != null);
    return overrides && (await this.settings.getValue<boolean>("approvals.priceOverride.required"));
  }

  async edit(orderId: string, dto: EditOrderDto, actor: AuthenticatedStaff, opts: { approved?: boolean } = {}) {
    if (!opts.approved && (await this.needsApproval(dto, actor))) {
      const found = await this.prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
      if (!found) throw new NotFoundException("Order not found");
      const request = await this.approvals.request(
        { type: "order_edit", entityType: "order", entityId: orderId, summary: `Order ${found.orderNumber}: price/shipping override - ${dto.reason}`, payload: { orderId, dto } },
        actor,
      );
      return { approvalRequired: true, approvalRequestId: request.id } satisfies ApprovalPending;
    }
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true, discounts: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (!EDITABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "INVALID_STATE", message: "This order can no longer be edited — it has already shipped." });
    }

    const before = { items: order.items, shippingFee: order.shippingFee, total: order.total, shippingAddress: order.shippingAddress };
    const itemsById = new Map(order.items.map((item) => [item.id, item]));
    const defaultItemWeight = await this.settings.getValue<number>("shipping.defaultItemWeightGrams");

    const stockDeltas: { variantId: string; locationId: string; delta: number }[] = [];
    const lineUpdates: { id: string | null; variantId: string; locationId: string; quantity: number; unitPrice: number; lineTotal: number; weightGrams: number }[] = [];

    for (const line of dto.items ?? []) {
      if (line.orderItemId) {
        const existing = itemsById.get(line.orderItemId);
        if (!existing) throw new BadRequestException({ code: "INVALID_ITEM", message: "One of the items doesn't belong to this order." });
        const unitPrice = line.unitPriceOverride ?? existing.unitPrice;
        stockDeltas.push({ variantId: existing.variantId, locationId: existing.locationId, delta: line.quantity - existing.quantity });
        if (line.quantity > 0) {
          lineUpdates.push({ id: existing.id, variantId: existing.variantId, locationId: existing.locationId, quantity: line.quantity, unitPrice, lineTotal: unitPrice * line.quantity, weightGrams: 0 });
        } else {
          lineUpdates.push({ id: existing.id, variantId: existing.variantId, locationId: existing.locationId, quantity: 0, unitPrice, lineTotal: 0, weightGrams: 0 });
        }
      } else {
        if (!line.variantId) throw new BadRequestException({ code: "VARIANT_REQUIRED", message: "A new line needs a variant." });
        const variant = await this.prisma.productVariant.findUnique({ where: { id: line.variantId }, include: { product: { select: { title: true, weightGramsDefault: true } } } });
        if (!variant) throw new BadRequestException({ code: "VARIANT_NOT_FOUND", message: "That product no longer exists." });
        const location = order.items[0]?.locationId ?? (await this.stock.defaultLocation()).id;
        const unitPrice = line.unitPriceOverride ?? variant.price;
        stockDeltas.push({ variantId: variant.id, locationId: location, delta: line.quantity });
        lineUpdates.push({
          id: null,
          variantId: variant.id,
          locationId: location,
          quantity: line.quantity,
          unitPrice,
          lineTotal: unitPrice * line.quantity,
          weightGrams: variant.weightGrams ?? variant.product.weightGramsDefault ?? defaultItemWeight,
        });
      }
    }

    let shippingAddressUpdate: Prisma.InputJsonValue | undefined;
    const currentAddress = order.shippingAddress as { divisionId: string; districtId: string; areaId: string; recipientName?: string; phone?: string };
    if (dto.address) {
      await this.locations.validateChain(dto.address.divisionId, dto.address.districtId, dto.address.areaId);
      shippingAddressUpdate = toJson({ ...currentAddress, ...dto.address });
    }

    // Recompute subtotal/weight from the FULL resulting line set (edited lines + untouched existing ones).
    const editedIds = new Set(lineUpdates.filter((l) => l.id).map((l) => l.id));
    const untouchedLines = order.items.filter((item) => !editedIds.has(item.id));
    const allLineTotals = [...lineUpdates.map((l) => l.lineTotal), ...untouchedLines.map((l) => l.lineTotal)];
    const subtotal = allLineTotals.reduce((sum, v) => sum + v, 0);

    let shippingFee = order.shippingFee;
    if (dto.shippingFeeOverride !== undefined && dto.shippingFeeOverride !== null) {
      shippingFee = dto.shippingFeeOverride;
    } else if (dto.address) {
      const area = await this.locations.resolveArea(dto.address.areaId);
      const quote = await this.shipping.calculateFee({ ...dto.address, isDhakaCity: area?.isDhakaCity ?? false }, order.totalWeightGrams, subtotal);
      shippingFee = quote.fee;
    }

    // §16 M13/M16 — points and the referral discount stay as given; gift card / store credit are in `paidTotal`, so `codAmount` below already nets them off.
    const total = Math.max(0, subtotal - order.discountTotal - order.pointsDiscount - order.referralDiscount + shippingFee);
    const codAmount = Math.max(0, total - order.paidTotal);

    await this.prisma.$transaction(async (tx) => {
      const deltasByLocation = new Map<string, { variantId: string; quantity: number }[]>();
      for (const d of stockDeltas) {
        if (d.delta === 0) continue;
        const list = deltasByLocation.get(d.locationId) ?? [];
        list.push({ variantId: d.variantId, quantity: Math.abs(d.delta) });
        deltasByLocation.set(d.locationId, list);
        if (d.delta > 0) await this.stock.reserve(tx, d.locationId, [{ variantId: d.variantId, quantity: d.delta }]);
        else await this.stock.release(tx, d.locationId, [{ variantId: d.variantId, quantity: -d.delta }]);
      }

      for (const line of lineUpdates) {
        if (line.id) {
          await tx.orderItem.update({ where: { id: line.id }, data: { quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal } });
        } else {
          const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: line.variantId }, include: { product: { select: { title: true } } } });
          await tx.orderItem.create({
            data: {
              orderId,
              variantId: line.variantId,
              locationId: line.locationId,
              title: toJson(variant.product.title),
              sku: variant.sku,
              optionsSnapshot: toJson({}),
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              lineTotal: line.lineTotal,
            },
          });
        }
      }

      await tx.order.update({
        where: { id: orderId },
        data: { subtotal, shippingFee, total, codAmount, ...(shippingAddressUpdate ? { shippingAddress: shippingAddressUpdate } : {}) },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          type: "edit",
          data: { before: { subtotal: order.subtotal, shippingFee: order.shippingFee, total: order.total }, after: { subtotal, shippingFee, total }, reason: dto.reason },
          actor: { type: "staff", id: actor.id },
        },
      });
    });

    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "order.edit", entityType: "order", entityId: orderId, before, after: { subtotal, shippingFee, total, reason: dto.reason } });
    return await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  }
}
