/**
 * Dead-stock markdown suggestions (docs/PROJECT_SPEC.md §8.2 Inventory,
 * §16 M12). Tiers come from the `inventory.markdownTiers` setting; the floor
 * reuses the margin-guard minimum margin (§6.3 step 5) so a suggestion can
 * never price an item below cost + minimum margin. Prices are rounded *down*
 * to whole taka (spec §6.1/§17: prices shown without decimals).
 */
export interface MarkdownTierInput {
  minDays: number;
  percentOff: number;
}

export interface MarkdownSuggestion {
  percentOff: number;
  /** Tier's own discount before the margin floor was applied. */
  tierPercentOff: number;
  suggestedPrice: number;
  floorPrice: number | null;
  cappedByMargin: boolean;
}

const TAKA = 100;

export function pickMarkdownTier(daysUnsold: number, tiers: MarkdownTierInput[]): MarkdownTierInput | null {
  let best: MarkdownTierInput | null = null;
  for (const tier of tiers) {
    if (daysUnsold >= tier.minDays && (!best || tier.minDays > best.minDays)) best = tier;
  }
  return best;
}

export function suggestMarkdown(input: {
  price: number;
  costPrice: number | null;
  daysUnsold: number;
  tiers: MarkdownTierInput[];
  minMarginPercent: number;
}): MarkdownSuggestion | null {
  const tier = pickMarkdownTier(input.daysUnsold, input.tiers);
  if (!tier || input.price <= 0) return null;

  const floorPrice = input.costPrice === null ? null : Math.ceil((input.costPrice * (100 + input.minMarginPercent)) / 100 / TAKA) * TAKA;
  const raw = Math.floor((input.price * (100 - tier.percentOff)) / 100 / TAKA) * TAKA;

  let suggestedPrice = raw;
  let cappedByMargin = false;
  if (floorPrice !== null && raw < floorPrice) {
    suggestedPrice = floorPrice;
    cappedByMargin = true;
  }
  if (suggestedPrice >= input.price) return null; // no room to mark down without breaking the margin floor

  const percentOff = Math.round(((input.price - suggestedPrice) / input.price) * 1000) / 10;
  return { percentOff, tierPercentOff: tier.percentOff, suggestedPrice, floorPrice, cappedByMargin };
}
