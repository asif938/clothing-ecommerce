import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type ReturnType as ReturnTypeEnum } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { StockReservationService } from "../checkout/stock-reservation.service";
import { OrderNumberService } from "../checkout/order-number.service";
import type { ApproveReturnDto, CreateReturnRequestDto, InspectReturnDto, RejectReturnDto } from "./dto";
import { StoreCreditLedgerService } from "../rewards-core/store-credit-ledger.service";

interface ReturnItemRecord {
  orderItemId: string;
  quantity: number;
  exchangeForVariantId: string | null;
  condition?: "pass" | "fail";
  restock?: boolean;
}

const DONE_STATUSES = new Set(["delivered", "partially_delivered", "completed"]);

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/**
 * §6.10 returns & exchanges. Scope kept deliberately tight for M6 (see
 * docs/DECISIONS.md): reverse pickup is staff bookkeeping only (no courier
 * API implements it against real docs, §10.2's table doesn't list one),
 * store credit goes through the wallet ledger (`StoreCreditLedgerService`,
 * §16 M16), and refunds always land in the existing
 * `refunds` queue for a human to action — nothing here disburses money
 * automatically.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly stock: StockReservationService,
    private readonly orderNumbers: OrderNumberService,
    private readonly storeCredit: StoreCreditLedgerService,
  ) {}

  async list(status?: string) {
    return await this.prisma.return.findMany({
      where: status ? { status: status as never } : undefined,
      include: { order: { select: { orderNumber: true } }, customer: { select: { name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(id: string) {
    const record = await this.prisma.return.findUnique({ where: { id }, include: { order: { include: { items: true } } } });
    if (!record) throw new NotFoundException("Return not found");
    return record;
  }

  async mine(customerId: string) {
    return await this.prisma.return.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
  }

  /** §16 M10 self-service exchange portal — the guest path `StoreReturnsController.createByTracking` uses, verified the same way `OrdersService.trackByPhoneAndNumber`/`cancelByTracking` already verify a guest order (exact phone match on the order's own billing contact). */
  async createByTracking(phone: string, orderNumber: string, dto: Omit<CreateReturnRequestDto, "orderId">) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber } });
    const billingPhone = (order?.billingContact as { phone?: string } | null)?.phone;
    if (!order || billingPhone !== phone) throw new NotFoundException("Order not found");
    return this.createRequest({ ...dto, orderId: order.id }, order.customerId);
  }

  async createRequest(dto: CreateReturnRequestDto, customerId: string | null) {
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId }, include: { items: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (customerId && order.customerId !== customerId) throw new ForbiddenException({ code: "FORBIDDEN", message: "Not your order" });
    if (!DONE_STATUSES.has(order.status)) throw new BadRequestException({ code: "NOT_DELIVERED", message: "This order hasn't been delivered yet." });

    const [enabledTypes, windowDays] = await Promise.all([
      this.settings.getValue<ReturnTypeEnum[]>("returns.enabledTypes"),
      this.settings.getValue<number>("returns.windowDays"),
    ]);
    if (!enabledTypes.includes(dto.type)) throw new BadRequestException({ code: "RETURN_TYPE_DISABLED", message: "This return type isn't available." });
    if (order.deliveredAt && Date.now() - order.deliveredAt.getTime() > windowDays * 24 * 60 * 60 * 1000) {
      throw new BadRequestException({ code: "RETURN_WINDOW_EXPIRED", message: `The ${windowDays}-day return window for this order has passed.` });
    }

    const itemsById = new Map(order.items.map((item) => [item.id, item]));
    for (const line of dto.items) {
      const item = itemsById.get(line.orderItemId);
      if (!item) throw new BadRequestException({ code: "INVALID_ITEM", message: "One of the items doesn't belong to this order." });
      if (line.quantity > item.quantity) throw new BadRequestException({ code: "INVALID_QUANTITY", message: `Only ${item.quantity} of "${item.sku}" were on this order.` });
      if (dto.type === "exchange" && !line.exchangeForVariantId) {
        throw new BadRequestException({ code: "EXCHANGE_VARIANT_REQUIRED", message: "Choose what to exchange each item for." });
      }
    }

    const record = await this.prisma.return.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        type: dto.type,
        status: "requested",
        reasonCode: dto.reasonCode,
        customerComment: dto.customerComment,
        mediaIds: dto.mediaIds,
        items: toJsonInput(dto.items) as Prisma.InputJsonValue,
      },
    });
    await this.prisma.orderEvent.create({ data: { orderId: order.id, type: "return", data: { returnId: record.id, type: dto.type, status: "requested" } } });
    return record;
  }

  /** §6.10 "Exchange stock is reserved at approval time" — and, since a reservation needs a real order to belong to, the linked exchange order is created right here too (not deferred to `resolve()`), so nothing is ever reserved without a row that accounts for it. */
  async approve(id: string, dto: ApproveReturnDto, actor: AuthenticatedStaff) {
    const record = await this.get(id);
    if (record.status !== "requested") throw new BadRequestException({ code: "INVALID_STATE", message: "Only a requested return can be approved." });

    let exchangeOrderId: string | null = null;
    if (record.type === "exchange") {
      exchangeOrderId = await this.createExchangeOrder(record);
    }

    const updated = await this.prisma.return.update({
      where: { id },
      data: { status: "approved", approvedBy: actor.id, approvedAt: new Date(), returnShippingPaidBy: dto.returnShippingPaidBy ?? undefined, exchangeOrderId },
    });
    await this.prisma.orderEvent.create({ data: { orderId: record.orderId, type: "return", data: { returnId: id, status: "approved" } } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "return.approve", entityType: "return", entityId: id, after: updated });
    return updated;
  }

  private async createExchangeOrder(record: Awaited<ReturnType<typeof this.get>>): Promise<string> {
    const items = record.items as unknown as ReturnItemRecord[];
    const originalItemsById = new Map(record.order.items.map((item) => [item.id, item]));
    const location = await this.stock.defaultLocation();
    const orderNumber = await this.orderNumbers.generate();

    const lines: { variantId: string; quantity: number; priceDiff: number; originalItem: (typeof record.order.items)[number] }[] = [];
    for (const line of items) {
      if (!line.exchangeForVariantId) continue;
      const original = originalItemsById.get(line.orderItemId);
      if (!original) continue;
      const newVariant = await this.prisma.productVariant.findUnique({ where: { id: line.exchangeForVariantId }, include: { product: { select: { title: true } } } });
      if (!newVariant) throw new BadRequestException({ code: "VARIANT_NOT_FOUND", message: "The requested exchange variant no longer exists." });
      lines.push({ variantId: newVariant.id, quantity: line.quantity, priceDiff: Math.max(0, newVariant.price - original.unitPrice), originalItem: original });
    }
    if (lines.length === 0) throw new BadRequestException({ code: "NO_EXCHANGE_ITEMS", message: "No exchange items on this return." });

    const total = lines.reduce((sum, l) => sum + l.priceDiff * l.quantity, 0);

    const order = await this.prisma.$transaction(async (tx) => {
      await this.stock.reserve(tx, location.id, lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })));
      const variants = await tx.productVariant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } }, include: { product: { select: { title: true } } } });
      const variantById = new Map(variants.map((v) => [v.id, v]));

      return await tx.order.create({
        data: {
          orderNumber,
          customerId: record.customerId,
          channel: "admin",
          status: "confirmed",
          subtotal: total,
          total,
          codAmount: 0,
          shippingAddress: toJsonInput(record.order.shippingAddress) as Prisma.InputJsonValue,
          billingContact: toJsonInput(record.order.billingContact) as Prisma.InputJsonValue,
          customerNote: `Exchange for return ${record.id}`,
          confirmedBy: null,
          confirmedAt: new Date(),
          items: {
            create: lines.map((l) => {
              const variant = variantById.get(l.variantId)!;
              return {
                variantId: l.variantId,
                locationId: location.id,
                title: toJsonInput(variant.product.title) as Prisma.InputJsonValue,
                sku: variant.sku,
                optionsSnapshot: toJsonInput({ optionValueIds: variant.optionValueIds }) as Prisma.InputJsonValue,
                unitPrice: l.priceDiff,
                quantity: l.quantity,
                lineTotal: l.priceDiff * l.quantity,
              };
            }),
          },
          events: { create: [{ type: "status_change", data: { from: null, to: "confirmed", reason: `Exchange for return ${record.id}` } }] },
        },
      });
    });

    return order.id;
  }

  async reject(id: string, dto: RejectReturnDto, actor: AuthenticatedStaff) {
    const record = await this.get(id);
    if (record.status !== "requested") throw new BadRequestException({ code: "INVALID_STATE", message: "Only a requested return can be rejected." });
    const updated = await this.prisma.return.update({ where: { id }, data: { status: "rejected", rejectedReason: dto.rejectedReason } });
    await this.prisma.orderEvent.create({ data: { orderId: record.orderId, type: "return", data: { returnId: id, status: "rejected", reason: dto.rejectedReason } } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "return.reject", entityType: "return", entityId: id, after: updated });
    return updated;
  }

  /** Bookkeeping only — no courier reverse-pickup API is implemented against real docs yet (§10.2), so this just records that a pickup was arranged (by the courier or the customer sending it in). */
  async schedulePickup(id: string, actor: AuthenticatedStaff) {
    const record = await this.get(id);
    if (record.status !== "approved") throw new BadRequestException({ code: "INVALID_STATE", message: "Only an approved return can have a pickup scheduled." });
    const updated = await this.prisma.return.update({ where: { id }, data: { status: "pickup_scheduled" } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "return.schedule_pickup", entityType: "return", entityId: id });
    return updated;
  }

  async receive(id: string, actor: AuthenticatedStaff) {
    const record = await this.get(id);
    if (record.status !== "approved" && record.status !== "pickup_scheduled") {
      throw new BadRequestException({ code: "INVALID_STATE", message: "This return hasn't been approved yet." });
    }
    const updated = await this.prisma.return.update({ where: { id }, data: { status: "received", receivedAt: new Date() } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "return.receive", entityType: "return", entityId: id });
    return updated;
  }

  async inspect(id: string, dto: InspectReturnDto, actor: AuthenticatedStaff) {
    const record = await this.get(id);
    if (record.status !== "received") throw new BadRequestException({ code: "INVALID_STATE", message: "This return hasn't been received yet." });

    const resultByItem = new Map(dto.items.map((i) => [i.orderItemId, i]));
    const items = (record.items as unknown as ReturnItemRecord[]).map((line) => {
      const result = resultByItem.get(line.orderItemId);
      return result ? { ...line, condition: result.passed ? ("pass" as const) : ("fail" as const), restock: result.restock } : line;
    });
    const originalItemsById = new Map(record.order.items.map((item) => [item.id, item]));

    await this.prisma.$transaction(async (tx) => {
      for (const line of items) {
        if (!line.restock) continue;
        const original = originalItemsById.get(line.orderItemId);
        if (!original) continue;
        await this.stock.restock(tx, original.locationId, [{ variantId: original.variantId, quantity: line.quantity }], { type: "return", id: record.id });
      }
      await tx.return.update({ where: { id }, data: { status: "inspected", items: toJsonInput(items) as Prisma.InputJsonValue } });
    });

    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "return.inspect", entityType: "return", entityId: id, after: { items } });
    return await this.get(id);
  }

  /** §6.10 resolution: "refund creates a refund record, store credit credits the wallet" — exchange's linked order already exists from `approve()`. */
  async resolve(id: string, actor: AuthenticatedStaff) {
    const record = await this.get(id);
    if (record.status !== "inspected") throw new BadRequestException({ code: "INVALID_STATE", message: "This return hasn't been inspected yet." });

    const items = record.items as unknown as ReturnItemRecord[];
    const originalItemsById = new Map(record.order.items.map((item) => [item.id, item]));
    const amount = items.reduce((sum, line) => {
      const original = originalItemsById.get(line.orderItemId);
      return original ? sum + original.unitPrice * line.quantity : sum;
    }, 0);

    await this.prisma.$transaction(async (tx) => {
      if (record.type === "refund" && amount > 0) {
        await tx.refund.create({ data: { orderId: record.orderId, returnId: record.id, amount, method: "original", status: "pending", reason: "Return approved" } });
      }
      if (record.type === "store_credit" && amount > 0 && record.customerId) {
        // §16 M16 — through the wallet ledger, idempotent per return.
        await this.storeCredit.creditInTx(tx, record.customerId, amount, { reason: "return", reference: record.id, orderId: record.orderId, note: "Return resolved as store credit", createdBy: actor.id });
      }
      await tx.return.update({ where: { id }, data: { status: "completed", completedAt: new Date(), resolution: toJsonInput({ type: record.type, amount }) as Prisma.InputJsonValue } });
      await tx.orderEvent.create({ data: { orderId: record.orderId, type: "return", data: { returnId: id, status: "completed", type: record.type, amount } } });
    });

    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "return.resolve", entityType: "return", entityId: id, after: { amount } });
    return await this.get(id);
  }
}
