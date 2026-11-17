import { Injectable } from "@nestjs/common";
import { Prisma, type Media } from "@clothing/db";
import { getMediaUrl } from "@clothing/shared/media";
import { matchBundles, type BundleDefinition } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { MediaProvidersService } from "../media/media-providers.service";
import type { MediaVariantMap } from "../media/media-driver";
import { ShippingService } from "../shipping/shipping.service";
import { DiscountsService, type CartLineForPricing, type EvaluateResult } from "../discounts/discounts.service";
import { FlashSalesService } from "../discounts/flash-sales.service";
import { PaymentRulesService } from "../payment-rules/payment-rules.service";
import type { AdvanceRequirement, PaymentRulesOutcome, RuleContext } from "../payment-rules/payment-rules-engine";
import { LocationsService } from "../locations/locations.service";
import { computeRedemption, type RedemptionRejection } from "@clothing/shared/marketing";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { allocateCredits, giftCardUnusableReason, type GiftCardUnusableReason } from "@clothing/shared/rewards";
import { ReferralsService, type CartReferralQuote } from "../referrals/referrals.service";

const CART_IMAGE_WIDTH = 300;

export interface PricedLine {
  cartItemId: string;
  variantId: string;
  productId: string;
  title: unknown;
  imageUrl: string | null;
  sku: string;
  optionValueIds: string[];
  unitPrice: number;
  compareAtPrice: number | null;
  requestedQuantity: number;
  quantity: number;
  available: number;
  lineTotal: number;
  clamped: boolean;
  unavailable: boolean;
  priceChanged: boolean;
  flashSaleItemId: string | null;
  weightGrams: number;
  /** §16 M10 — bypasses the normal on-hand clamp (see the per-item loop below); `preorderReleaseDate` lets the storefront show "ships around …". */
  isPreorder: boolean;
  preorderReleaseDate: Date | null;
  /** §16 M10 — poisha already subtracted from `lineTotal` by a matched shop-the-look bundle; 0 when none applies. */
  bundleDiscount: number;
}

export interface AppliedBundle {
  bundleProductId: string;
  title: unknown;
  discountAmount: number;
}

export interface CartPricingContext {
  customerId: string | null;
  phone: string | null;
  isFirstOrder: boolean;
  channel: string;
  paymentMethod: string | null;
  /** §16 M14 — the shopper's `anonymous_id`; gates discounts that belong to a running offer A/B test. */
  visitorId?: string | null;
}

/** §6.3 step 9 — loyalty points on this cart (only for a logged-in customer while the program is enabled). */
export interface CartLoyaltyQuote {
  enabled: boolean;
  balance: number;
  requestedPoints: number;
  pointsApplied: number;
  discount: number;
  maxUsablePoints: number;
  pointValue: number;
  minRedeemPoints: number;
  rejection: RedemptionRejection | null;
}

/** §16 M16 — a gift card applied to the cart (a tender, not a discount). */
export interface CartGiftCardQuote {
  giftCardId: string;
  last4: string;
  balance: number;
  applied: number;
  rejection: GiftCardUnusableReason | null;
}

/** §16 M16 — the customer's wallet on this cart (logged-in customers while store credit is enabled). */
export interface CartStoreCreditQuote {
  balance: number;
  use: boolean;
  applied: number;
}

export interface CartPricingResult {
  lines: PricedLine[];
  subtotal: number;
  discounts: EvaluateResult;
  subtotalAfterDiscounts: number;
  totalWeightGrams: number;
  shippingFee: number;
  shippingZoneId: string | null;
  shippingRateId: string | null;
  shippingEstimateDaysMin: number | null;
  shippingEstimateDaysMax: number | null;
  shippingBlockedMessage: string | null;
  shippingDiscount: number;
  giftWrapFee: number;
  loyalty: CartLoyaltyQuote | null;
  /** §16 M16 — the referee's first-order discount (subtracted from `total`). */
  referral: CartReferralQuote | null;
  giftCard: CartGiftCardQuote | null;
  storeCredit: CartStoreCreditQuote | null;
  paymentRules: PaymentRulesOutcome;
  /** The order's value: goods after discounts + shipping − points. Gift card and store credit don't change it — they pay it. */
  total: number;
  /** What's left to pay by COD or online after gift card and store credit. */
  amountDue: number;
  codAmount: number;
  freeDeliveryRemaining: number | null;
  warnings: string[];
  appliedBundles: AppliedBundle[];
  /** Everything the payment-rules engine needs except risk/blocklist, which aren't known until order placement (§6.6) — `CheckoutService` re-evaluates with this base plus the real risk score. */
  ruleContextBase: Omit<RuleContext, "riskLevel" | "riskScore" | "phoneBlocked">;
}

