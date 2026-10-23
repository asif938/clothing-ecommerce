/** Poisha → display string (golden rule 3: money is always an integer poisha internally). Symbol/thousands/lakh-grouping settings (§4.5) are a later refinement — this is the fixed `৳1,250` form named in the spec as the default. */
export function formatBdt(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString("en-US")}`;
}
