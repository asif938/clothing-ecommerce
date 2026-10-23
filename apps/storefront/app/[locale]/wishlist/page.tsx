"use client";

import { useParams } from "next/navigation";
import { ProductCard } from "../../../components/product-card";
import { useLocalList } from "../../../lib/use-local-list";
import { useProductsByIds } from "../../../lib/use-products-by-ids";

const WISHLIST_KEY = "wishlist";

/** Guest wishlist page (docs/PROJECT_SPEC.md §7.3, §7.4) — client-rendered since the list of ids only exists in localStorage; "account sync" is M5's job once customer auth exists (see docs/DECISIONS.md). */
export default function WishlistPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "bn";
  const wishlist = useLocalList(WISHLIST_KEY);
  const { products, loading } = useProductsByIds(wishlist.ids);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "উইশলিস্ট" : "Wishlist"}</h1>
      {loading ? (
        <p className="mt-4 text-sm text-surface-foreground/60">…</p>
      ) : products.length === 0 ? (
        <p className="mt-4 text-sm text-surface-foreground/60">{locale === "bn" ? "উইশলিস্ট খালি।" : "Your wishlist is empty."}</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
