import type { MetadataRoute } from "next";
import { getBrandIdentity } from "../lib/brand";

/**
 * Admin PWA manifest (docs/PROJECT_SPEC.md §8.2, §16 M11). Served at
 * `/manifest.webmanifest`. Name and colour come from the brand settings via
 * the public store config (golden rule 1: nothing hardcoded) - the same
 * source the storefront's own manifest uses.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { name, color } = await getBrandIdentity();
  return {
    name: `${name} Admin`,
    short_name: "Admin",
    description: `${name} - store administration`,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: color,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
