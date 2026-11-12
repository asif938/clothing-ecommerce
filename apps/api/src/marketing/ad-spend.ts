import { takaToPoisha } from "../finance/cod-matching";

/**
 * Pure parsing for ad-spend imports (docs/PROJECT_SPEC.md §5.10 `ad_spend`,
 * §16 M13). Ad platforms export dates and amounts in many shapes; money is
 * converted to integer poisha without floating point (golden rule 3).
 */

/** Excel serial day 0 is 1899-12-30. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** A calendar date (UTC midnight) from ISO, d/m/y, m/d/y (`format` decides ambiguous slashes) or an Excel serial; null when unreadable. */
export function parseSpendDate(value: unknown, format: "auto" | "dmy" | "mdy" = "auto"): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (typeof value === "number" && Number.isFinite(value) && value > 20_000 && value < 80_000) {
    return new Date(EXCEL_EPOCH_MS + Math.floor(value) * 86_400_000);
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (match) return safeDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (match) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    const year = Number(match[3]);
    if (format === "mdy" || (format === "auto" && a <= 12 && b > 12)) return safeDate(year, a, b);
    return safeDate(year, b, a); // d/m/y — the Bangladesh default
  }
  return null;
}

function safeDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 ? date : null;
}

/**
 * Spend in poisha. Without an exchange rate the amount is taka. With one
 * ("122.50" = taka per unit), the amount is in that currency: both are
 * turned into integer hundredths first, then multiplied, rounding half up.
 */
export function spendToPoisha(value: unknown, exchangeRate: string | null | undefined): number | null {
  const hundredths = takaToPoisha(typeof value === "string" ? value.replace(/[$€£]|usd/gi, "") : value);
  if (hundredths === null || hundredths < 0) return null;
  if (!exchangeRate) return hundredths;
  const rate = takaToPoisha(exchangeRate);
  if (rate === null || rate <= 0) return null;
  return Math.floor((hundredths * rate + 50) / 100);
}

/** Whole, non-negative counts ("1,234" → 1234); 0 when missing or unreadable. */
export function parseCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== "string") return 0;
  const n = Number.parseInt(value.replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
