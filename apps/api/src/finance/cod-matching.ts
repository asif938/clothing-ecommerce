import type { ShipmentStatus } from "@clothing/db";

/**
 * COD reconciliation rules (docs/PROJECT_SPEC.md §8.2 Finance "import
 * courier settlement file or API; auto-match by consignment id; variance
 * flags", §16 M12). Pure functions, unit-tested.
 */

/**
 * Parses a taka amount from a courier file cell into integer poisha without
 * going through floating point (golden rule 3): "1,250.5" → 125050,
 * "৳ 70" → 7000, Bangla digits accepted. Returns null for blank/unparseable.
 */
export function takaToPoisha(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // xlsx hands numeric cells over as JS numbers; go via a fixed 2-dp string.
    return takaToPoisha(value.toFixed(2));
  }
  const bnDigits = "০১২৩৪৫৬৭৮৯";
  let text = String(value).trim().replace(/[০-৯]/g, (d) => String(bnDigits.indexOf(d)));
  text = text.replace(/[৳,\s]|tk\.?|bdt/gi, "");
  if (text === "") return null;
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const whole = Number.parseInt(match[2] || "0", 10);
  const fraction = (match[3] ?? "").padEnd(2, "0");
  // Round half-up on the third decimal, if present.
  let poisha = whole * 100 + Number.parseInt(fraction.slice(0, 2), 10);
  if (fraction.length > 2 && Number.parseInt(fraction[2]!, 10) >= 5) poisha += 1;
  return sign * poisha;
}

export interface SettlementColumnMapping {
  consignmentId: string;
  collected: string;
  charge?: string | null;
}

export interface ParsedSettlementLine {
  consignmentId: string;
  collected: number;
  charge: number;
}

export interface ParsedSettlementFile {
  lines: ParsedSettlementLine[];
  errors: { row: number; message: string }[];
}

function cell(row: Record<string, unknown>, header: string): unknown {
  if (header in row) return row[header];
  const wanted = header.trim().toLowerCase();
  const key = Object.keys(row).find((k) => k.trim().toLowerCase() === wanted);
  return key === undefined ? undefined : row[key];
}

/** Turns spreadsheet rows (header → value) into settlement lines using staff-chosen column names. Row numbers in errors are 1-based data rows (header excluded). */
export function parseSettlementRows(rows: Record<string, unknown>[], mapping: SettlementColumnMapping): ParsedSettlementFile {
  const lines: ParsedSettlementLine[] = [];
  const errors: { row: number; message: string }[] = [];
  rows.forEach((row, index) => {
    const rawId = cell(row, mapping.consignmentId);
    const consignmentId = rawId === null || rawId === undefined ? "" : String(rawId).trim();
    if (!consignmentId) {
      // Totals/blank rows at the bottom of courier exports are common; skip silently if the whole row is empty.
      if (Object.values(row).some((v) => v !== null && String(v).trim() !== "")) errors.push({ row: index + 1, message: "Missing consignment id" });
      return;
    }
    const collected = takaToPoisha(cell(row, mapping.collected));
    if (collected === null) {
      errors.push({ row: index + 1, message: `Unreadable collected amount for ${consignmentId}` });
      return;
    }
    const charge = mapping.charge ? takaToPoisha(cell(row, mapping.charge)) ?? 0 : 0;
    lines.push({ consignmentId, collected, charge });
  });
  return { lines, errors };
}

export interface MatchableShipment {
  id: string;
  status: ShipmentStatus;
  codAmount: number;
  deliveryFeeCollected: number | null;
  codSettledAt: Date | null;
}

export type CodLineFlag = "unmatched" | "variance" | "duplicate" | "already_settled" | "not_delivered";

export interface CodLineMatch {
  shipmentId: string | null;
  matched: boolean;
  expected: number | null;
  variance: number;
  flag: CodLineFlag | null;
}

const DELIVERED: ShipmentStatus[] = ["delivered", "partially_delivered"];
const DOOR_FAILED: ShipmentStatus[] = ["rejected_at_door", "returned_to_sender"];

/** What we expect the courier to have collected for this shipment: the COD amount when delivered, the door delivery fee (if any) when rejected, null while not final. */
export function expectedCollection(shipment: MatchableShipment): number | null {
  if (DELIVERED.includes(shipment.status)) return shipment.codAmount;
  if (DOOR_FAILED.includes(shipment.status)) return shipment.deliveryFeeCollected ?? 0;
  return null;
}

/**
 * Matches one settlement line. `seenInFile` is true when the same
 * consignment id already appeared earlier in this settlement (couriers
 * occasionally list an adjustment twice). Flags, in priority order:
 * unmatched → duplicate → already_settled → not_delivered → variance.
 */
export function matchCodLine(line: ParsedSettlementLine, shipment: MatchableShipment | null, seenInFile: boolean, tolerance: number): CodLineMatch {
  if (!shipment) return { shipmentId: null, matched: false, expected: null, variance: 0, flag: "unmatched" };
  const expected = expectedCollection(shipment);
  const variance = expected === null ? 0 : line.collected - expected;
  const base = { shipmentId: shipment.id, matched: true, expected: expected ?? shipment.codAmount, variance };
  if (seenInFile) return { ...base, flag: "duplicate" };
  if (shipment.codSettledAt) return { ...base, flag: "already_settled" };
  if (expected === null) return { ...base, variance: line.collected - shipment.codAmount, flag: "not_delivered" };
  if (Math.abs(variance) > tolerance) return { ...base, flag: "variance" };
  return { ...base, flag: null };
}

export interface SettlementTotals {
  totalCollected: number;
  totalCharges: number;
  netAmount: number;
  matchedLines: number;
  flaggedLines: number;
  totalVariance: number;
}

export function settlementTotals(lines: { collected: number; charge: number; matched: boolean; flag: string | null; variance: number }[]): SettlementTotals {
  const totals: SettlementTotals = { totalCollected: 0, totalCharges: 0, netAmount: 0, matchedLines: 0, flaggedLines: 0, totalVariance: 0 };
  for (const line of lines) {
    totals.totalCollected += line.collected;
    totals.totalCharges += line.charge;
    if (line.matched) totals.matchedLines += 1;
    if (line.flag) totals.flaggedLines += 1;
    totals.totalVariance += line.variance;
  }
  totals.netAmount = totals.totalCollected - totals.totalCharges;
  return totals;
}
