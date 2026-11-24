"use client";

import { useCallback, useEffect, useState } from "react";
import { addCartBundle, addCartItem, getCart, removeCartItem, updateCartItem, type CartResponse } from "./cart-api";

/** Fired with the new `CartResponse` after any change, so every `useCart()` on the page (e.g. the header badge) shows it without refetching. */
const CART_UPDATED_EVENT = "cart:updated";

function broadcast(data: CartResponse) {
  window.dispatchEvent(new CustomEvent<CartResponse>(CART_UPDATED_EVENT, { detail: data }));
}

/**
 * One shared request for components that load the cart at the same moment
 * (header badge, bottom bar, cart page all mount together), instead of one
 * each. Cleared as soon as it settles, so a later `refresh()` always asks
 * the server again — never a stale cache (golden rule 6).
 */
let inflight: Promise<CartResponse> | null = null;

function loadCart(): Promise<CartResponse> {
  if (!inflight) {
    inflight = getCart().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Adds to the cart without loading it first — for product-card quick add, where a full `useCart()` per card would fetch the cart once per card. Every `useCart()` on the page still updates. */
export async function addToCart(variantId: string, quantity: number): Promise<CartResponse> {
  const data = await addCartItem(variantId, quantity);
  broadcast(data);
  return data;
}

/** Loads the cart once on mount and exposes mutations that each refetch the server's authoritative totals (golden rule 6) — no client-side price math anywhere in the storefront. */
export function useCart() {
  const [data, setData] = useState<CartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    loadCart()
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from the server, there's no earlier point this can happen.
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onUpdated = (event: Event) => setData((event as CustomEvent<CartResponse>).detail);
    window.addEventListener(CART_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(CART_UPDATED_EVENT, onUpdated);
  }, []);

  const addItem = useCallback(async (variantId: string, quantity: number) => {
    setError(null);
    try {
      broadcast(await addCartItem(variantId, quantity));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to cart");
      throw err;
    }
  }, []);

  /** §16 M10 shop-the-look — adds every component of a bundle product in one call. */
  const addBundle = useCallback(async (bundleProductId: string) => {
    setError(null);
    try {
      broadcast(await addCartBundle(bundleProductId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this look to your cart");
      throw err;
    }
  }, []);

  const updateItem = useCallback(async (id: string, quantity: number) => {
    setError(null);
    try {
      broadcast(await updateCartItem(id, quantity));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update cart");
    }
  }, []);

  const removeItem = useCallback(async (id: string) => {
    setError(null);
    try {
      broadcast(await removeCartItem(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove item");
    }
  }, []);

  const itemCount = data?.cart.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return { data, loading, error, itemCount, refresh, addItem, addBundle, updateItem, removeItem, setCart: broadcast };
}
