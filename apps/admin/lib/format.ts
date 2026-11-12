/**
 * Formatting helpers for the M12 admin screens. Money is integer poisha
 * everywhere (golden rule 3); these only convert at the display/input edge.
 */

export type Localized = { bn?: string; en?: string } | null | undefined;

export function localized(value: Localized | unknown, locale: string): string {
  const v = value as Localized;
  if (!v) return "";
  return (locale === "bn" ? v.bn || v.en : v.en || v.bn) ?? "";
}

/** ৳ whole taka, standard grouping (spec §17 currency display default). */
export function money(poisha: number | null | undefined): string {
  if (poisha === null || poisha === undefined) return "—";
  const taka = Math.round(poisha / 100);
  return `${taka < 0 ? "-" : ""}৳${Math.abs(taka).toLocaleString("en-US")}`;
}

export function pct(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;
}

/** Parses a taka amount typed by staff ("1,250.50") into poisha with integer maths; null if invalid. */
export function parseTaka(input: string): number | null {
  const text = input.replace(/[৳,\s]/g, "");
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(text);
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) return null;
  return Number.parseInt(match[1] || "0", 10) * 100 + Number.parseInt((match[2] ?? "").padEnd(2, "0") || "0", 10);
}

/** Poisha → editable taka string ("1250.5" style, no grouping). */
export function takaInput(poisha: number | null | undefined): string {
  if (poisha === null || poisha === undefined) return "";
  const whole = Math.trunc(poisha / 100);
  const frac = Math.abs(poisha % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`;
}

export function shortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function dateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Reads a File as base64 (without the data: prefix) for JSON uploads. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file"));
    reader.readAsDataURL(file);
  });
}
