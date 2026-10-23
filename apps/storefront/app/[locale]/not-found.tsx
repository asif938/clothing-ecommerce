import { BlockRenderer } from "../../components/block-renderer";
import { getPage } from "../../lib/store-api";

/**
 * docs/PROJECT_SPEC.md §7.3 — CMS-editable 404 content (the "404" system
 * page, seeded by `pnpm db:seed`). `not-found.tsx` isn't guaranteed the
 * route's `[locale]` param (it can be triggered from any nested
 * segment), so this renders in the default locale — the seeded content
 * is bilingual in one block anyway (both `bn`/`en` text in the same
 * `rich_text` block's `LocalizedText`), so this is a cosmetic limitation
 * (locale-prefixed URL vs. the fallback's own ordering), not a broken page.
 */
export default async function NotFound() {
  const page = await getPage("404");
  if (!page) return <p className="p-10 text-center">Page not found.</p>;
  return <BlockRenderer blocks={page.blocksPublished} locale="bn" />;
}
