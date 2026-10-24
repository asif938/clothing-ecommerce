"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Link } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import { useCart } from "../lib/use-cart";
import { setCartCodes } from "../lib/cart-api";

/** Cart page (docs/PROJECT_SPEC.md §7.5) — line items, coupon field, free-delivery progress, totals breakdown. The drawer variant named in the spec isn't built separately; this same component is the one surface, reachable from the header's cart link. */
export function CartView() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "bn";
  const cart = useCart();
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  async function applyCode() {
    if (!codeInput.trim() || !cart.data) return;
    setCodeError(null);
    try {
      const existing = cart.data.cart.couponCodes;
      cart.setCart(await setCartCodes([...existing, codeInput.trim()]));
      setCodeInput("");
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : "Could not apply code");
    }
  }

  async function removeCode(code: string) {
    if (!cart.data) return;
    cart.setCart(await setCartCodes(cart.data.cart.couponCodes.filter((c) => c !== code)));
  }

  if (cart.loading) return <div className="mx-auto max-w-3xl px-4 py-10">…</div>;
  if (cart.error) return <div className="mx-auto max-w-3xl px-4 py-10 text-danger">{cart.error}</div>;
  if (!cart.data || cart.data.pricing.lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-surface-foreground/70">{locale === "bn" ? "আপনার কার্ট খালি।" : "Your cart is empty."}</p>
        <Link href="/" className="mt-4 inline-block text-brand underline">
          {locale === "bn" ? "শপিং চালিয়ে যান" : "Continue shopping"}
        </Link>
      </div>
    );
  }

  const { pricing } = cart.data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <h1 className="mb-6 text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "কার্ট" : "Your cart"}</h1>

      {pricing.freeDeliveryRemaining !== null && (
        <p className="mb-4 rounded-theme bg-brand/10 px-4 py-2 text-sm text-brand">
          {locale === "bn"
            ? `ফ্রি ডেলিভারির জন্য আরও ${formatBdt(pricing.freeDeliveryRemaining)} কিনুন`
            : `Add ${formatBdt(pricing.freeDeliveryRemaining)} more for free delivery`}
        </p>
      )}

      <div className="divide-y divide-border border-y border-border">
        {pricing.lines.map((line) => (
          <div key={line.cartItemId} className="flex items-center gap-4 py-4">
            {line.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- pre-sized media URL from the API's own image pipeline.
              <img src={line.imageUrl} alt="" className="h-20 w-16 rounded-theme object-cover" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-surface-foreground">{line.title.en ?? line.title.bn}</p>
              <p className="text-sm text-surface-foreground/60">{formatBdt(line.unitPrice)}</p>
              {line.clamped && <p className="text-xs text-danger">{locale === "bn" ? `মাত্র ${line.available} স্টকে আছে` : `Only ${line.available} in stock`}</p>}
              {line.priceChanged && <p className="text-xs text-amber-600">{locale === "bn" ? "দাম পরিবর্তিত হয়েছে" : "Price changed since added"}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => cart.updateItem(line.cartItemId, line.quantity - 1)} className="h-8 w-8 rounded-theme border border-border" disabled={line.quantity <= 1}>
                −
              </button>
              <span className="w-6 text-center text-sm">{line.quantity}</span>
              <button onClick={() => cart.updateItem(line.cartItemId, line.quantity + 1)} className="h-8 w-8 rounded-theme border border-border">
                +
              </button>
            </div>
            <p className="w-20 text-right text-sm font-medium">{formatBdt(line.lineTotal)}</p>
            <button onClick={() => cart.removeItem(line.cartItemId)} className="text-xs text-surface-foreground/50 underline">
              {locale === "bn" ? "সরান" : "Remove"}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder={locale === "bn" ? "কুপন কোড" : "Coupon code"}
          className="flex-1 rounded-theme border border-border px-3 py-2 text-sm"
        />
        <button onClick={applyCode} className="rounded-theme border border-brand px-4 py-2 text-sm text-brand">
          {locale === "bn" ? "প্রয়োগ করুন" : "Apply"}
        </button>
      </div>
      {codeError && <p className="mt-1 text-xs text-danger">{codeError}</p>}
      {cart.data.cart.couponCodes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {cart.data.cart.couponCodes.map((code) => (
            <li key={code} className="flex items-center gap-1 rounded-theme bg-surface-foreground/10 px-2 py-1 text-xs">
              {code}
              <button onClick={() => removeCode(code)} aria-label="remove">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {pricing.discounts.rejectedCodes.map((r) => (
        <p key={r.code} className="mt-1 text-xs text-danger">
          {r.code}: {r.message}
        </p>
      ))}

      <div className="mt-6 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>{locale === "bn" ? "সাবটোটাল" : "Subtotal"}</span>
          <span>{formatBdt(pricing.subtotal)}</span>
        </div>
        {pricing.discounts.totalDiscount > 0 && (
          <div className="flex justify-between text-brand">
            <span>{locale === "bn" ? "ডিসকাউন্ট" : "Discount"}</span>
            <span>-{formatBdt(pricing.discounts.totalDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-surface-foreground">
          <span>{locale === "bn" ? "মোট" : "Total"}</span>
          <span>{formatBdt(pricing.subtotalAfterDiscounts)}</span>
        </div>
        <p className="text-xs text-surface-foreground/50">{locale === "bn" ? "ডেলিভারি চার্জ চেকআউটে হিসাব করা হবে" : "Delivery fee calculated at checkout"}</p>
      </div>

      {pricing.warnings.map((w, i) => (
        <p key={i} className="mt-2 text-xs text-amber-600">
          {w}
        </p>
      ))}

      <Link href="/checkout" className="mt-6 block rounded-theme bg-brand px-6 py-3 text-center text-sm font-medium text-brand-foreground">
        {locale === "bn" ? "চেকআউট" : "Checkout"}
      </Link>
    </div>
  );
}
