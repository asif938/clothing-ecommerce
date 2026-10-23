"use client";

import { useLocalList } from "../lib/use-local-list";

const WISHLIST_KEY = "wishlist";

/** Guest wishlist toggle (docs/PROJECT_SPEC.md §7.4/§7.2) — see `use-local-list.ts` for why this is client-only/localStorage for now. */
export function WishlistButton({ productId, locale }: { productId: string; locale: string }) {
  const wishlist = useLocalList(WISHLIST_KEY);
  const active = wishlist.has(productId);

  return (
    <button
      type="button"
      onClick={() => wishlist.toggle(productId)}
      aria-pressed={active}
      className={`rounded-theme border px-3 py-2 text-sm ${active ? "border-danger text-danger" : "border-border text-surface-foreground/70"}`}
    >
      {active ? "♥" : "♡"} {locale === "bn" ? "উইশলিস্ট" : "Wishlist"}
    </button>
  );
}
