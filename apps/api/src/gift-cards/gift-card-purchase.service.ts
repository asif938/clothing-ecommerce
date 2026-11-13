import { randomBytes, randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { validateGiftCardAmount, type GiftCardAmountRules } from "@clothing/shared/rewards";
import type { Env } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { PaymentsService, isOnlinePaymentMethod, type OnlinePaymentMethod } from "../payments/payments.service";
import { assertFeatureEnabled } from "../rewards-core/feature";
import { GiftCardsService } from "./gift-cards.service";
import type { PurchaseGiftCardDto } from "./dto";

const AMOUNT_MESSAGES = {
  NOT_WHOLE_TAKA: "Choose a whole taka amount.",
  NOT_A_PRESET: "Choose one of the listed amounts.",
  BELOW_MINIMUM: "That amount is below the minimum.",
  ABOVE_MAXIMUM: "That amount is above the maximum.",
} as const;

/**
 * Buying a digital gift card on the storefront (§7.3 `/gift-cards`, §16 M16).
 * A purchase is a `pending` card with no usable code yet, paid through the
 * normal payment drivers via `PaymentsService.initiateStandalone` (no order is
 * involved — there's nothing to ship). Once the gateway confirms, the card
 * gets its code, becomes active and the code is sent to the recipient.
 * Unpaid purchases are cancelled after `payment.timeoutMinutes`.
 */
@Injectable()
export class GiftCardPurchaseService {
  private readonly logger = new Logger(GiftCardPurchaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
    private readonly giftCards: GiftCardsService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  private async amountRules(): Promise<GiftCardAmountRules> {
    const [presets, allowCustom, minAmount, maxAmount] = await Promise.all([
      this.settings.getValue<number[]>("giftCards.presets"),
      this.settings.getValue<boolean>("giftCards.allowCustom"),
      this.settings.getValue<number>("giftCards.minAmount"),
      this.settings.getValue<number>("giftCards.maxAmount"),
    ]);
    return { presets, allowCustom, minAmount, maxAmount };
  }

  async options() {
    const [enabled, purchaseEnabled, rules, expiryMonths, methods] = await Promise.all([
      this.settings.getValue<boolean>("giftCards.enabled"),
      this.settings.getValue<boolean>("giftCards.purchaseEnabled"),
      this.amountRules(),
      this.settings.getValue<number>("giftCards.expiryMonths"),
      this.payments.availableMethods(),
    ]);
    return { enabled, purchaseEnabled: enabled && purchaseEnabled, ...rules, expiryMonths, paymentMethods: methods.filter((m) => m !== "cod") };
  }

  async purchase(dto: PurchaseGiftCardDto, customerId: string | null) {
    await assertFeatureEnabled(this.settings, "giftCards.enabled");
    if (!(await this.settings.getValue<boolean>("giftCards.purchaseEnabled"))) throw new BadRequestException({ code: "GIFT_CARD_SALES_OFF", message: "Gift cards aren't on sale right now." });
    const rejection = validateGiftCardAmount(dto.amount, await this.amountRules());
    if (rejection) throw new BadRequestException({ code: `GIFT_CARD_AMOUNT_${rejection}`, message: AMOUNT_MESSAGES[rejection] });
    const available = await this.payments.availableMethods();
    if (!available.includes(dto.paymentMethod) && dto.paymentMethod !== "mock") throw new BadRequestException({ code: "PAYMENT_METHOD_NOT_CONFIGURED", message: "This payment method isn't available." });

    const purchaseToken = randomBytes(18).toString("base64url");
    const timeoutMinutes = await this.settings.getValue<number>("payment.timeoutMinutes");
    const card = await this.prisma.giftCard.create({
      data: {
        // No code exists until payment succeeds; a unique placeholder keeps the column non-null.
        codeHash: `pending:${randomUUID()}`,
        last4: "----",
        initialAmount: dto.amount,
        balance: 0,
        status: "pending",
        source: "purchase",
        purchaserCustomerId: customerId,
        purchaserName: dto.purchaserName,
        purchaserPhone: dto.purchaserPhone,
        purchaserEmail: dto.purchaserEmail ?? null,
        recipientName: dto.recipientName,
        recipientPhone: dto.recipientPhone ?? null,
        recipientEmail: dto.recipientEmail ?? null,
        message: dto.message ?? null,
        locale: dto.locale,
        paymentMethod: dto.paymentMethod,
        paymentTimeoutAt: new Date(Date.now() + timeoutMinutes * 60_000),
        purchaseToken,
      },
    });

    const storefront = this.config.get("STOREFRONT_URL", { infer: true });
    const resultUrl = `${storefront}/${dto.locale}/gift-cards/result?token=${purchaseToken}`;
    try {
      const initiated = await this.payments.initiateStandalone(
        dto.paymentMethod,
        dto.amount,
        `GC-${card.id.slice(-8).toUpperCase()}`,
        { success: resultUrl, fail: `${resultUrl}&failed=1`, cancel: `${resultUrl}&cancelled=1` },
        { name: dto.purchaserName, phone: dto.purchaserPhone, email: dto.purchaserEmail },
      );
      await this.prisma.giftCard.update({ where: { id: card.id }, data: { paymentExternalRef: initiated.externalRef, providerInstanceId: initiated.providerInstanceId } });
      return { token: purchaseToken, redirectUrl: initiated.redirectUrl };
    } catch (error) {
      await this.prisma.giftCard.update({ where: { id: card.id }, data: { status: "cancelled", note: "Payment could not be started" } });
      throw error;
    }
  }

  /** The buyer's result page polls this. Never returns the code — it goes to the recipient. */
  async status(token: string, settleIfPending = true): Promise<{ status: string; amount: number; recipientName: string | null; sentTo: string | null; last4: string | null; delivered: boolean }> {
    const card = await this.prisma.giftCard.findUnique({
      where: { purchaseToken: token },
      select: { status: true, initialAmount: true, recipientName: true, recipientPhone: true, recipientEmail: true, last4: true, deliveredAt: true, paymentMethod: true, paymentExternalRef: true },
    });
    if (!card) throw new NotFoundException({ code: "PURCHASE_NOT_FOUND", message: "Purchase not found" });
    // A shopper back from the gateway shouldn't wait for the reconciliation sweep.
    if (settleIfPending && card.status === "pending" && card.paymentExternalRef && card.paymentMethod && isOnlinePaymentMethod(card.paymentMethod)) {
      await this.settle(card.paymentMethod, card.paymentExternalRef).catch((error: unknown) => this.logger.warn(`Gift card status check failed: ${error instanceof Error ? error.message : "Unknown error"}`));
      return this.status(token, false);
    }
    return {
      status: card.status,
      amount: card.initialAmount,
      recipientName: card.recipientName,
      sentTo: maskContact(card.recipientPhone ?? card.recipientEmail),
      last4: card.status === "active" || card.status === "redeemed" ? card.last4 : null,
      delivered: card.deliveredAt !== null,
    };
  }

  /**
   * Settles a purchase by its gateway reference: registered with
   * `PaymentsService` so gateway callbacks reach it, and used by the sweep.
   * Returns false when the reference isn't a gift card purchase.
   */
  async settle(method: OnlinePaymentMethod, externalRef: string, callbackPayload?: Record<string, unknown>): Promise<boolean> {
    const card = await this.prisma.giftCard.findFirst({ where: { paymentExternalRef: externalRef, paymentMethod: method } });
    if (!card) return false;
    // Settled already — idempotent. A purchase cancelled for timing out can still be paid late (the gateway took the money), so it's re-checked.
    if (card.status !== "pending" && !(card.status === "cancelled" && card.paidAt === null)) return true;

    const result = await this.payments.verifyStandalone(method, card.providerInstanceId, externalRef, callbackPayload);
    if (result.status === "succeeded") {
      if (result.amount !== undefined && result.amount !== card.initialAmount) this.logger.warn(`Gift card ${card.id} verified amount ${result.amount} differs from ${card.initialAmount}`);
      await this.activate(card.id, card.initialAmount);
    } else if (result.status === "failed" && card.status === "pending") {
      await this.prisma.giftCard.updateMany({ where: { id: card.id, status: "pending" }, data: { status: "cancelled", note: "Payment failed" } });
    }
    return true;
  }

  /** Paid → give the card its code, open its balance, send it. The `status: pending` guard makes a duplicate callback a no-op. */
  private async activate(id: string, amount: number): Promise<void> {
    const expiresAt = await this.giftCards.defaultExpiry();
    await this.giftCards.withFreshCode((fresh) =>
      this.prisma.$transaction(async (tx) => {
        // A payment that lands after the timeout still issues the card: the money was taken.
        const claimed = await tx.giftCard.updateMany({
          where: { id, status: { in: ["pending", "cancelled"] }, paidAt: null },
          data: { status: "active", balance: amount, codeHash: fresh.codeHash, last4: fresh.last4, paidAt: new Date(), paymentTimeoutAt: null, expiresAt },
        });
        if (claimed.count === 0) return;
        const card = await tx.giftCard.findUniqueOrThrow({ where: { id } });
        await tx.giftCardTransaction.create({ data: { giftCardId: id, amount, reason: "issue", reference: id, balanceAfter: amount, note: "Storefront purchase" } });
        await this.giftCards.enqueueDelivery(tx, card, fresh.code);
      }),
    );
    this.logger.log(`Gift card ${id} paid and issued`);
  }

  /** Re-checks pending purchases with the gateway (§10.1 reconciliation) and cancels ones that timed out unpaid. */
  async sweep(): Promise<{ settled: number; cancelled: number }> {
    const stale = await this.prisma.giftCard.findMany({
      where: { status: "pending", paymentExternalRef: { not: null }, updatedAt: { lte: new Date(Date.now() - 2 * 60_000) } },
      select: { id: true, paymentMethod: true, paymentExternalRef: true },
      take: 100,
    });
    let settled = 0;
    for (const card of stale) {
      if (!card.paymentMethod || !card.paymentExternalRef || !isOnlinePaymentMethod(card.paymentMethod)) continue;
      try {
        await this.settle(card.paymentMethod, card.paymentExternalRef);
        settled += 1;
      } catch (error) {
        this.logger.warn(`Gift card ${card.id} reconciliation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    const expired = await this.prisma.giftCard.updateMany({ where: { status: "pending", paymentTimeoutAt: { lte: new Date() } }, data: { status: "cancelled", note: "Not paid in time" } });
    return { settled, cancelled: expired.count };
  }
}

function maskContact(value: string | null): string | null {
  if (!value) return null;
  if (value.includes("@")) {
    const [user, domain] = value.split("@");
    return `${(user ?? "").slice(0, 2)}•••@${domain ?? ""}`;
  }
  return `•••${value.slice(-3)}`;
}
