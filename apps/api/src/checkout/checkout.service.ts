import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { formatTakaFromPoisha } from "@clothing/shared/notifications";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { StaffNotificationsService } from "../notifications/staff-notifications.service";
import { TrackingService } from "../tracking/tracking.service";
import { SettingsService } from "../settings/settings.service";
import type { CartIdentity } from "../cart/cart.service";
import { CartService } from "../cart/cart.service";
import { CartPricingService } from "../cart/cart-pricing.service";
import { DiscountsService } from "../discounts/discounts.service";
import { FlashSalesService } from "../discounts/flash-sales.service";
import { RiskScoringService } from "../risk/risk-scoring.service";
import { BlocklistService } from "../blocklist/blocklist.service";
import { PaymentRulesService } from "../payment-rules/payment-rules.service";
import { PaymentsService, type OnlinePaymentMethod } from "../payments/payments.service";
import { OtpService } from "../customer-auth/otp.service";
import { CaptchaProvidersService } from "./captcha-providers.service";
import { StockReservationService } from "./stock-reservation.service";
import { OrderNumberService } from "./order-number.service";
import type { PlaceOrderDto } from "./dto";

const ORDER_WITH_PAYMENTS_INCLUDE = { items: true, payments: true } as const;
type OrderWithPayments = Prisma.OrderGetPayload<{ include: typeof ORDER_WITH_PAYMENTS_INCLUDE }>;

export interface PlaceOrderRequestContext {
  identity: CartIdentity;
  idempotencyKey: string;
  ip: string | null;
  userAgent: string | null;
}

