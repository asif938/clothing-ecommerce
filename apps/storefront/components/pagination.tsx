import { Link } from "../i18n/navigation";

/** SEO-crawlable pagination links (docs/PROJECT_SPEC.md §7.3 "'Load more' with URL page param; SEO-crawlable pagination links") — real `<a>` links, not a client-only "load more" button, so every page is indexable. */
export function Pagination({ page, pageSize, total, basePath, searchParams }: { page: number; pageSize: number; total: number; basePath: string; searchParams: URLSearchParams }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  function hrefFor(targetPage: number): string {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(targetPage));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <nav className="mt-8 flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
      {page > 1 && (
        <Link href={hrefFor(page - 1)} className="rounded-theme border border-border px-3 py-1.5">
          ←
        </Link>
      )}
      <span className="text-surface-foreground/60">
        {page} / {pageCount}
      </span>
      {page < pageCount && (
        <Link href={hrefFor(page + 1)} className="rounded-theme border border-border px-3 py-1.5">
          →
        </Link>
      )}
    </nav>
  );
}
