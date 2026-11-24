"use client";

import { createContext, useContext, type ReactNode } from "react";

/** What a card's action buttons need to know about its product. */
export interface ProductActionsTarget {
  id: string;
  slug: string;
  title: { bn?: string; en?: string };
}

export interface ProductActionsProps {
  product: ProductActionsTarget;
  locale: string;
}

/**
 * Slot for the buttons that sit on a product card's photo (wishlist heart,
 * quick add). They need the storefront's cart and wishlist, which this
 * package doesn't own, so the storefront supplies the component through this
 * context (`ProductActionsProvider` in its layout, as a render function) and every card — block or
 * catalog — renders `ProductTileActions` beside its link. With no provider,
 * cards simply have no buttons.
 */
export const ProductActionsContext = createContext<((props: ProductActionsProps) => ReactNode) | null>(null);

export function ProductTileActions(props: ProductActionsProps) {
  const renderActions = useContext(ProductActionsContext);
  return renderActions ? renderActions(props) : null;
}
