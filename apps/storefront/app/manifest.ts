import type { MetadataRoute } from "next";
import { getStoreConfig } from "../lib/store-api";

function localized(value: unknown, locale: "bn" | "en"): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const text = value as { bn?: string; en?: string };
  return text[locale] ?? text.bn ?? text.en;
}

/**
 * Storefront PWA (docs/PROJECT_SPEC.md §16 M10). Next's `app/manifest.ts`
 * convention serves this at `/manifest.webmanifest` — same "real route,
 * not a static file" pattern `sitemap.ts`/`robots.ts` already use (M4),
 * which is what lets it read brand name/color from the settings registry
 * (golden rule 1: no hardcoded brand name/color) instead of being a fixed
 * JSON file. Falls back to sane generic defaults when `pwa.enabled` is off
 * so installing is simply unavailable rather than broken.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const config = await getStoreConfig();
  const brandName = localized(config["brand.name"], "bn") ?? "Store";
  const shortName = localized(config["pwa.shortName"], "bn") ?? brandName;
  const brandColor = typeof config["theme.brandColor"] === "string" ? (config["theme.brandColor"] as string) : "#111827";

  return {
    name: brandName,
    short_name: shortName,
    description: `${brandName} — online store`,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: brandColor,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
