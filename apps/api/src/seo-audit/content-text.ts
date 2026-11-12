/**
 * Pulls per-locale visible text out of CMS block JSON for the SEO score's
 * "thin content" check: any `{ bn, en }` object (a LocalizedText) contributes
 * its strings; everything else is walked recursively. Pure.
 */
export function blockText(value: unknown): { bn: string; en: string } {
  const out = { bn: [] as string[], en: [] as string[] };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const isLocalized = ("bn" in record || "en" in record) && Object.keys(record).every((k) => k === "bn" || k === "en");
    if (isLocalized) {
      if (typeof record.bn === "string") out.bn.push(record.bn);
      if (typeof record.en === "string") out.en.push(record.en);
      return;
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return { bn: out.bn.join(" "), en: out.en.join(" ") };
}
