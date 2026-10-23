"use client";

import { useEffect, useState } from "react";
import type { ProductCard } from "./store-api";

/**
 * Client-side counterpart to `product_grid`'s `source: "manual"` lookup
 * (§9.1) — the wishlist and "recently viewed" pages only know which
 * product ids to show *after* reading localStorage in the browser, so
 * they can't use the server-only `storeGet` helpers; this hits the same
 * `/store/catalog/products` endpoint through the same-origin rewrite
 * instead (like `SearchBox` does for suggestions).
 */
export function useProductsByIds(ids: string[]): { products: ProductCard[]; loading: boolean } {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const key = ids.join(",");

  useEffect(() => {
    if (ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing in response to the id-list dependency itself changing, not fetched/external data.
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetch(`/api/v1/store/catalog/products?source=manual&productIds=${ids.map(encodeURIComponent).join(",")}&limit=${Math.min(ids.length, 24)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ProductCard[]) => {
        // Preserve the caller's order (most-recent-first) rather than whatever order the API returned.
        const byId = new Map(data.map((p) => [p.id, p]));
        setProducts(ids.map((id) => byId.get(id)).filter((p): p is ProductCard => !!p));
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
    // `key` (the joined id list) is the real dependency — `ids` itself is a new array reference every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { products, loading };
}
