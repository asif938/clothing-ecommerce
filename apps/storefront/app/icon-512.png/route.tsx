import { ImageResponse } from "next/og";
import { getStoreConfig } from "../../lib/store-api";

function localized(value: unknown, locale: "bn" | "en"): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const text = value as { bn?: string; en?: string };
  return text[locale] ?? text.bn ?? text.en;
}

/** The PWA manifest's 512×512 icon — see `icon-192.png/route.tsx` for the full reasoning (identical, just a bigger canvas). */
export async function GET() {
  const config = await getStoreConfig();
  const brandColor = typeof config["theme.brandColor"] === "string" ? (config["theme.brandColor"] as string) : "#111827";
  const brandName = localized(config["brand.name"], "en") ?? "S";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: brandColor, color: "#fff", fontSize: 256, fontWeight: 700 }}>
        {brandName.charAt(0).toUpperCase()}
      </div>
    ),
    { width: 512, height: 512 },
  );
}
