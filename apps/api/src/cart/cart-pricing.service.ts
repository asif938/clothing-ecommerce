import { Injectable } from "@nestjs/common";
import { Prisma, type Media } from "@clothing/db";
import { getMediaUrl } from "@clothing/shared/media";
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
}

export interface CartPricingContext {
  customerId: string | null;
  phone: string | null;
  isFirstOrder: boolean;
  channel: string;
  paymentMethod: string | null;
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
  paymentRules: PaymentRulesOutcome;
  total: number;
  codAmount: number;
  freeDeliveryRemaining: number | null;
  warnings: string[];
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

      const inventory = await this.prisma.inventoryLevel.aggregate({
        where: { variantId: variant.id, location: { fulfillsOnline: true } },
        _sum: { available: true },
      });
      const available = inventory._sum.available ?? 0;
      const quantity = Math.max(0, Math.min(item.quantity, available));
      const clamped = quantity < item.quantity;
      if (clamped) warnings.push(`Only ${available} of "${titleToString(product.title)}" is in stock — quantity adjusted.`);

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
      });
    }

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
    const total = subtotalAfterDiscounts + shippingFee - shippingDiscount + giftWrapFee;

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
      paymentRules: paymentRulesOutcome,
      total,
      codAmount: total,
      freeDeliveryRemaining,
      warnings,
      ruleContextBase,
    };
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

function titleToString(title: unknown): string {
  const localized = title as { bn?: string; en?: string } | null;
  return localized?.en ?? localized?.bn ?? "Item";
}
