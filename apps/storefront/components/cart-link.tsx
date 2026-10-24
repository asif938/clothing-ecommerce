"use client";

import { Link } from "../i18n/navigation";
import { useCart } from "../lib/use-cart";

export function CartLink({ locale }: { locale: string }) {
  const { itemCount } = useCart();
  const label = locale === "bn" ? "কার্ট" : "Cart";
  return (
    <Link href="/cart" className="text-sm font-medium text-surface-foreground">
      {label}
      {itemCount > 0 && <span className="ml-1 rounded-full bg-brand px-1.5 text-xs text-brand-foreground">{itemCount}</span>}
    </Link>
  );
}
