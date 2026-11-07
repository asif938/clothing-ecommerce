/**
 * Shop-the-look bundle pricing (docs/PROJECT_SPEC.md §16 M10). A bundle
 * `Product` is never itself a cart line — `BundleItem` rows name its exact
 * component variants, and this applies live, in `CartPricingService`,
 * whenever a cart's own line items happen to cover a bundle's full set
 * (whether added via the PDP's one-click "add the look" or one at a time).
 * Money stays integer poisha throughout (golden rule 3); every rounding
 * remainder lands on the first component line so the sum of per-line
 * discounts always equals the bundle's own total discount exactly.
 */
export type BundleDiscountType = "none" | "percent" | "fixed_price";

export interface BundleComponent {
  variantId: string;
  quantity: number;
}

export interface BundleDefinition {
  bundleProductId: string;
  discountType: BundleDiscountType;
  /** Percent (1-100) for `percent`, poisha for `fixed_price`. Ignored for `none`. */
  discountValue: number;
  components: BundleComponent[];
}

export interface BundleCartLine {
  variantId: string;
  quantity: number;
  unitPrice: number;
}

export interface BundleApplication {
  bundleProductId: string;
  /** How many whole copies of the bundle the cart's quantities support. */
  multiplier: number;
  totalDiscount: number;
  /** Discount in poisha to subtract from each matched line's total, keyed by variantId. */
  perVariantDiscount: Map<string, number>;
}

/**
 * One bundle may apply more than once in a single cart (e.g. two of every
 * component). A bundle with any component not present in sufficient
 * quantity simply doesn't apply — no partial credit.
 */
export function matchBundles(cartLines: BundleCartLine[], bundles: BundleDefinition[]): BundleApplication[] {
  const lineByVariant = new Map(cartLines.map((l) => [l.variantId, l]));
  const applications: BundleApplication[] = [];

  for (const bundle of bundles) {
    if (bundle.discountType === "none" || bundle.components.length === 0) continue;

    let multiplier = Infinity;
    for (const component of bundle.components) {
      const line = lineByVariant.get(component.variantId);
      const available = line ? Math.floor(line.quantity / component.quantity) : 0;
      multiplier = Math.min(multiplier, available);
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) continue;

    const combinedUnitTotal = bundle.components.reduce((sum, c) => {
      const line = lineByVariant.get(c.variantId)!;
      return sum + line.unitPrice * c.quantity;
    }, 0);

    let totalDiscount: number;
    if (bundle.discountType === "percent") {
      totalDiscount = Math.round((combinedUnitTotal * multiplier * bundle.discountValue) / 100);
    } else {
      // fixed_price: discountValue is the bundle's total price for ONE copy.
      totalDiscount = Math.max(0, combinedUnitTotal * multiplier - bundle.discountValue * multiplier);
    }
    totalDiscount = Math.min(totalDiscount, combinedUnitTotal * multiplier);
    if (totalDiscount <= 0) continue;

    const perVariantDiscount = new Map<string, number>();
    let remaining = totalDiscount;
    bundle.components.forEach((component, index) => {
      const line = lineByVariant.get(component.variantId)!;
      const componentTotal = line.unitPrice * component.quantity * multiplier;
      const share = index === bundle.components.length - 1 ? remaining : Math.round((componentTotal / (combinedUnitTotal * multiplier)) * totalDiscount);
      perVariantDiscount.set(component.variantId, share);
      remaining -= share;
    });

    applications.push({ bundleProductId: bundle.bundleProductId, multiplier, totalDiscount, perVariantDiscount });
  }

  return applications;
}
