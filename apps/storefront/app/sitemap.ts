import type { MetadataRoute } from "next";
import { getSitemapData } from "../lib/store-api";

const BASE_URL = process.env.STOREFRONT_URL ?? "http://localhost:3000";

function entry(path: string, updatedAt: string): MetadataRoute.Sitemap[number] {
  return {
    url: `${BASE_URL}${path}`,
    lastModified: updatedAt,
    alternates: { languages: { bn: `${BASE_URL}${path}`, en: `${BASE_URL}/en${path}` } },
  };
}

/** §13.2 "sitemap.xml index split by type" — Next's `app/sitemap.ts` convention serves this at `/sitemap.xml`. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getSitemapData();
  return [
    entry("/", new Date().toISOString()),
    ...data.pages.map((p) => entry(`/pages/${p.slug}`, p.updatedAt)),
    ...data.products.map((p) => entry(`/p/${p.slug}`, p.updatedAt)),
    ...data.categories.map((c) => entry(`/c/${c.slug}`, c.updatedAt)),
    ...data.collections.map((c) => entry(`/collections/${c.slug}`, c.updatedAt)),
  ];
}
