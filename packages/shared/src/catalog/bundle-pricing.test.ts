import { describe, expect, it } from "vitest";
import { matchBundles, type BundleDefinition } from "./bundle-pricing.ts";

const TOP = "variant-top";
const BOTTOM = "variant-bottom";

describe("matchBundles", () => {
  it("doesn't apply when a component is missing", () => {
    const bundle: BundleDefinition = { bundleProductId: "b1", discountType: "percent", discountValue: 10, components: [{ variantId: TOP, quantity: 1 }, { variantId: BOTTOM, quantity: 1 }] };
    const result = matchBundles([{ variantId: TOP, quantity: 1, unitPrice: 100000 }], [bundle]);
    expect(result).toEqual([]);
  });

  it("applies a percent discount once when quantities exactly match", () => {
    const bundle: BundleDefinition = { bundleProductId: "b1", discountType: "percent", discountValue: 10, components: [{ variantId: TOP, quantity: 1 }, { variantId: BOTTOM, quantity: 1 }] };
    const lines = [
      { variantId: TOP, quantity: 1, unitPrice: 100000 },
      { variantId: BOTTOM, quantity: 1, unitPrice: 150000 },
    ];
    const [application] = matchBundles(lines, [bundle]);
    expect(application?.multiplier).toBe(1);
    expect(application?.totalDiscount).toBe(25000); // 10% of 250000
    const sumOfShares = (application?.perVariantDiscount.get(TOP) ?? 0) + (application?.perVariantDiscount.get(BOTTOM) ?? 0);
    expect(sumOfShares).toBe(25000);
  });

  it("applies a fixed bundle price, computing the implied discount", () => {
    const bundle: BundleDefinition = { bundleProductId: "b1", discountType: "fixed_price", discountValue: 200000, components: [{ variantId: TOP, quantity: 1 }, { variantId: BOTTOM, quantity: 1 }] };
    const lines = [
      { variantId: TOP, quantity: 1, unitPrice: 100000 },
      { variantId: BOTTOM, quantity: 1, unitPrice: 150000 },
    ];
    const [application] = matchBundles(lines, [bundle]);
    expect(application?.totalDiscount).toBe(50000); // 250000 - 200000
  });

  it("scales the multiplier when the cart holds several copies of the look", () => {
    const bundle: BundleDefinition = { bundleProductId: "b1", discountType: "percent", discountValue: 10, components: [{ variantId: TOP, quantity: 1 }, { variantId: BOTTOM, quantity: 1 }] };
    const lines = [
      { variantId: TOP, quantity: 3, unitPrice: 100000 },
      { variantId: BOTTOM, quantity: 2, unitPrice: 150000 },
    ];
    // Bottom only supports 2 full copies of the bundle even though 3 tops exist.
    const [application] = matchBundles(lines, [bundle]);
    expect(application?.multiplier).toBe(2);
  });

  it("respects a per-component quantity greater than one", () => {
    const bundle: BundleDefinition = { bundleProductId: "b1", discountType: "percent", discountValue: 20, components: [{ variantId: TOP, quantity: 2 }] };
    const result = matchBundles([{ variantId: TOP, quantity: 3, unitPrice: 100000 }], [bundle]);
    expect(result[0]?.multiplier).toBe(1); // floor(3/2) = 1
  });

  it("never discounts more than the combined line total", () => {
    const bundle: BundleDefinition = { bundleProductId: "b1", discountType: "fixed_price", discountValue: 0, components: [{ variantId: TOP, quantity: 1 }] };
    const result = matchBundles([{ variantId: TOP, quantity: 1, unitPrice: 100000 }], [bundle]);
    expect(result[0]?.totalDiscount).toBe(100000);
  });

  it("is a no-op for discountType none", () => {
    const bundle: BundleDefinition = { bundleProductId: "b1", discountType: "none", discountValue: 0, components: [{ variantId: TOP, quantity: 1 }] };
    expect(matchBundles([{ variantId: TOP, quantity: 1, unitPrice: 100000 }], [bundle])).toEqual([]);
  });
});
