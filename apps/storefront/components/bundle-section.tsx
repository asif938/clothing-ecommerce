"use client";

import { useState } from "react";
import { t } from "@clothing/shared";
import { Link } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import { useCart } from "../lib/use-cart";
import type { ProductDetail } from "../lib/store-api";

/**
 * Shop-the-look bundle (docs/PROJECT_SPEC.md §16 M10). The bundle
 * `Product` itself is never added to a cart — this button adds every
 * component variant in one call (`POST /store/cart/bundles/:id`); the
 * combined-price preview here is computed the same way
 * `CartPricingService`'s real bundle match will (see `bundle-pricing.ts`),
 * just so the customer sees the discount before clicking, not as the
 * authoritative total (golden rule 6 — the cart page's own total is).
 */
export function BundleSection({ product, locale }: { product: ProductDetail; locale: string }) {
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const cart = useCart();

  if (product.bundleItems.length === 0) return null;

  const combinedTotal = product.bundleItems.reduce((sum, item) => sum + item.variant.price * item.quantity, 0);
  const discount =
    product.bundleDiscountType === "percent"
      ? Math.round((combinedTotal * (product.bundleDiscountValue ?? 0)) / 100)
      : product.bundleDiscountType === "fixed_price"
        ? Math.max(0, combinedTotal - (product.bundleDiscountValue ?? 0))
        : 0;
  const bundlePrice = combinedTotal - discount;
  const anyUnavailable = product.bundleItems.some((item) => !item.variant.isActive);

  async function addLook() {
    setAdding(true);
    setMessage(null);
    try {
      await cart.addBundle(product.id);
      setMessage(locale === "bn" ? "লুকের সব আইটেম কার্টে যুক্ত হয়েছে।" : "Every item in this look was added to your cart.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add this look to your cart");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className="mb-4 text-lg font-semibold text-surface-foreground">{locale === "bn" ? "এই লুকটি কিনুন" : "Shop this look"}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {product.bundleItems.map((item) => (
          <Link key={item.id} href={`/p/${item.product.slug}`} className="flex flex-col gap-2">
            <div className="aspect-square overflow-hidden rounded-theme bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- see apps/storefront/components/header.tsx */}
              {item.imageUrl && <img src={item.imageUrl} alt={t(item.product.title, locale as "bn" | "en")} className="h-full w-full object-cover" />}
            </div>
            <span className="truncate text-xs text-surface-foreground">{t(item.product.title, locale as "bn" | "en")}</span>
            <span className="text-xs text-surface-foreground/70">{formatBdt(item.variant.price)}</span>
          </Link>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-sm font-semibold text-surface-foreground">{formatBdt(bundlePrice)}</span>
        {discount > 0 && <span className="text-xs text-surface-foreground/50 line-through">{formatBdt(combinedTotal)}</span>}
        <button disabled={adding || anyUnavailable} onClick={addLook} className="rounded-theme bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60">
          {locale === "bn" ? "সম্পূর্ণ লুক কার্টে যুক্ত করুন" : "Add the whole look"}
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-surface-foreground/60">{message}</p>}
    </section>
  );
}
