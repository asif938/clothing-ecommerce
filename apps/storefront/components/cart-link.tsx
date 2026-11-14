"use client";

import { Link } from "../i18n/navigation";
import { useCart } from "../lib/use-cart";
import { BagIcon } from "./icons";

/** Header cart button: bag icon with item-count badge; the label (UI string) is visible from `sm` up and always announced. */
export function CartLink({ label }: { label: string }) {
  const { itemCount } = useCart();
  return (
    <Link href="/cart" className="relative flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-theme px-2 text-sm font-medium text-surface-foreground" aria-label={itemCount > 0 ? `${label} (${itemCount})` : label}>
      <BagIcon />
      <span className="hidden sm:inline" aria-hidden="true">
        {label}
      </span>
      {itemCount > 0 && (
        <span aria-hidden="true" className="absolute right-0.5 top-1 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-semibold leading-4 text-brand-foreground sm:static sm:text-xs sm:leading-5">
          {itemCount}
        </span>
      )}
    </Link>
  );
}
