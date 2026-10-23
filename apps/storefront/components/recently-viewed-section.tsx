"use client";

import { ProductCard } from "./product-card";
import { useLocalList } from "../lib/use-local-list";
import { useProductsByIds } from "../lib/use-products-by-ids";

const RECENTLY_VIEWED_KEY = "recently-viewed";

/** "Recently viewed" (docs/PROJECT_SPEC.md §7.2: "shown on PDP, cart, 404") — this milestone wires it on the PDP. */
export function RecentlyViewedSection({ excludeId, locale }: { excludeId?: string; locale: string }) {
  const recentlyViewed = useLocalList(RECENTLY_VIEWED_KEY);
  const ids = recentlyViewed.ids.filter((id) => id !== excludeId).slice(0, 8);
  const { products } = useProductsByIds(ids);

  if (products.length === 0) return null;

  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className="mb-4 text-lg font-semibold text-surface-foreground">{locale === "bn" ? "সম্প্রতি দেখা হয়েছে" : "Recently viewed"}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} locale={locale} />
        ))}
      </div>
    </section>
  );
}
