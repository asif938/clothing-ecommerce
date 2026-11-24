/**
 * Variant choice for quick add from a product card. Pure, so it is unit
 * tested and shared by the card button and the picker sheet. The shapes are
 * the subset of the PDP payload (`ProductDetail`) this needs.
 */

export interface SelectableOption {
  id: string;
  type: "size" | "color" | "generic";
  values: { id: string }[];
}

export interface SelectableVariant {
  id: string;
  optionValueIds: string[];
  isActive: boolean;
  available: boolean;
}

export type Selection = Record<string, string>;

export function sameCombination(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/** Can this variant go in the cart right now? Preorders don't need stock (the API applies the preorder limit). */
export function isPurchasable(variant: SelectableVariant, isPreorder: boolean): boolean {
  return variant.isActive && (variant.available || isPreorder);
}

/** The variant matching a complete selection, or null while any option is still unchosen. */
export function matchVariant<V extends SelectableVariant>(options: SelectableOption[], variants: V[], selection: Selection): V | null {
  if (options.some((option) => !selection[option.id])) {
    return options.length === 0 ? (variants.find((v) => v.optionValueIds.length === 0) ?? variants[0] ?? null) : null;
  }
  const ids = options.map((option) => selection[option.id]!);
  return variants.find((v) => sameCombination(v.optionValueIds, ids)) ?? null;
}

/** Whether picking `valueId` still leaves at least one purchasable variant, given the other choices already made. */
export function isValueAvailable(options: SelectableOption[], variants: SelectableVariant[], selection: Selection, optionId: string, valueId: string, isPreorder: boolean): boolean {
  const next = { ...selection, [optionId]: valueId };
  return variants.some(
    (variant) => isPurchasable(variant, isPreorder) && variant.optionValueIds.includes(valueId) && options.every((option) => !next[option.id] || variant.optionValueIds.includes(next[option.id]!)),
  );
}

/**
 * Starting selection for the picker: options with one value are chosen for
 * the shopper, and so is colour (the first one that can be bought), since
 * the card already shows a colour. Size is never guessed — buying the wrong
 * size is the costliest mistake a quick add can make.
 */
export function initialSelection(options: SelectableOption[], variants: SelectableVariant[], isPreorder: boolean): Selection {
  const selection: Selection = {};
  for (const option of options) {
    if (option.values.length === 1) {
      selection[option.id] = option.values[0]!.id;
    } else if (option.type === "color") {
      const firstBuyable = option.values.find((value) => isValueAvailable(options, variants, selection, option.id, value.id, isPreorder));
      if (firstBuyable) selection[option.id] = firstBuyable.id;
    }
  }
  return selection;
}

/** What the quick-add button should do for this product. */
export type QuickAddPlan = { kind: "add"; variantId: string } | { kind: "choose" } | { kind: "sold_out" } | { kind: "open_page" };

export function planQuickAdd(product: { productType: string; options: SelectableOption[]; variants: SelectableVariant[] }): QuickAddPlan {
  // A look (bundle) is bought from its own page, where every piece is listed.
  if (product.productType === "bundle") return { kind: "open_page" };
  const isPreorder = product.productType === "preorder";
  const buyable = product.variants.filter((variant) => isPurchasable(variant, isPreorder));
  if (buyable.length === 0) return { kind: "sold_out" };
  const selection = initialSelection(product.options, product.variants, isPreorder);
  const needsChoice = product.options.some((option) => option.values.length > 1);
  if (!needsChoice) {
    const variant = matchVariant(product.options, product.variants, selection);
    return variant && isPurchasable(variant, isPreorder) ? { kind: "add", variantId: variant.id } : { kind: "sold_out" };
  }
  return { kind: "choose" };
}
