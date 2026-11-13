/**
 * Bill-of-materials maths (docs/PROJECT_SPEC.md §8.2 Inventory "materials &
 * BOM", §16 M17). Pure and integer-only (golden rule 3) — the services load
 * rows and write movements, this decides the numbers.
 *
 * A BOM line says "one finished unit uses `quantity` of a material, plus
 * `wastagePercent` extra for cutting loss". Lines belong to a product; a
 * line with a `variantId` applies to that variant only and *replaces* the
 * product-wide line for the same material (e.g. XXL uses more fabric).
 */

export interface BomLineInput {
  variantId: string | null;
  materialId: string;
  quantity: number;
  wastagePercent: number;
}

/** The BOM that applies to `variantId`: variant-specific lines win over product-wide lines for the same material. */
export function effectiveBom<T extends BomLineInput>(lines: T[], variantId: string): T[] {
  const byMaterial = new Map<string, T>();
  for (const line of lines) {
    if (line.variantId === null && !byMaterial.has(line.materialId)) byMaterial.set(line.materialId, line);
  }
  for (const line of lines) {
    if (line.variantId === variantId) byMaterial.set(line.materialId, line);
  }
  return [...byMaterial.values()];
}

/** Material units needed for `units` finished units of one BOM line — wastage included, rounded up to whole material units. */
export function materialNeeded(line: Pick<BomLineInput, "quantity" | "wastagePercent">, units: number): number {
  if (units <= 0 || line.quantity <= 0) return 0;
  // Integer maths: quantity * units * (100 + wastage) / 100, rounded up.
  return Math.ceil((line.quantity * units * (100 + line.wastagePercent)) / 100);
}

export interface ProductionLine {
  variantId: string;
  productId: string;
  units: number;
}

/** Total material needed for a production run, summed per material. */
export function totalRequirements(lines: ProductionLine[], bomByProduct: Map<string, BomLineInput[]>): Map<string, number> {
  const needed = new Map<string, number>();
  for (const line of lines) {
    const bom = effectiveBom(bomByProduct.get(line.productId) ?? [], line.variantId);
    for (const bomLine of bom) {
      needed.set(bomLine.materialId, (needed.get(bomLine.materialId) ?? 0) + materialNeeded(bomLine, line.units));
    }
  }
  return needed;
}

export interface Shortage {
  materialId: string;
  needed: number;
  onHand: number;
  short: number;
}

export function findShortages(needed: Map<string, number>, onHand: Map<string, number>): Shortage[] {
  const shortages: Shortage[] = [];
  for (const [materialId, qty] of needed) {
    const have = Math.max(0, onHand.get(materialId) ?? 0);
    if (qty > have) shortages.push({ materialId, needed: qty, onHand: have, short: qty - have });
  }
  return shortages;
}

/** Material cost of one finished unit, in poisha (wastage included). Materials without a cost count as 0. */
export function unitMaterialCost(bom: BomLineInput[], costByMaterial: Map<string, number>): number {
  return bom.reduce((sum, line) => sum + Math.round((line.quantity * (100 + line.wastagePercent) * (costByMaterial.get(line.materialId) ?? 0)) / 100), 0);
}
