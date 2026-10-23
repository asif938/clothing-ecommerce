/** Picks readable text color for a background hex — a cheap stand-in for the real contrast checker the Design screen will grow (docs/PROJECT_SPEC.md §7.1). */
export function pickForegroundColor(hex: string): "#ffffff" | "#111111" {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return "#ffffff";
  const value = match[1]!;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  // Relative luminance (sRGB, simplified — no gamma correction, good enough for a pass/fail pick).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}
