import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma, ShipmentStatus } from "@clothing/db";
import { t, type LocalizedText } from "@clothing/shared";
import type { CourierStatusResult, ShipmentStatusValue } from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { LocationsService } from "../locations/locations.service";
import { StockReservationService } from "../checkout/stock-reservation.service";
import { OrdersLifecycleService } from "../checkout/orders-lifecycle.service";
import { CourierProvidersService } from "../couriers/courier-providers.service";
import { CourierRulesService } from "../courier-rules/courier-rules.service";
import { CourierAreaMappingService } from "../courier-area-mapping/courier-area-mapping.service";
import { computeDoorCharge, computeDoorstepRefundableAmount, type DoorstepCustomerPaysPolicy } from "./doorstep-rejection";
import type { BookShipmentDto, ReceiveAtWarehouseDto, ReconcilePartialDeliveryDto, UpdateShipmentStatusDto } from "./dto";

interface ShippingAddressSnapshot {
  recipientName: string;
  phone: string;
  divisionId: string;
  districtId: string;
  areaId: string;
  addressLine: string;
  landmark?: string | null;
}

// Shipment statuses that mean "the courier is done with this parcel, one way or another" —
// the poll job stops checking, and a second update for the same shipment is a no-op.
const TERMINAL_SHIPMENT_STATUSES = new Set<ShipmentStatus>(["delivered", "cancelled", "lost", "returned_to_sender"]);
// `rejected_at_door`/`partially_delivered` are terminal for *the courier* but not for us — the
// parcel still has to physically come back and be QC'd (`receiveAtWarehouse`) before we're done.
// These five string values exist in both `ShipmentStatus` and `OrderStatus` — the type guard
// below is what lets a `ShipmentStatusValue` be passed to `OrdersLifecycleService.transition()`.
type OrderRelevantShipmentStatus = "out_for_delivery" | "delivered" | "partially_delivered" | "rejected_at_door" | "returned_to_sender";
const ORDER_RELEVANT_SHIPMENT_STATUSES = new Set<OrderRelevantShipmentStatus>(["out_for_delivery", "delivered", "partially_delivered", "rejected_at_door", "returned_to_sender"]);

function isOrderRelevantShipmentStatus(status: ShipmentStatusValue): status is OrderRelevantShipmentStatus {
  return (ORDER_RELEVANT_SHIPMENT_STATUSES as Set<string>).has(status);
}

const DOORSTEP_REFUND_METHOD: Record<string, "original" | "bank" | "store_credit"> = {
  same_method: "original",
  manual_transfer: "bank",
  store_credit: "store_credit",
};

/**
 * Booking, tracking, and the §6.9/§6.10 fulfillment side effects for
 * shipments. One order has (in this milestone's scope) at most one active
 * shipment — splitting an order across several parcels is phase 2
 * ("merge/split orders", §16 M11) — so `book()` always ships every
 * currently-unfulfilled item.
 */