/**
 * Order placement (docs/PROJECT_SPEC.md §6.3, §6.5-§6.8, §7.5) — the one
 * place that turns a priced cart into a real `orders` row. Re-runs the
 * full pricing pipeline server-side (golden rule 6: never trust a client
 * total) and only then reserves stock atomically (§6.7) inside the same
 * transaction that creates the order, so the M5 acceptance scenario ("two
 * buyers race for the last unit: exactly one order succeeds") holds:
 * whichever request's `StockReservationService.reserve()` call loses the
 * race throws, its transaction rolls back, and no half-created order is
 * left behind.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly cart: CartService,
    private readonly pricing: CartPricingService,
    private readonly discounts: DiscountsService,
    private readonly flashSales: FlashSalesService,
    private readonly riskScoring: RiskScoringService,
    private readonly blocklist: BlocklistService,
    private readonly paymentRules: PaymentRulesService,
    private readonly payments: PaymentsService,
    private readonly otp: OtpService,
    private readonly captcha: CaptchaProvidersService,
    private readonly stock: StockReservationService,
    private readonly orderNumbers: OrderNumberService,
    private readonly notifications: NotificationsService,
    private readonly staffNotifications: StaffNotificationsService,
    private readonly tracking: TrackingService,
  ) {}

  async placeOrder(dto: PlaceOrderDto, requestContext: PlaceOrderRequestContext) {
    const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: requestContext.idempotencyKey }, include: ORDER_WITH_PAYMENTS_INCLUDE });
    if (existing) return this.buildReplayResponse(existing);

    const cartRow = await this.cart.getOrCreateActiveCart(requestContext.identity);
    if (cartRow.items.length === 0) throw new BadRequestException({ code: "EMPTY_CART", message: "Your cart is empty." });
    if (!cartRow.divisionId || !cartRow.districtId || !cartRow.areaId || !cartRow.addressLine) {
      throw new BadRequestException({ code: "ADDRESS_REQUIRED", message: "Please add a delivery address." });
    }
    if (!cartRow.contactName || !cartRow.contactPhone) {
      throw new BadRequestException({ code: "CONTACT_REQUIRED", message: "Please add a contact name and phone number." });
    }

    const termsRequired = await this.settings.getValue<boolean>("checkout.termsCheckboxEnabled");
    if (termsRequired && !dto.termsAccepted) throw new BadRequestException({ code: "TERMS_NOT_ACCEPTED", message: "Please accept the terms to continue." });

    const customer = requestContext.identity.customerId ? await this.prisma.customer.findUnique({ where: { id: requestContext.identity.customerId } }) : null;
    const isFirstOrder = !customer || customer.ordersCount === 0;

    const quote = await this.pricing.price(cartRow, {
      customerId: requestContext.identity.customerId,
      phone: cartRow.contactPhone,
      isFirstOrder,
      channel: "web",
      paymentMethod: dto.paymentMethod,
    });
    const priceableLines = quote.lines.filter((l) => l.quantity > 0);
    if (priceableLines.length === 0) throw new BadRequestException({ code: "EMPTY_CART", message: "Nothing in your cart is currently available." });
    if (quote.shippingBlockedMessage) throw new BadRequestException({ code: "NO_SHIPPING_ZONE", message: quote.shippingBlockedMessage });

    const otpRequiredSetting = await this.settings.getValue<boolean>("checkout.otpRequired");
    let otpVerified = false;
    if (otpRequiredSetting || dto.otpCode) {
      if (!dto.otpCode) throw new BadRequestException({ code: "OTP_REQUIRED", message: "Please verify your phone number with the code we sent." });
      otpVerified = await this.otp.verify(cartRow.contactPhone, "checkout", dto.otpCode);
      if (!otpVerified) throw new BadRequestException({ code: "OTP_INCORRECT", message: "Incorrect verification code." });
    }

    const risk = await this.riskScoring.score({
      customerId: requestContext.identity.customerId,
      phone: cartRow.contactPhone,
      ip: requestContext.ip,
      deviceId: dto.deviceId ?? null,
      orderTotal: quote.total,
      recipientName: cartRow.contactName,
      addressLine: cartRow.addressLine,
      otpVerified,
    });
    const phoneBlocked = await this.blocklist.findMatch({ phone: cartRow.contactPhone, ip: requestContext.ip, device: dto.deviceId });

    const outcome = await this.paymentRules.evaluate({ ...quote.ruleContextBase, riskLevel: risk.level, riskScore: risk.score, phoneBlocked });
    if (outcome.blocked) throw new BadRequestException({ code: "ORDER_BLOCKED", message: outcome.blocked });
    if (outcome.disabledMethods.has(dto.paymentMethod)) {
      throw new BadRequestException({ code: "PAYMENT_METHOD_DISABLED", message: "This payment method isn't available for this order." });
    }
    if (outcome.otpRequired && !otpVerified) {
      throw new BadRequestException({ code: "OTP_REQUIRED", message: "Please verify your phone number with the code we sent." });
    }

    const turnstileEnabled = await this.settings.getValue<boolean>("checkout.turnstileEnabled");
    if (turnstileEnabled) {
      if (!dto.turnstileToken) throw new BadRequestException({ code: "CAPTCHA_REQUIRED", message: "Captcha verification is required." });
      const driver = await this.captcha.resolveActiveDriver();
      const result = await driver.verify(dto.turnstileToken, requestContext.ip ?? undefined);
      if (!result.success) throw new BadRequestException({ code: "CAPTCHA_FAILED", message: "Captcha verification failed, please try again." });
    }

    const advanceAmount = CartPricingService.computeAdvanceAmount(outcome.advanceRequired, quote.total, quote.shippingFee);
    const needsOnlinePayment = dto.paymentMethod !== "cod" || advanceAmount > 0;
    const paymentPurpose: "full" | "advance" = dto.paymentMethod === "cod" ? "advance" : "full";
    const onlineMethodForPayment: OnlinePaymentMethod = dto.paymentMethod === "cod" ? (dto.advanceMethod as OnlinePaymentMethod) : (dto.paymentMethod as OnlinePaymentMethod);
    const onlineAmount = paymentPurpose === "advance" ? advanceAmount : quote.total;

    const timeoutMinutes = await this.settings.getValue<number>("payment.timeoutMinutes");
    const initialStatus = needsOnlinePayment ? "pending_payment" : "pending";
    const holdHighRisk = await this.settings.getValue<boolean>("risk.holdHighRisk");
    const finalStatus = !needsOnlinePayment && risk.level === "high" && holdHighRisk ? "on_hold" : initialStatus;

    const stockLines = priceableLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
    const location = await this.stock.defaultLocation();
    const orderNumber = await this.orderNumbers.generate();
    // §6.6 duplicate detection — checked against orders that already exist, before this one is created.
    const possibleDuplicateOrderIds = await this.riskScoring.findPossibleDuplicates(cartRow.contactPhone, priceableLines.map((l) => l.variantId));
    const notificationCommonVariables = await this.notifications.commonVariables();

    const discountAllocatedByVariant = new Map<string, number>();
    for (const applied of quote.discounts.applied) {
      for (const [variantId, amount] of applied.allocations) {
        discountAllocatedByVariant.set(variantId, (discountAllocatedByVariant.get(variantId) ?? 0) + amount);
      }
    }

    const order = await this.prisma.$transaction(async (tx) => {
      await this.stock.reserve(tx, location.id, stockLines);

      const created = await tx.order.create({
        data: {
          orderNumber,
          customerId: requestContext.identity.customerId,
          channel: "web",
          status: finalStatus,
          subtotal: quote.subtotal,
          discountTotal: quote.discounts.totalDiscount,
          shippingFee: quote.shippingFee,
          shippingDiscount: quote.shippingDiscount,
          advanceRequired: advanceAmount,
          total: quote.total,
          codAmount: dto.paymentMethod === "cod" ? Math.max(0, quote.total - advanceAmount) : 0,
          totalWeightGrams: quote.totalWeightGrams,
          shippingAddress: toJson({
            recipientName: cartRow.contactName,
            phone: cartRow.contactPhone,
            divisionId: cartRow.divisionId,
            districtId: cartRow.districtId,
            areaId: cartRow.areaId,
            addressLine: cartRow.addressLine,
            landmark: cartRow.landmark,
          }),
          billingContact: toJson({ name: cartRow.contactName, phone: cartRow.contactPhone, email: cartRow.contactEmail }),
          customerNote: cartRow.customerNote,
          riskScore: risk.score,
          riskReasonCodes: risk.reasonCodes,
          riskLevel: risk.level,
          requiresReview: outcome.manualReviewRequired,
          utmSource: dto.utmSource ?? null,
          ip: requestContext.ip,
          userAgent: requestContext.userAgent,
          deviceId: dto.deviceId ?? null,
          idempotencyKey: requestContext.idempotencyKey,
          paymentTimeoutAt: needsOnlinePayment ? new Date(Date.now() + timeoutMinutes * 60 * 1000) : null,
          possibleDuplicateOrderIds,
          // §10.5/§13.3 — shared with the client pixel's own Purchase event id for platform-side dedup; generated server-side when the client didn't send one (e.g. tracking scripts never loaded).
          trackingEventId: dto.trackingEventId ?? randomUUID(),
          items: {
            create: priceableLines.map((line) => ({
              variantId: line.variantId,
              locationId: location.id,
              title: toJson(line.title),
              sku: line.sku,
              optionsSnapshot: toJson({ optionValueIds: line.optionValueIds }),
              imageUrl: line.imageUrl,
              unitPrice: line.unitPrice,
              compareAtPrice: line.compareAtPrice,
              quantity: line.quantity,
              discountAllocated: discountAllocatedByVariant.get(line.variantId) ?? 0,
              lineTotal: line.lineTotal,
            })),
          },
          discounts: {
            create: quote.discounts.applied.map((a) => ({ discountId: a.discountId, code: a.code, type: a.valueType, amount: a.amount, allocation: toJson(Object.fromEntries(a.allocations)) })),
          },
          events: { create: [{ type: "status_change", data: { from: null, to: finalStatus } }] },
        },
        include: { items: true, payments: true },
      });

      for (const line of priceableLines) {
        if (line.flashSaleItemId) await this.flashSales.recordSold(line.flashSaleItemId, line.quantity);
      }

      await this.notifications.enqueue(tx, {
        event: "order_placed",
        recipientType: requestContext.identity.customerId ? "customer" : "guest",
        recipientId: requestContext.identity.customerId ?? null,
        locale: cartRow.locale,
        contacts: { sms: cartRow.contactPhone, whatsapp: cartRow.contactPhone, email: cartRow.contactEmail ?? null },
        variables: {
          ...notificationCommonVariables,
          customer_name: cartRow.contactName,
          order_number: created.orderNumber,
          order_total: formatTakaFromPoisha(created.total),
          cod_amount: formatTakaFromPoisha(created.codAmount),
        },
        related: { type: "order", id: created.id },
      });

      return created;
    });

    await this.staffNotifications.notifyNewOrder(order);

    const purchaseEventTiming = await this.settings.getValue<"placement" | "confirmation">("tracking.purchaseEventTiming");
    if (purchaseEventTiming === "placement" && order.trackingEventId) {
      await this.tracking.recordPurchase({
        eventId: order.trackingEventId,
        orderId: order.id,
        total: order.total,
        currency: order.currency,
        items: order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitPrice: i.unitPrice })),
        userData: { phone: cartRow.contactPhone, email: cartRow.contactEmail, clientIp: requestContext.ip, userAgent: requestContext.userAgent, fbc: dto.fbc, fbp: dto.fbp },
        sourceUrl: dto.sourceUrl,
      });
    }

    for (const applied of quote.discounts.applied) {
      await this.discounts.recordUsage(applied.discountId, order.id, requestContext.identity.customerId, cartRow.contactPhone, applied.amount, applied.code);
    }
    // Symmetric: the orders found above don't yet list this new order as one of their duplicates.
    for (const otherId of possibleDuplicateOrderIds) {
      await this.prisma.order.update({ where: { id: otherId }, data: { possibleDuplicateOrderIds: { push: order.id } } });
    }
    await this.cart.markConverted(cartRow.id);
    if (requestContext.identity.customerId) {
      await this.prisma.customer.update({ where: { id: requestContext.identity.customerId }, data: { ordersCount: { increment: 1 }, totalSpent: { increment: order.total } } });
    }

    let redirectUrl: string | null = null;
    if (needsOnlinePayment) {
      const returnUrls = this.buildReturnUrls(order.id);
      const initiated = await this.payments.initiate(
        order.id,
        onlineMethodForPayment,
        paymentPurpose,
        onlineAmount,
        returnUrls,
        { name: cartRow.contactName, phone: cartRow.contactPhone, email: cartRow.contactEmail ?? undefined },
        order.orderNumber,
      );
      redirectUrl = initiated.redirectUrl;
    }

    return { order, redirectUrl, advanceAmount, codAmount: order.codAmount, replay: false, warnings: quote.warnings };
  }

  private buildReturnUrls(orderId: string): { success: string; fail: string; cancel: string } {
    // STOREFRONT_URL is validated at bootstrap (env.schema.ts); read directly via process.env here
    // rather than threading ConfigService through just for this one string.
    const storefrontUrl = process.env.STOREFRONT_URL ?? "";
    return {
      success: `${storefrontUrl}/checkout/success?orderId=${orderId}`,
      fail: `${storefrontUrl}/checkout/failed?orderId=${orderId}`,
      cancel: `${storefrontUrl}/checkout?orderId=${orderId}&cancelled=1`,
    };
  }

  /** §11.1 "Idempotency-Key header required on place-order" — a retried request with the same key gets back the order that was actually created, never a second one. */
  private buildReplayResponse(order: OrderWithPayments) {
    return { order, redirectUrl: null, advanceAmount: order.advanceRequired, codAmount: order.codAmount, replay: true, warnings: [] as string[] };
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
