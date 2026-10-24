/** Order number formatting (docs/PROJECT_SPEC.md §6.8, §17) — pure function, unit-tested. */
export function formatOrderNumber(template: string, prefix: string, now: Date, seq: number): string {
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return template.replace("{PREFIX}", prefix).replace("{YYMMDD}", `${yy}${mm}${dd}`).replace("{SEQ4}", String(seq).padStart(4, "0"));
}

/** §17 default: "prefix = first 3 letters of brand name uppercased." */
export function derivePrefix(brandName: string | null): string {
  const letters = (brandName ?? "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "STR").padEnd(3, "X");
}
