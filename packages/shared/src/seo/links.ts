/**
 * Link extraction and storefront route matching for the broken link checker
 * (docs/PROJECT_SPEC.md §16 M13). Content links live inside CMS block JSON,
 * menu trees, rich-text HTML and plain URL fields; this finds them all
 * without knowing each block type's schema, then classifies each one so the
 * API can resolve internal paths against the database (no HTTP needed —
 * works on the free tier) and only optionally HEAD-check external ones.
 */

const LINK_KEY = /(^|_)(href|url|link|to|path)$|(Url|Href|Link|Path)$/;
const HREF_IN_HTML = /href\s*=\s*["']([^"']+)["']/gi;

function looksLikeLink(value: string): boolean {
  const v = value.trim();
  return v.startsWith("/") || /^https?:\/\//i.test(v);
}

/** Every distinct link-like string in `value` (deep), in first-seen order. */
export function extractLinks(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (node: unknown, key: string | null): void => {
    if (typeof node === "string") {
      if (key && LINK_KEY.test(key) && looksLikeLink(node)) found.add(node.trim());
      if (node.includes("href")) {
        for (const match of node.matchAll(HREF_IN_HTML)) found.add(match[1]!.trim());
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) visit(v, k);
    }
  };
  visit(value, null);
  return [...found];
}

export type ClassifiedLink = { kind: "internal"; path: string } | { kind: "external"; url: string } | { kind: "skip" };

/** Absolute links to our own storefront origin(s) count as internal. */
export function classifyLink(raw: string, ownOrigins: string[]): ClassifiedLink {
  const link = raw.trim();
  if (!link || link.startsWith("#") || /^(mailto|tel|sms|javascript|whatsapp|data):/i.test(link)) return { kind: "skip" };
  if (link.startsWith("//")) return { kind: "external", url: `https:${link}` };
  if (link.startsWith("/")) return { kind: "internal", path: normalizePath(link) };
  if (/^https?:\/\//i.test(link)) {
    try {
      const url = new URL(link);
      if (ownOrigins.some((o) => sameOrigin(o, url))) return { kind: "internal", path: normalizePath(url.pathname) };
      return { kind: "external", url: url.toString() };
    } catch {
      return { kind: "external", url: link };
    }
  }
  return { kind: "skip" };
}

function sameOrigin(origin: string, url: URL): boolean {
  try {
    return new URL(origin).host.toLowerCase() === url.host.toLowerCase();
  } catch {
    return false;
  }
}

/** Drops query/hash and a trailing slash; keeps the leading slash. */
export function normalizePath(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? "/";
  const trimmed = clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
  return trimmed || "/";
}

export type StorefrontRoute =
  | { type: "home" }
  | { type: "static"; name: string }
  | { type: "product"; slug: string }
  | { type: "category"; slugs: string[] }
  | { type: "collection"; slug: string }
  | { type: "page"; slug: string }
  | { type: "blog_post"; slug: string }
  | { type: "unknown" };

const STATIC_ROUTES = new Set(["cart", "checkout", "search", "track", "wishlist", "blog", "account", "account/login", "account/addresses", "account/returns", "account/measurements", "account/points"]);

/** Maps a normalized storefront path (with or without the `/en` / `/bn` locale prefix) to the route it would render (apps/storefront/app/[locale]). */
export function matchStorefrontRoute(path: string): StorefrontRoute {
  const segments = normalizePath(path)
    .split("/")
    .filter(Boolean)
    .map((s) => decodeURIComponent(s));
  if (segments[0] === "en" || segments[0] === "bn") segments.shift();
  if (segments.length === 0) return { type: "home" };
  const [head, ...rest] = segments;
  if (head === "p" && rest.length === 1) return { type: "product", slug: rest[0]! };
  if (head === "c" && rest.length >= 1) return { type: "category", slugs: rest };
  if (head === "collections" && rest.length === 1) return { type: "collection", slug: rest[0]! };
  if (head === "pages" && rest.length === 1) return { type: "page", slug: rest[0]! };
  if (head === "blog" && rest.length === 1) return { type: "blog_post", slug: rest[0]! };
  const joined = segments.join("/");
  if (STATIC_ROUTES.has(joined)) return { type: "static", name: joined };
  return { type: "unknown" };
}
