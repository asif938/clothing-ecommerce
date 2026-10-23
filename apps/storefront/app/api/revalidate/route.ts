import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Publishing pipeline target (docs/PROJECT_SPEC.md §9.6) — the API's
 * `RevalidationService` posts here with the shared secret whenever
 * settings, a page, a menu, an announcement, or a popup changes, so the
 * storefront reflects it without a deploy (M3 acceptance scenario: within
 * 10s — `revalidateTag` takes effect on the next request, well under that).
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-revalidate-secret");
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Invalid revalidation secret" } }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { tags?: string[] } | null;
  const tags = body?.tags ?? [];
  // Next 16's `revalidateTag` requires a profile/expiry argument now —
  // `{ expire: 0 }` means "treat this tag's cached data as stale
  // immediately," matching the old no-argument on-demand behavior.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });

  return NextResponse.json({ revalidated: tags });
}
