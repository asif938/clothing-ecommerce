"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ProductActionsContext, type ProductActionsProps } from "@clothing/blocks";
import { Link } from "../i18n/navigation";
import type { CardText } from "../lib/card-text";
import { ProductCardActions } from "./product-card-actions";

interface Toast {
  id: number;
  message: string;
  /** Show a "View cart" link (after a successful add). */
  cartLink: boolean;
}

interface CardActionsContextValue {
  text: CardText;
  showToast: (message: string, cartLink?: boolean) => void;
}

const CardActionsContext = createContext<CardActionsContextValue | null>(null);

export function useCardActions(): CardActionsContextValue {
  const value = useContext(CardActionsContext);
  if (!value) throw new Error("useCardActions must be used inside ProductActionsProvider");
  return value;
}

const TOAST_MS = 3500;

function renderCardActions(props: ProductActionsProps) {
  return <ProductCardActions {...props} />;
}

/**
 * Turns on the wishlist heart and quick-add buttons on every product card
 * (CMS blocks and catalog alike, see `@clothing/blocks` `ProductTileActions`)
 * and shows the short "Added to cart" note at the bottom of the screen.
 */
export function ProductActionsProvider({ text, children }: { text: CardText; children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, cartLink = false) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, cartLink });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <CardActionsContext.Provider value={{ text, showToast }}>
      <ProductActionsContext.Provider value={renderCardActions}>{children}</ProductActionsContext.Provider>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+var(--bottom-nav-offset,0px))] z-[60] flex justify-center px-4">
        {toast && (
          <div key={toast.id} className="pointer-events-auto flex max-w-sm items-center gap-4 rounded-theme bg-surface-foreground px-4 py-3 text-sm text-surface shadow-lg">
            <span>{toast.message}</span>
            {toast.cartLink && (
              <Link href="/cart" className="shrink-0 font-medium underline underline-offset-4">
                {text.viewCart}
              </Link>
            )}
          </div>
        )}
      </div>
    </CardActionsContext.Provider>
  );
}
