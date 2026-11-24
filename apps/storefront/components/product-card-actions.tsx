"use client";

import { useState } from "react";
import type { ProductActionsProps } from "@clothing/blocks";
import { useRouter } from "../i18n/navigation";
import { trackEvent } from "../lib/analytics";
import { addToCart } from "../lib/use-cart";
import { useLocalList } from "../lib/use-local-list";
import { planQuickAdd } from "../lib/variant-selection";
import type { ProductDetail } from "../lib/store-api";
import { BagIcon, HeartIcon } from "./icons";
import { useCardActions } from "./product-actions-provider";
import { QuickAddSheet } from "./quick-add-sheet";

const WISHLIST_KEY = "wishlist";

const roundButton =
  "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface/95 text-surface-foreground shadow-sm ring-1 ring-black/5 backdrop-blur-sm transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60";

/** Fetched only when the shopper taps quick add — the card itself carries no variant data. */
async function fetchProduct(slug: string): Promise<ProductDetail> {
  const response = await fetch(`/api/v1/store/catalog/products/${encodeURIComponent(slug)}`, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Product ${slug}: ${response.status}`);
  return (await response.json()) as ProductDetail;
}

/**
 * The two buttons on a product card's photo: a wishlist heart (top right)
 * and quick add (bottom right). Quick add puts a product with nothing to
 * choose straight into the cart; otherwise it opens the size/colour sheet.
 * The layer is exactly the photo's size (same width, 3:4) and lets taps
 * through everywhere except the buttons, so the card link still works.
 */
export function ProductCardActions({ product, locale }: ProductActionsProps) {
  const { text, showToast } = useCardActions();
  const wishlist = useLocalList(WISHLIST_KEY);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const saved = wishlist.has(product.id);

  async function quickAdd() {
    setLoading(true);
    try {
      const full = await fetchProduct(product.slug);
      const plan = planQuickAdd(full);
      if (plan.kind === "add") {
        await addToCart(plan.variantId, 1);
        trackEvent("add_to_cart", { productId: full.id, variantId: plan.variantId, source: "product_card" });
        showToast(text.addedToCart, true);
      } else if (plan.kind === "choose") {
        setDetail(full);
      } else if (plan.kind === "sold_out") {
        showToast(text.outOfStock);
      } else {
        router.push(`/p/${product.slug}`);
      }
    } catch (error) {
      showToast(error instanceof Error && error.message && !error.message.startsWith("Product ") ? error.message : text.addFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[3/4]">
        <button
          type="button"
          onClick={() => wishlist.toggle(product.id)}
          aria-pressed={saved}
          aria-label={saved ? text.removeFromWishlist : text.addToWishlist}
          title={saved ? text.removeFromWishlist : text.addToWishlist}
          className={`${roundButton} absolute right-2 top-2 ${saved ? "text-danger hover:text-danger" : ""}`}
        >
          <HeartIcon className={`h-5 w-5 ${saved ? "fill-current" : ""}`} />
        </button>
        <button type="button" onClick={quickAdd} disabled={loading} aria-busy={loading} aria-label={text.quickAdd} title={text.quickAdd} className={`${roundButton} absolute bottom-2 right-2`}>
          {loading ? <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <BagIcon className="h-5 w-5" />}
        </button>
      </div>
      {detail && <QuickAddSheet product={detail} locale={locale} onClose={() => setDetail(null)} />}
    </>
  );
}
