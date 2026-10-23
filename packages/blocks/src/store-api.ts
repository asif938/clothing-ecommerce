/**
 * Server-only fetch helper for blocks that need live catalog data
 * (`product_grid`, `category_tiles`) — this package only ever runs inside
 * the storefront's server components, so calling the API directly with
 * `API_URL` (infra-only env, docs/PROJECT_SPEC.md §4.1) is fine; there's
 * no browser involved and so no need for the admin/storefront apps'
 * same-origin rewrite proxy. Returns `null` on any failure so the calling
 * block can render nothing instead of crashing the page (§9.1).
 */
export async function storeApiGet<T>(path: string): Promise<T | null> {
  try {
    const base = process.env.API_URL ?? "http://localhost:4000";
    // `next.revalidate` is a Next.js-only fetch extension; this package has
    // no dependency on `next`'s types, but it only ever runs inside the
    // storefront's Next.js server runtime, which honors it at runtime.
    const init = { next: { revalidate: 60 } } as RequestInit;
    const response = await fetch(`${base}/api/v1${path}`, init);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
