/**
 * Shipping fee calculation (docs/PROJECT_SPEC.md §6.4) — pure functions,
 * unit-tested (golden rule 10/§6 intro: "implemented as pure, unit-tested
 * functions where possible").
 */

export interface ZoneCandidate {
  id: string;
  priority: number;
  matchDivisionIds: string[];
  matchDistrictIds: string[];
  matchAreaIds: string[];
  matchDhakaCity: boolean;
  isCatchAll: boolean;
  isActive: boolean;
}

export interface Destination {
  divisionId: string;
  districtId: string;
  areaId: string;
  isDhakaCity: boolean;
}

/** area > district > division > dhaka_city flag > catch-all (§6.4 step 1); ties broken by priority. */
export function specificityOf(zone: ZoneCandidate, destination: Destination): number | null {
  if (zone.matchAreaIds.includes(destination.areaId)) return 4;
  if (zone.matchDistrictIds.includes(destination.districtId)) return 3;
  if (zone.matchDivisionIds.includes(destination.divisionId)) return 2;
  if (zone.matchDhakaCity && destination.isDhakaCity) return 1;
  if (zone.isCatchAll) return 0;
  return null;
}

export function selectZone<T extends ZoneCandidate>(zones: T[], destination: Destination): T | null {
  let best: { zone: T; specificity: number } | null = null;
  for (const zone of zones) {
    if (!zone.isActive) continue;
    const specificity = specificityOf(zone, destination);
    if (specificity === null) continue;
    if (!best || specificity > best.specificity || (specificity === best.specificity && zone.priority > best.zone.priority)) {
      best = { zone, specificity };
    }
  }
  return best?.zone ?? null;
}

export interface RateCandidate {
  id: string;
  baseFee: number;
  includedWeightGrams: number;
  extraFeePerStep: number;
  weightStepGrams: number;
  freeOverAmount: number | null;
  minOrder: number | null;
  maxOrder: number | null;
  isActive: boolean;
  position: number;
}

export function rateMatches(rate: RateCandidate, subtotal: number): boolean {
  if (!rate.isActive) return false;
  if (rate.minOrder !== null && subtotal < rate.minOrder) return false;
  if (rate.maxOrder !== null && subtotal > rate.maxOrder) return false;
  return true;
}

export function listMatchingRates<T extends RateCandidate>(rates: T[], subtotal: number): T[] {
  return rates.filter((rate) => rateMatches(rate, subtotal)).sort((a, b) => a.position - b.position);
}

/** §6.4 step 3-4: base + weight surcharge, waived entirely once free (the simpler of the two documented options — see docs/DECISIONS.md). */
export function computeRateFee(rate: RateCandidate, weightGrams: number, subtotal: number, globalFreeThreshold: number | null): number {
  const freeThreshold = rate.freeOverAmount ?? globalFreeThreshold;
  if (freeThreshold !== null && subtotal >= freeThreshold) return 0;

  const extraWeight = Math.max(0, weightGrams - rate.includedWeightGrams);
  const steps = rate.weightStepGrams > 0 ? Math.ceil(extraWeight / rate.weightStepGrams) : 0;
  return rate.baseFee + steps * rate.extraFeePerStep;
}