/**
 * The cart pricing pipeline (docs/PROJECT_SPEC.md §6.3) — run server-side
 * on every cart change and again at order placement, never trusting client
 * totals (golden rule 6). Risk scoring (§6.6) is explicitly "computed at
 * order placement," so the payment-rules evaluation done here is a
 * best-effort *preview* (riskLevel/riskScore unavailable yet); checkout
 * placement re-evaluates payment rules with the real computed risk — see
 * docs/DECISIONS.md.
 */
@Injectable()
export class CartPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mediaProviders: MediaProvidersService,
    private readonly shipping: ShippingService,
    private readonly discounts: DiscountsService,
    private readonly flashSales: FlashSalesService,
    private readonly paymentRules: PaymentRulesService,
    private readonly locations: LocationsService,
    private readonly loyaltyService: LoyaltyService,
    private readonly referrals: ReferralsService,
  ) {}

  private async resolveImageUrl(media: Media | null): Promise<string | null> {
    if (!media) return null;
    const driver = await this.mediaProviders.resolveDriverForAsset(media);
    const ref = driver.toMediaRef({ ...media, variants: media.variants as MediaVariantMap | null });
    return getMediaUrl(ref, { width: CART_IMAGE_WIDTH });
  }

  async price(
    cart: Prisma.CartGetPayload<{ include: { items: { include: { variant: { include: { product: true } } } } } }>,
    context: CartPricingContext,
  ): Promise<CartPricingResult> {
    const warnings: string[] = [];
    const defaultItemWeight = await this.settings.getValue<number>("shipping.defaultItemWeightGrams");

    const lines: PricedLine[] = [];
    for (const item of cart.items) {
      const { variant } = item;
      const product = variant.product;
      if (!variant.isActive || product.status !== "active") {
        warnings.push(`"${titleToString(product.title)}" is no longer available and was removed from your cart.`);
        continue;
      }

      const flashSale = await this.flashSales.getActivePrice(variant.id);
      const unitPrice = flashSale?.price ?? variant.price;

      const isPreorder = product.productType === "preorder";
      let available: number;
      if (isPreorder) {
        // §16 M10 — preorders bypass the normal on-hand clamp entirely; a
        // configured `preorderLimit` caps total units ever sold across every
        // non-cancelled order instead (checked again, authoritatively, in
        // `CheckoutService` right before reservation).
        if (product.preorderLimit === null) {
          available = item.quantity;
        } else {
          const sold = await this.prisma.orderItem.aggregate({
            where: { variant: { productId: product.id }, order: { status: { notIn: ["cancelled"] } } },
            _sum: { quantity: true },
          });
          available = Math.max(0, product.preorderLimit - (sold._sum.quantity ?? 0));
        }
      } else {
        const inventory = await this.prisma.inventoryLevel.aggregate({
          where: { variantId: variant.id, location: { fulfillsOnline: true } },
          _sum: { available: true },
        });
        available = inventory._sum.available ?? 0;
      }
      const quantity = Math.max(0, Math.min(item.quantity, available));
      const clamped = quantity < item.quantity;
      if (clamped) {
        warnings.push(
          isPreorder
            ? `This preorder has reached its limit — only ${available} of "${titleToString(product.title)}" can be ordered.`
            : `Only ${available} of "${titleToString(product.title)}" is in stock — quantity adjusted.`,
        );
      }

      const firstMedia = await this.prisma.productMedia.findFirst({ where: { productId: product.id }, orderBy: { position: "asc" }, include: { media: true } });

      lines.push({
        cartItemId: item.id,
        variantId: variant.id,
        productId: product.id,
        title: product.title,
        imageUrl: await this.resolveImageUrl(firstMedia?.media ?? null),
        sku: variant.sku,
        optionValueIds: variant.optionValueIds,
        unitPrice,
        compareAtPrice: variant.compareAtPrice,
        requestedQuantity: item.quantity,
        quantity,
        available,
        lineTotal: unitPrice * quantity,
        clamped,
        unavailable: quantity === 0 && item.quantity > 0,
        priceChanged: item.addedPrice !== unitPrice,
        flashSaleItemId: flashSale?.itemId ?? null,
        weightGrams: variant.weightGrams ?? product.weightGramsDefault ?? defaultItemWeight,
        isPreorder,
        preorderReleaseDate: product.preorderReleaseDate,
        bundleDiscount: 0,
      });
    }

    const appliedBundles = await this.applyBundleDiscounts(lines);

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0);
    const totalWeightGrams = lines.reduce((sum, l) => sum + l.weightGrams * l.quantity, 0);

    const categoryIdsByProduct = await this.categoryIdsByProduct(lines.map((l) => l.productId));
    const tagsByProduct = await this.tagsByProduct(lines.map((l) => l.productId));
    const discountLines: CartLineForPricing[] = lines
      .filter((l) => l.quantity > 0)
      .map((l) => ({
        variantId: l.variantId,
        productId: l.productId,
        categoryIds: categoryIdsByProduct.get(l.productId) ?? [],
        tags: tagsByProduct.get(l.productId) ?? [],
        quantity: l.quantity,
        lineTotal: l.lineTotal,
        unitPrice: l.unitPrice,
        costPrice: null,
      }));

    const discountResult = await this.discounts.evaluate(
      discountLines,
      { subtotal, totalQty, isFirstOrder: context.isFirstOrder, channel: context.channel },
      cart.couponCodes,
      context.customerId,
      context.phone,
      context.visitorId ?? null,
    );
    const subtotalAfterDiscounts = Math.max(0, subtotal - discountResult.totalDiscount);

    let shippingFee = 0;
    let shippingZoneId: string | null = null;
    let shippingRateId: string | null = null;
    let shippingEstimateDaysMin: number | null = null;
    let shippingEstimateDaysMax: number | null = null;
    let shippingBlockedMessage: string | null = null;
    let isDhakaCity = false;
    const districtId = cart.districtId ?? "";
    const areaId = cart.areaId ?? "";

    if (cart.divisionId && cart.districtId && cart.areaId) {
      const area = await this.locations.resolveArea(cart.areaId);
      isDhakaCity = area?.isDhakaCity ?? false;
      try {
        const fee = await this.shipping.calculateFee(
          { divisionId: cart.divisionId, districtId: cart.districtId, areaId: cart.areaId, isDhakaCity },
          totalWeightGrams,
          subtotalAfterDiscounts,
          cart.selectedShippingRateId,
        );
        shippingFee = fee.fee;
        shippingZoneId = fee.zoneId;
        shippingRateId = fee.rateId;
        shippingEstimateDaysMin = fee.estimatedDaysMin;
        shippingEstimateDaysMax = fee.estimatedDaysMax;
      } catch (error) {
        shippingBlockedMessage = error instanceof Error ? error.message : "We don't currently deliver to this area.";
      }
    }

    const shippingDiscount = discountResult.freeShipping ? shippingFee : 0;
    const giftWrapFee = cart.giftWrap ? await this.settings.getValue<number>("checkout.giftWrapFee") : 0;
    const referral = await this.referrals.quote(cart.referralCode, {
      customerId: context.customerId,
      phone: cart.contactPhone ?? context.phone,
      goodsTotal: subtotalAfterDiscounts,
      couponApplied: discountResult.applied.some((a) => a.code !== null),
    });
    const referralDiscount = referral && !referral.rejection ? referral.discount : 0;
    const goodsTotal = Math.max(0, subtotalAfterDiscounts - referralDiscount);
    const loyalty = await this.quoteLoyalty(cart.redeemPoints, context.customerId, goodsTotal);
    const total = goodsTotal + shippingFee - shippingDiscount + giftWrapFee - (loyalty?.discount ?? 0);
    const { giftCard, storeCredit, amountDue } = await this.quoteTenders(cart.giftCardId, cart.useStoreCredit, context.customerId, total);
    if (referral?.rejection) warnings.push(referralMessage(referral.rejection));
    if (giftCard?.rejection) warnings.push(giftCard.rejection === "EXPIRED" ? "Your gift card has expired and was not applied." : "Your gift card can no longer be used and was not applied.");

    const ruleContextBase: Omit<RuleContext, "riskLevel" | "riskScore" | "phoneBlocked"> = {
      total,
      subtotal: subtotalAfterDiscounts,
      itemCount: totalQty,
      zoneId: shippingZoneId,
      districtId,
      areaId,
      isDhakaCity,
      customerType: context.customerId ? (context.isFirstOrder ? "new" : "returning") : "guest",
      ordersCount: 0,
      deliveredCount: 0,
      rejectionRate: 0,
      customerTags: [],
      categoryIds: [...new Set(lines.flatMap((l) => categoryIdsByProduct.get(l.productId) ?? []))],
      productIds: lines.map((l) => l.productId),
      cartTags: [...new Set(lines.flatMap((l) => tagsByProduct.get(l.productId) ?? []))],
      hasFlashSaleItem: lines.some((l) => l.flashSaleItemId !== null),
      paymentMethod: context.paymentMethod,
      now: new Date(),
      timeZone: await this.settings.getValue<string>("locale.timezone"),
      utmSource: (cart.utm as { source?: string } | null)?.source ?? null,
    };
    const paymentRulesOutcome = await this.paymentRules.evaluate({ ...ruleContextBase, riskLevel: null, riskScore: null, phoneBlocked: false });

    const freeDeliveryThreshold = await this.settings.getValue<number | null>("shipping.freeDeliveryThreshold");
    const freeDeliveryRemaining = freeDeliveryThreshold !== null && subtotalAfterDiscounts < freeDeliveryThreshold ? freeDeliveryThreshold - subtotalAfterDiscounts : null;

    if (paymentRulesOutcome.blocked) warnings.push(paymentRulesOutcome.blocked);
    warnings.push(...paymentRulesOutcome.messages);
    warnings.push(...discountResult.rejectedCodes.map((r) => r.message));

    return {
      lines,
      subtotal,
      discounts: discountResult,
      subtotalAfterDiscounts,
      totalWeightGrams,
      shippingFee,
      shippingZoneId,
      shippingRateId,
      shippingEstimateDaysMin,
      shippingEstimateDaysMax,
      shippingBlockedMessage,
      shippingDiscount,
      giftWrapFee,
      loyalty,
      referral,
      giftCard,
      storeCredit,
      paymentRules: paymentRulesOutcome,
      total,
      amountDue,
      codAmount: amountDue,
      freeDeliveryRemaining,
      warnings,
      appliedBundles,
      ruleContextBase,
    };
  }

  /** §6.3 step 9 / §16 M16 — gift card first, then the wallet, against the whole order (shipping included). */
  private async quoteTenders(giftCardId: string | null, useStoreCredit: boolean, customerId: string | null, total: number): Promise<{ giftCard: CartGiftCardQuote | null; storeCredit: CartStoreCreditQuote | null; amountDue: number }> {
    const [giftCardsOn, storeCreditOn] = await Promise.all([this.settings.getValue<boolean>("giftCards.enabled"), this.settings.getValue<boolean>("storeCredit.enabled")]);
    const card = giftCardsOn && giftCardId ? await this.prisma.giftCard.findUnique({ where: { id: giftCardId }, select: { id: true, last4: true, balance: true, status: true, expiresAt: true } }) : null;
    const rejection = card ? giftCardUnusableReason(card, new Date()) : null;
    const customer = storeCreditOn && customerId ? await this.prisma.customer.findUnique({ where: { id: customerId }, select: { storeCreditBalance: true } }) : null;
    const allocation = allocateCredits({
      amountDue: total,
      giftCardBalance: card && !rejection ? card.balance : 0,
      storeCreditBalance: customer?.storeCreditBalance ?? 0,
      useStoreCredit: useStoreCredit && customer !== null,
    });
    return {
      giftCard: card ? { giftCardId: card.id, last4: card.last4, balance: card.balance, applied: allocation.giftCard, rejection } : null,
      storeCredit: customer ? { balance: customer.storeCreditBalance, use: useStoreCredit, applied: allocation.storeCredit } : null,
      amountDue: allocation.remaining,
    };
  }

  /** Points only ever pay for goods (never shipping), capped by `loyalty.maxRedeemPercent` — see `computeRedemption`. */
  private async quoteLoyalty(requestedPoints: number, customerId: string | null, goodsTotal: number): Promise<CartLoyaltyQuote | null> {
    if (!customerId) return null;
    const settings = await this.loyaltyService.getSettings();
    if (!settings.enabled) return null;
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { pointsBalance: true } });
    const balance = customer?.pointsBalance ?? 0;
    const result = computeRedemption(requestedPoints, balance, goodsTotal, settings);
    return {
      enabled: true,
      balance,
      requestedPoints,
      pointsApplied: result.points,
      discount: result.discount,
      maxUsablePoints: result.maxUsablePoints,
      pointValue: settings.pointValue,
      minRedeemPoints: settings.minRedeemPoints,
      rejection: result.rejection,
    };
  }

  /**
   * §16 M10 — mutates `lines[*].lineTotal`/`bundleDiscount` in place and
   * returns what applied, purely so every downstream consumer (discount
   * engine, payment-rules context, the order's own line totals) just sees
   * an already-discounted `lineTotal` without having to know bundles
   * exist. Only bundle products whose components actually appear in this
   * cart are even queried, so an empty/unrelated cart costs nothing extra.
   */
  private async applyBundleDiscounts(lines: PricedLine[]): Promise<AppliedBundle[]> {
    const variantIds = lines.filter((l) => l.quantity > 0).map((l) => l.variantId);
    if (variantIds.length === 0) return [];

    const bundleProducts = await this.prisma.product.findMany({
      where: { productType: "bundle", status: "active", bundleDiscountType: { not: "none" }, bundleItems: { some: { componentVariantId: { in: variantIds } } } },
      include: { bundleItems: true },
    });
    if (bundleProducts.length === 0) return [];

    const definitions: BundleDefinition[] = bundleProducts.map((p) => ({
      bundleProductId: p.id,
      discountType: p.bundleDiscountType,
      discountValue: p.bundleDiscountValue ?? 0,
      components: p.bundleItems.map((item) => ({ variantId: item.componentVariantId, quantity: item.quantity })),
    }));
    const cartLines = lines.filter((l) => l.quantity > 0).map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice }));
    const applications = matchBundles(cartLines, definitions);
    if (applications.length === 0) return [];

    const lineByVariant = new Map(lines.map((l) => [l.variantId, l]));
    const titleByBundleId = new Map(bundleProducts.map((p) => [p.id, p.title]));
    const applied: AppliedBundle[] = [];
    for (const application of applications) {
      for (const [variantId, discount] of application.perVariantDiscount) {
        const line = lineByVariant.get(variantId);
        if (!line) continue;
        line.lineTotal = Math.max(0, line.lineTotal - discount);
        line.bundleDiscount += discount;
      }
      applied.push({ bundleProductId: application.bundleProductId, title: titleByBundleId.get(application.bundleProductId), discountAmount: application.totalDiscount });
    }
    return applied;
  }

  /** The caller-visible amount for whatever advance kind a payment rule required — delivery fee / fixed poisha / percent of total / the full total. */
  static computeAdvanceAmount(requirement: AdvanceRequirement | null, total: number, shippingFee: number): number {
    if (!requirement) return 0;
    switch (requirement.kind) {
      case "delivery_fee":
        return shippingFee;
      case "fixed":
        return Math.min(requirement.amount ?? 0, total);
      case "percent":
        return Math.round((total * (requirement.percent ?? 0)) / 100);
      case "full":
        return total;
    }
  }

  private async categoryIdsByProduct(productIds: string[]): Promise<Map<string, string[]>> {
    if (productIds.length === 0) return new Map();
    const [products, additional] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } }),
      this.prisma.productCategory.findMany({ where: { productId: { in: productIds } }, select: { productId: true, categoryId: true } }),
    ]);
    const map = new Map<string, string[]>();
    for (const p of products) map.set(p.id, p.categoryId ? [p.categoryId] : []);
    for (const a of additional) map.set(a.productId, [...(map.get(a.productId) ?? []), a.categoryId]);
    return map;
  }

  private async tagsByProduct(productIds: string[]): Promise<Map<string, string[]>> {
    if (productIds.length === 0) return new Map();
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, tags: true } });
    return new Map(products.map((p) => [p.id, p.tags]));
  }
}

function referralMessage(rejection: NonNullable<CartReferralQuote["rejection"]>): string {
  switch (rejection) {
    case "NOT_FIRST_ORDER":
    case "ALREADY_REFERRED":
      return "The referral discount is only for a first order.";
    case "SELF_REFERRAL":
      return "You can't use your own referral code.";
    case "COUPON_IN_USE":
      return "The referral discount can't be combined with a coupon.";
    case "BELOW_MINIMUM":
      return "Add a little more to your cart to get the referral discount.";
    default:
      return "That referral code isn't valid.";
  }
}

function titleToString(title: unknown): string {
  const localized = title as { bn?: string; en?: string } | null;
  return localized?.en ?? localized?.bn ?? "Item";
}
