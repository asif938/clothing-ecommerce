import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { SettingsService } from "../settings/settings.service";
import { CustomersService } from "../customers/customers.service";
import { LocationsService } from "../locations/locations.service";
import { ShippingService } from "../shipping/shipping.service";
import { StockReservationService } from "../checkout/stock-reservation.service";
import { OrderNumberService } from "../checkout/order-number.service";
import { RiskScoringService } from "../risk/risk-scoring.service";
import type { CreateManualOrderDto } from "./dto";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * §8.2 "Create manual order (phone/Messenger/WhatsApp orders)". Deliberately
 * simpler than the storefront checkout pipeline (`CheckoutService`): no
 * automatic/code discount engine, no OTP/Turnstile/payment-rules gating —
 * the staff member on the phone already knows who they're talking to and
 * which payment was agreed. Staff can apply one flat discount amount, or
 * adjust the order afterward with `OrderEditService` (documented in
 * docs/DECISIONS.md).
 */
@Injectable()
export class ManualOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly customers: CustomersService,
    private readonly locations: LocationsService,
    private readonly shipping: ShippingService,
    private readonly stock: StockReservationService,
    private readonly orderNumbers: OrderNumberService,
    private readonly riskScoring: RiskScoringService,
  ) {}

  async create(dto: CreateManualOrderDto, actor: AuthenticatedStaff) {
    await this.locations.validateChain(dto.divisionId, dto.districtId, dto.areaId);

    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: variantIds }, isActive: true }, include: { product: { select: { title: true, weightGramsDefault: true } } } });
    const variantById = new Map(variants.map((v) => [v.id, v]));
    if (variantById.size !== new Set(variantIds).size) throw new BadRequestException({ code: "VARIANT_NOT_FOUND", message: "One or more products are no longer available." });

    const defaultItemWeight = await this.settings.getValue<number>("shipping.defaultItemWeightGrams");
    const lines = dto.items.map((item) => {
      const variant = variantById.get(item.variantId)!;
      return {
        variantId: variant.id,
        quantity: item.quantity,
        unitPrice: variant.price,
        compareAtPrice: variant.compareAtPrice,
        sku: variant.sku,
        title: variant.product.title,
        weightGrams: variant.weightGrams ?? variant.product.weightGramsDefault ?? defaultItemWeight,
        lineTotal: variant.price * item.quantity,
      };
    });

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const totalWeightGrams = lines.reduce((sum, l) => sum + l.weightGrams * l.quantity, 0);
    const area = await this.locations.resolveArea(dto.areaId);
    const shippingQuote = await this.shipping.calculateFee(
      { divisionId: dto.divisionId, districtId: dto.districtId, areaId: dto.areaId, isDhakaCity: area?.isDhakaCity ?? false },
      totalWeightGrams,
      subtotal,
      dto.shippingRateId,
    );
    const discountTotal = Math.min(dto.manualDiscountAmount, subtotal);
    const total = subtotal - discountTotal + shippingQuote.fee;

    const customer = await this.customers.findOrCreateByPhone(dto.customerPhone);
    const risk = await this.riskScoring.score({
      customerId: customer.id,
      phone: dto.customerPhone,
      ip: null,
      deviceId: null,
      orderTotal: total,
      recipientName: dto.customerName,
      addressLine: dto.addressLine,
      otpVerified: true, // staff identity-checked the customer on the call — not an OTP, but functionally equivalent for risk purposes
    });

    const location = await this.stock.defaultLocation();
    const orderNumber = await this.orderNumbers.generate();
    const isPaid = dto.payment.status === "already_paid";
    const codAmount = isPaid ? 0 : total;

    const order = await this.prisma.$transaction(async (tx) => {
      await this.stock.reserve(tx, location.id, lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })));

      return await tx.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          channel: dto.channel,
          status: "pending",
          subtotal,
          discountTotal,
          shippingFee: shippingQuote.fee,
          total,
          paidTotal: isPaid ? total : 0,
          paymentStatus: isPaid ? "paid" : "unpaid",
          codAmount,
          totalWeightGrams,
          shippingAddress: toJson({ recipientName: dto.customerName, phone: dto.customerPhone, divisionId: dto.divisionId, districtId: dto.districtId, areaId: dto.areaId, addressLine: dto.addressLine, landmark: dto.landmark }),
          billingContact: toJson({ name: dto.customerName, phone: dto.customerPhone, email: dto.customerEmail }),
          customerNote: dto.customerNote,
          riskScore: risk.score,
          riskReasonCodes: risk.reasonCodes,
          riskLevel: risk.level,
          items: {
            create: lines.map((l) => ({
              variantId: l.variantId,
              locationId: location.id,
              title: toJson(l.title),
              sku: l.sku,
              optionsSnapshot: toJson({}),
              unitPrice: l.unitPrice,
              compareAtPrice: l.compareAtPrice,
              quantity: l.quantity,
              lineTotal: l.lineTotal,
            })),
          },
          payments: isPaid && dto.payment.status === "already_paid" ? { create: [{ method: dto.payment.method, purpose: "full", amount: total, status: "succeeded", externalRef: dto.payment.externalRef, paidAt: new Date() }] } : undefined,
          events: { create: [{ type: "status_change", data: { from: null, to: "pending", channel: dto.channel }, actor: { type: "staff", id: actor.id } }] },
        },
        include: { items: true, payments: true },
      });
    });

    await this.prisma.customer.update({ where: { id: customer.id }, data: { ordersCount: { increment: 1 }, totalSpent: { increment: total } } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "order.manual_create", entityType: "order", entityId: order.id, after: order });
    return order;
  }
}
