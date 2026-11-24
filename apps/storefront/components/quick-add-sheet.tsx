"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { t } from "@clothing/shared";
import { Link } from "../i18n/navigation";
import { trackEvent } from "../lib/analytics";
import { formatBdt } from "../lib/money";
import { addToCart } from "../lib/use-cart";
import { initialSelection, isPurchasable, isValueAvailable, matchVariant, type Selection } from "../lib/variant-selection";
import type { ProductDetail } from "../lib/store-api";
import { CloseIcon } from "./icons";
import { useCardActions } from "./product-actions-provider";

/**
 * Size/colour picker opened by a card's quick-add button: a bottom sheet on
 * phones, a centred dialog from `sm` up. Colour (and any one-value option)
 * is pre-picked; size never is. Unavailable choices are struck through, the
 * price follows the chosen variant, and the full product page is one tap
 * away. Escape, the backdrop and the close button all close it.
 */
export function QuickAddSheet({ product, locale, onClose }: { product: ProductDetail; locale: string; onClose: () => void }) {
  const { text, showToast } = useCardActions();
  const lang = locale as "bn" | "en";
  const isPreorder = product.productType === "preorder";
  const [selection, setSelection] = useState<Selection>(() => initialSelection(product.options, product.variants, isPreorder));
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const variant = useMemo(() => matchVariant(product.options, product.variants, selection), [product.options, product.variants, selection]);
  const canBuy = variant !== null && isPurchasable(variant, isPreorder);

  const colorOption = product.options.find((o) => o.type === "color");
  const image = useMemo(() => {
    const colorValueId = colorOption ? selection[colorOption.id] : undefined;
    return (colorValueId && product.media.find((m) => m.optionValueId === colorValueId && m.url)) || product.media.find((m) => !m.optionValueId && m.url) || product.media.find((m) => m.url) || null;
  }, [product.media, colorOption, selection]);

  const prices = product.variants.filter((v) => v.isActive).map((v) => v.price);
  const price = variant ? variant.price : prices.length > 0 ? Math.min(...prices) : null;
  const compareAt = variant?.compareAtPrice && variant.compareAtPrice > variant.price ? variant.compareAtPrice : null;

  async function add() {
    if (!variant || !canBuy) return;
    setAdding(true);
    setError(null);
    try {
      await addToCart(variant.id, 1);
      trackEvent("add_to_cart", { productId: product.id, variantId: variant.id, source: "quick_add" });
      showToast(text.addedToCart, true);
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : text.addFailed);
    } finally {
      setAdding(false);
    }
  }

  const missing = product.options.find((option) => !selection[option.id]);
  const buttonLabel = missing ? `${text.chooseOption} ${t(missing.name, lang)}` : variant && !canBuy ? text.outOfStock : isPreorder ? text.preorder : text.quickAdd;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full flex-col gap-5 overflow-y-auto rounded-t-2xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-theme sm:p-6"
      >
        <div className="flex gap-4">
          {image?.url && (
            // eslint-disable-next-line @next/next/no-img-element -- see apps/storefront/components/header.tsx
            <img src={image.url} alt="" className="aspect-[3/4] w-20 shrink-0 rounded-theme bg-muted object-cover" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 id={titleId} className="line-clamp-2 text-base font-medium leading-snug text-surface-foreground">
              {t(product.title, lang)}
            </h2>
            {price !== null && (
              <p className="flex items-baseline gap-2 text-sm font-medium text-surface-foreground">
                {formatBdt(price)}
                {compareAt && <span className="text-xs font-normal text-surface-foreground/45 line-through">{formatBdt(compareAt)}</span>}
              </p>
            )}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={text.close} className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-surface-foreground/60 hover:text-surface-foreground">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {product.options.map((option) => (
          <fieldset key={option.id} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-surface-foreground">
              {t(option.name, lang)}
              {option.type === "color" && selection[option.id] && (
                <span className="font-normal text-surface-foreground/60"> · {t(option.values.find((v) => v.id === selection[option.id])?.value ?? null, lang)}</span>
              )}
            </legend>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const available = isValueAvailable(product.options, product.variants, selection, option.id, value.id, isPreorder);
                const chosen = selection[option.id] === value.id;
                const label = t(value.value, lang);
                const choose = () => {
                  setError(null);
                  setSelection((prev) => ({ ...prev, [option.id]: value.id }));
                };
                if (option.type === "color") {
                  return (
                    <button
                      key={value.id}
                      type="button"
                      onClick={choose}
                      aria-pressed={chosen}
                      aria-label={label}
                      title={label}
                      className={`relative h-11 w-11 rounded-full border-2 p-0.5 ${chosen ? "border-brand" : "border-transparent"} ${available ? "" : "opacity-40"}`}
                    >
                      <span className="block h-full w-full overflow-hidden rounded-full ring-1 ring-black/10" style={value.colorHex ? { backgroundColor: value.colorHex } : undefined}>
                        {value.swatchImageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element -- see apps/storefront/components/header.tsx
                          <img src={value.swatchImageUrl} alt="" className="h-full w-full object-cover" />
                        )}
                      </span>
                    </button>
                  );
                }
                return (
                  <button
                    key={value.id}
                    type="button"
                    onClick={choose}
                    disabled={!available}
                    aria-pressed={chosen}
                    className={`min-h-11 min-w-12 rounded-theme border px-4 text-sm ${chosen ? "border-brand bg-brand/10 font-medium text-surface-foreground" : "border-border text-surface-foreground"} ${available ? "" : "cursor-not-allowed text-surface-foreground/30 line-through"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <button type="button" onClick={add} disabled={!canBuy || adding} className="min-h-12 w-full rounded-theme bg-brand px-6 text-sm font-medium text-brand-foreground disabled:opacity-50">
            {adding ? "…" : buttonLabel}
          </button>
          <Link href={`/p/${product.slug}`} onClick={onClose} className="py-1 text-center text-sm text-surface-foreground/70 underline underline-offset-4 hover:text-brand">
            {text.viewDetails}
          </Link>
        </div>
      </div>
    </div>
  );
}
