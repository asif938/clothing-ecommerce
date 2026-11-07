import { ImageResponse } from "next/og";
import { getStoreConfig } from "../../lib/store-api";

function localized(value: unknown, locale: "bn" | "en"): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const text = value as { bn?: string; en?: string };
  return text[locale] ?? text.bn ?? text.en;
}

/**
 * The PWA manifest's 192×192 icon (docs/PROJECT_SPEC.md §16 M10),
 * generated on the fly from `theme.brandColor`/`brand.name` (golden rule
 * 1: no hardcoded brand asset) rather than a static file — no real brand
 * logo upload path exists yet (flagged since M3's own known-issues list),
 * so this is the brand-color-and-initial placeholder until one does.
 */
export async function GET() {
  const config = await getStoreConfig();
  const brandColor = typeof config["theme.brandColor"] === "string" ? (config["theme.brandColor"] as string) : "#111827";
  const brandName = localized(config["brand.name"], "en") ?? "S";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: brandColor, color: "#fff", fontSize: 96, fontWeight: 700 }}>
        {brandName.charAt(0).toUpperCase()}
      </div>
    ),
    { width: 192, height: 192 },
  );
}
