import type { MetadataRoute } from "next";

const BASE_URL = process.env.STOREFRONT_URL ?? "http://localhost:3000";

/**
 * §13.2 "robots.txt from settings; faceted filter URLs noindex,follow" —
 * the faceted-filter-URL rule is handled per-page via `generateMetadata`'s
 * `robots` field (not needed here, since Next merges both); driving the
 * *rules themselves* from a settings-registry entry is a reasonable
 * follow-up once there's an admin screen that would actually edit it —
 * not built this milestone, see docs/DECISIONS.md.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/search", "/wishlist", "/_styleguide", "/api/"] }],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