@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly locations: LocationsService,
    private readonly stock: StockReservationService,
    private readonly lifecycle: OrdersLifecycleService,
    private readonly couriers: CourierProvidersService,
    private readonly areaMapping: CourierAreaMappingService,
    private readonly courierRules: CourierRulesService,
  ) {}

  async forOrder(orderId: string) {
    return await this.prisma.shipment.findMany({ where: { orderId }, include: { events: { orderBy: { occurredAt: "asc" } } }, orderBy: { createdAt: "desc" } });
  }

  async get(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: { events: { orderBy: { occurredAt: "asc" } }, order: true } });
    if (!shipment) throw new NotFoundException("Shipment not found");
    return shipment;
  }

  /** §6.8 "packed → shipped: booking with courier ... shipment record, tracking code, stock decrement (setting)". */
  async book(orderId: string, dto: BookShipmentDto, actor: AuthenticatedStaff) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "packed") throw new BadRequestException({ code: "INVALID_TRANSITION", message: "Only a packed order can be booked with a courier." });
    if (order.items.length === 0) throw new BadRequestException({ code: "EMPTY_ORDER", message: "This order has no items to ship." });

    const address = order.shippingAddress as unknown as ShippingAddressSnapshot;
    const area = await this.locations.resolveArea(address.areaId);
    if (!area) throw new BadRequestException({ code: "INVALID_LOCATION_CHAIN", message: "This order's delivery area no longer exists." });
    const recipientAddress = [address.addressLine, address.landmark, t(area.name as LocalizedText, "en"), t(area.district.name as LocalizedText, "en"), t(area.district.division.name as LocalizedText, "en")]
      .filter(Boolean)
      .join(", ");
    const locationId = order.items[0]!.locationId;
    const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

    let consignmentId: string | null = null;
    let trackingCode: string | null = null;
    let trackingUrl: string | null = null;
    let courierDriverName = "manual";
    let providerInstanceId = dto.courierProviderInstanceId;
    if (dto.auto) {
      const match = await this.courierRules.resolve(orderId);
      if (!match) throw new BadRequestException({ code: "NO_COURIER_RULE_MATCH", message: "No courier assignment rule matches this order - pick a courier manually." });
      providerInstanceId = match.providerInstanceId;
    }
    const manual = providerInstanceId === null;

    if (manual) {
      if (!dto.manualTrackingCode) throw new BadRequestException({ code: "TRACKING_CODE_REQUIRED", message: "Enter the courier's tracking code." });
      trackingCode = dto.manualTrackingCode;
      consignmentId = dto.manualTrackingCode;
      courierDriverName = dto.manualCourierName ?? "manual";
    } else {
      const { driver, driverName } = await this.couriers.resolveDriver(providerInstanceId!);
      const mapping = await this.areaMapping.findFor(providerInstanceId!, address.divisionId, address.districtId, address.areaId);
      const result = await driver.createParcel({
        reference: order.orderNumber,
        recipientName: address.recipientName,
        recipientPhone: address.phone,
        recipientAddress,
        areaCode: mapping?.courierAreaCode ?? null,
        areaName: mapping?.courierAreaName ?? null,
        codAmount: order.codAmount,
        weightGrams: order.totalWeightGrams,
        itemDescription: "Clothing",
        quantity: totalQuantity,
      });
      consignmentId = result.consignmentId;
      trackingCode = result.trackingCode;
      trackingUrl = result.trackingUrl ?? null;
      courierDriverName = driverName;
    }

    const stockDecrementAt = await this.settings.getValue<"packed" | "shipped">("orders.stockDecrementAt");

    const shipment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          orderId,
          locationId,
          courierProviderInstanceId: providerInstanceId,
          courierDriver: courierDriverName,
          manual,
          consignmentId,
          trackingCode,
          trackingUrl,
          status: "booked",
          codAmount: order.codAmount,
          weightGrams: order.totalWeightGrams,
          bookedAt: new Date(),
          items: { create: order.items.map((item) => ({ orderItemId: item.id, quantity: item.quantity })) },
        },
      });

      if (stockDecrementAt === "shipped") {
        await this.stock.fulfill(
          tx,
          locationId,
          order.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
          { type: "shipment", id: created.id },
        );
      }

      await this.lifecycle.transition({ orderId, to: "shipped", actor: { type: "staff", id: actor.id } }, tx);
      await tx.orderEvent.create({ data: { orderId, type: "shipment", data: { shipmentId: created.id, trackingCode, courierDriver: courierDriverName } } });
      return created;
    });

    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "shipment.book", entityType: "shipment", entityId: shipment.id, after: shipment });
    return shipment;
  }

  /** Staff-entered status update for a manual shipment, or correcting a mis-mapped courier status — same path a webhook/poll result takes. */
  async updateStatus(shipmentId: string, dto: UpdateShipmentStatusDto, actor: AuthenticatedStaff) {
    await this.applyStatus(shipmentId, { status: dto.status, rawStatus: dto.status, deliveryFeeCollected: dto.deliveryFeeCollected ?? undefined, deliveryChargeActual: dto.deliveryChargeActual ?? undefined, message: dto.message ?? undefined }, { type: "staff", id: actor.id });
  }

  /** Called by the poll job and by courier webhooks — same idempotent path either way. */
  async applyCourierResult(shipmentId: string, result: CourierStatusResult) {
    await this.applyStatus(shipmentId, result, { type: "system" });
  }

  private async applyStatus(shipmentId: string, result: CourierStatusResult, actor: { type: "staff"; id: string } | { type: "system" }) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: { order: { include: { items: true, payments: true } } } });
    if (!shipment) throw new NotFoundException("Shipment not found");
    if (TERMINAL_SHIPMENT_STATUSES.has(shipment.status)) {
      this.logger.log(`Shipment ${shipmentId} is already terminal (${shipment.status}) — ignoring update to "${result.status}"`);
      return;
    }
    const statusUnchanged = shipment.status === result.status;

    await this.prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: result.status,
          rawStatus: result.rawStatus,
          lastPolledAt: new Date(),
          deliveryFeeCollected: result.deliveryFeeCollected ?? shipment.deliveryFeeCollected,
          deliveryChargeActual: result.deliveryChargeActual ?? shipment.deliveryChargeActual,
          deliveredAt: result.status === "delivered" || result.status === "partially_delivered" ? new Date() : shipment.deliveredAt,
        },
      });
      await tx.shipmentEvent.create({ data: { shipmentId, status: result.status, rawStatus: result.rawStatus, message: result.message ?? null } });
      if (statusUnchanged) return; // re-polled the same status — logged for the record, nothing else to do

      if (isOrderRelevantShipmentStatus(result.status)) {
        await this.lifecycle.transition({ orderId: shipment.orderId, to: result.status, actor }, tx);
      }

      if (result.status === "delivered") {
        for (const item of shipment.order.items) await tx.orderItem.update({ where: { id: item.id }, data: { fulfilledQty: item.quantity } });
        if (shipment.order.customerId) await tx.customer.update({ where: { id: shipment.order.customerId }, data: { deliveredCount: { increment: 1 } } });
      }

      if (result.status === "rejected_at_door") {
        await this.handleFullRejection(tx, shipment.orderId, shipment.order.items, shipment.order.paidTotal, result.deliveryFeeCollected ?? 0);
        if (shipment.order.customerId) await tx.customer.update({ where: { id: shipment.order.customerId }, data: { rejectedAtDoorCount: { increment: 1 } } });
      }

      if (result.status === "returned_to_sender") {
        for (const item of shipment.order.items) await tx.orderItem.update({ where: { id: item.id }, data: { returnedQty: item.quantity } });
      }
    });

    this.logger.log(`Shipment ${shipment.trackingCode ?? shipmentId} → ${result.status}`);
  }

  private async handleFullRejection(tx: Prisma.TransactionClient, orderId: string, items: { id: string; quantity: number }[], paidTotal: number, deliveryFeeCollected: number) {
    for (const item of items) await tx.orderItem.update({ where: { id: item.id }, data: { rejectedQty: item.quantity } });
    const policy = await this.settings.getValue<DoorstepCustomerPaysPolicy>("returns.doorstepCustomerPays");
    const doorCharge = computeDoorCharge(policy, deliveryFeeCollected, 0);
    const refundable = computeDoorstepRefundableAmount({ paidTotal, doorCharge, keptItemsValue: 0 });
    if (refundable > 0) {
      const methodSetting = await this.settings.getValue<string>("returns.doorstepRefundMethod");
      await tx.refund.create({
        data: { orderId, amount: refundable, method: DOORSTEP_REFUND_METHOD[methodSetting] ?? "bank", status: "pending", reason: "Doorstep rejection — refund of advance minus delivery charge" },
      });
      await tx.orderEvent.create({ data: { orderId, type: "refund", data: { reason: "rejected_at_door", amount: refundable } } });
    }
  }

  /** Staff reconciles which items were actually kept once a shipment comes back `partially_delivered` — couriers don't report this at item granularity. */
  async reconcilePartialDelivery(shipmentId: string, dto: ReconcilePartialDeliveryDto, actor: AuthenticatedStaff) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: { order: { include: { items: true } } } });
    if (!shipment) throw new NotFoundException("Shipment not found");
    if (shipment.status !== "partially_delivered") throw new BadRequestException({ code: "INVALID_STATE", message: "This shipment isn't partially delivered." });

    const keptByItem = new Map(dto.items.map((i) => [i.orderItemId, i.keptQty]));
    let keptItemsValue = 0;
    const lines = shipment.order.items.map((item) => {
      const keptQty = Math.min(item.quantity, keptByItem.get(item.id) ?? 0);
      const rejectedQty = item.quantity - keptQty;
      keptItemsValue += keptQty * item.unitPrice;
      return { item, keptQty, rejectedQty };
    });

    const policy = await this.settings.getValue<DoorstepCustomerPaysPolicy>("returns.doorstepCustomerPays");
    const doorCharge = computeDoorCharge(policy, shipment.deliveryFeeCollected ?? 0, 0);
    const refundable = computeDoorstepRefundableAmount({ paidTotal: shipment.order.paidTotal, doorCharge, keptItemsValue });

    await this.prisma.$transaction(async (tx) => {
      for (const { item, keptQty, rejectedQty } of lines) {
        await tx.orderItem.update({ where: { id: item.id }, data: { fulfilledQty: keptQty, rejectedQty } });
      }
      if (refundable > 0) {
        const methodSetting = await this.settings.getValue<string>("returns.doorstepRefundMethod");
        await tx.refund.create({
          data: { orderId: shipment.orderId, amount: refundable, method: DOORSTEP_REFUND_METHOD[methodSetting] ?? "bank", status: "pending", reason: "Partial delivery — refund of advance minus delivery charge and kept items" },
        });
        await tx.orderEvent.create({ data: { orderId: shipment.orderId, type: "refund", data: { reason: "partially_delivered", amount: refundable } } });
      }
    });

    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "shipment.reconcile_partial", entityType: "shipment", entityId: shipmentId, after: { keptItemsValue, refundable } });
    return { keptItemsValue, refundable };
  }

  /** §6.9 step 5: "Parcel return arrives at warehouse → returned_to_warehouse → QC → restock." */
  async receiveAtWarehouse(shipmentId: string, dto: ReceiveAtWarehouseDto, actor: AuthenticatedStaff) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: { order: { include: { items: true } } } });
    if (!shipment) throw new NotFoundException("Shipment not found");
    if (shipment.status !== "rejected_at_door" && shipment.status !== "returned_to_sender") {
      throw new BadRequestException({ code: "INVALID_STATE", message: "This shipment hasn't been rejected or returned by the courier." });
    }

    const itemsById = new Map(shipment.order.items.map((item) => [item.id, item]));
    await this.prisma.$transaction(async (tx) => {
      for (const entry of dto.items) {
        const item = itemsById.get(entry.orderItemId);
        if (!item) continue;
        const qty = item.rejectedQty + item.returnedQty;
        if (qty <= 0) continue;
        if (entry.restock) {
          await this.stock.restock(tx, shipment.locationId, [{ variantId: item.variantId, quantity: qty }], { type: "shipment", id: shipment.id });
        } else {
          await tx.orderEvent.create({ data: { orderId: shipment.orderId, type: "note", data: { note: `${qty}x ${item.sku} failed QC — not restocked (damaged)` } } });
        }
      }
      await this.lifecycle.transition({ orderId: shipment.orderId, to: "returned_to_warehouse", actor: { type: "staff", id: actor.id } }, tx);
    });

    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "shipment.receive_at_warehouse", entityType: "shipment", entityId: shipmentId, after: dto });
  }

  async cancel(shipmentId: string, actor: AuthenticatedStaff) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: { order: { include: { items: true } } } });
    if (!shipment) throw new NotFoundException("Shipment not found");
    if (shipment.status !== "booked") throw new BadRequestException({ code: "INVALID_STATE", message: "Only a freshly-booked shipment (not yet picked up) can be cancelled." });

    if (!shipment.manual && shipment.courierProviderInstanceId && shipment.consignmentId) {
      try {
        const { driver } = await this.couriers.resolveDriver(shipment.courierProviderInstanceId);
        await driver.cancelParcel?.(shipment.consignmentId);
      } catch (error) {
        this.logger.warn(`Courier cancellation failed for shipment ${shipmentId}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }

    const stockDecrementAt = await this.settings.getValue<"packed" | "shipped">("orders.stockDecrementAt");
    await this.prisma.$transaction(async (tx) => {
      await tx.shipment.update({ where: { id: shipmentId }, data: { status: "cancelled" } });
      if (stockDecrementAt === "shipped") {
        // Give the physical stock back — it was decremented at booking time.
        await this.stock.restock(
          tx,
          shipment.locationId,
          shipment.order.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
          { type: "shipment", id: shipment.id },
        );
      }
      // Deliberately bypasses `OrdersLifecycleService.transition()` — "shipped → packed" is not a
      // normal §6.8 move and isn't in `ALLOWED_TRANSITIONS`; it only exists here, as the narrow
      // undo for "booked this with the wrong courier/by mistake," gated on the shipment never
      // having been picked up (see the `status !== "booked"` guard above).
      await tx.order.update({ where: { id: shipment.orderId }, data: { status: "packed" } });
      await tx.orderEvent.create({ data: { orderId: shipment.orderId, type: "status_change", data: { from: "shipped", to: "packed", reason: "Shipment cancelled" } } });
    });

    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "shipment.cancel", entityType: "shipment", entityId: shipmentId });
  }
}
