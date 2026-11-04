/** Minimal CSV writer (docs/PROJECT_SPEC.md §8.2 "every report: date range, compare period, export") — quotes a field only when it needs it, doubling embedded quotes per RFC 4180. */
function csvField(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: { key: keyof T; header: string }[]): string {
  const lines = [columns.map((c) => csvField(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvField(row[c.key])).join(","));
  }
  return lines.join("\n");
}
