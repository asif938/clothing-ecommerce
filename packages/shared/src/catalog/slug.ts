/**
 * Catalog slugs (categories, products, collections) are a single ASCII
 * identifier shared by both locales rather than localized per-locale paths —
 * simplest option consistent with golden rule 1, and nothing routes on a
 * per-locale slug before the storefront exists (M3/M4) — see
 * docs/DECISIONS.md. Bangla text has no ASCII transliteration here, so a
 * bn-only title slugifies to "" and the caller must fall back (e.g. to the
 * entity id) — see `slugify`'s `fallback` parameter.
 */
export function slugify(input: string, fallback = ""): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

/** Appends `-2`, `-3`, … until `exists(candidate)` returns false. */
export async function uniqueSlug(base: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (await exists(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
