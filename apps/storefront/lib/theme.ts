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

/**
 * The brand color goes straight into an inline `<style>`; anything other than a plain hex color (e.g. a value
 * containing `}` or `</style>`) could inject CSS or markup, so it falls back instead.
 */
export function safeHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fallback;
}

/**
 * JSON for a `<script type="application/ld+json">`. `JSON.stringify` alone leaves `</script>` intact, so a product
 * name containing it would close the tag and run whatever follows. `<`, `>`, `&` and the JS line separators are
 * escaped as unicode — still valid JSON, parsed back to the same text.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
