"use client";

import { useCallback, useEffect, useState } from "react";
import { addCartBundle, addCartItem, getCart, removeCartItem, updateCartItem, type CartResponse } from "./cart-api";

/** Loads the cart once on mount and exposes mutations that each refetch the server's authoritative totals (golden rule 6) — no client-side price math anywhere in the storefront. */
export function useCart() {
  const [data, setData] = useState<CartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    getCart()
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from the server, there's no earlier point this can happen.
    refresh();
  }, [refresh]);

  const addItem = useCallback(async (variantId: string, quantity: number) => {
    setError(null);
    try {
      setData(await addCartItem(variantId, quantity));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to cart");
      throw err;
    }
  }, []);

  /** §16 M10 shop-the-look — adds every component of a bundle product in one call. */
  const addBundle = useCallback(async (bundleProductId: string) => {
    setError(null);
    try {
      setData(await addCartBundle(bundleProductId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this look to your cart");
      throw err;
    }
  }, []);

  const updateItem = useCallback(async (id: string, quantity: number) => {
    setError(null);
    try {
      setData(await updateCartItem(id, quantity));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update cart");
    }
  }, []);

  const removeItem = useCallback(async (id: string) => {
    setError(null);
    try {
      setData(await removeCartItem(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove item");
    }
  }, []);

  const itemCount = data?.cart.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return { data, loading, error, itemCount, refresh, addItem, addBundle, updateItem, removeItem, setCart: setData };
}
