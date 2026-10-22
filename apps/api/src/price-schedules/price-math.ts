/**
 * Price schedules (docs/PROJECT_SPEC.md §5.3 `price_schedules`): either a
 * fixed `newPrice` or a `percentChange` applied to the variant's current
 * price. Money is poisha integers (golden rule 3) — percent application
 * must round to the nearest integer, never carry fractional poisha.
 */
export function computeScheduledPrice(currentPrice: number, schedule: { newPrice: number | null; percentChange: number | null }): number {
  if (schedule.newPrice !== null) return schedule.newPrice;
  if (schedule.percentChange !== null) return Math.max(0, Math.round(currentPrice * (1 + schedule.percentChange / 100)));
  return currentPrice;
}
