/**
 * Options & variant matrix generator (docs/PROJECT_SPEC.md §8.2 Catalog,
 * §16 M2): "choose size system and colors → generate all combinations."
 * Zero options ("free size" products, §5.3) must produce exactly one
 * variant with an empty combination — not zero variants.
 */
export interface VariantOption {
  id: string;
  values: { id: string }[];
}

/** Cartesian product of each option's values, one array of value ids per combination, options in the given order. */
export function generateVariantCombinations(options: VariantOption[]): string[][] {
  if (options.length === 0) return [[]];

  let combinations: string[][] = [[]];
  for (const option of options) {
    const next: string[][] = [];
    for (const combo of combinations) {
      for (const value of option.values) {
        next.push([...combo, value.id]);
      }
    }
    combinations = next;
  }
  return combinations;
}

/** Order-independent comparison, since a combination is a set of one value per option. */
export function sameCombination(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}
