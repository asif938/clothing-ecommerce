"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "./product-card";
import { fetchCartRecommendations } from "../lib/personalization-api";
import type { ProductCard as ProductCardData } from "../lib/store-api";

/** Cart upsell slot (docs/PROJECT_SPEC.md §7.5 "frequently bought together", §16 M14): hand-picked relations of the cart's products, then order-history pairs. */
export function CartRecommendations({ productIds, locale }: { productIds: string[]; locale: string }) {
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const key = [...new Set(productIds)].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    void fetchCartRecommendations(key ? key.split(",") : []).then((list) => {
      if (!cancelled) setProducts(list);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (products.length === 0) return null;
  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className="mb-4 text-lg font-semibold text-surface-foreground">{locale === "bn" ? "এগুলোর সাথে প্রায়ই কেনা হয়" : "Frequently bought together"}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {products.slice(0, 4).map((product) => (
          <ProductCard key={product.id} product={product} locale={locale} />
        ))}
      </div>
    </section>
  );
}
