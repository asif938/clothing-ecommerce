"use client";

import { useEffect, useMemo, useState } from "react";
import { t } from "@clothing/shared";
import { Link, useRouter } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import { useCart } from "../lib/use-cart";
import { ProductCard } from "./product-card";
import { SizeChartModal } from "./size-chart-modal";
import { NotifyMeForm } from "./notify-me-form";
import { WishlistButton } from "./wishlist-button";
import { RecentlyViewedTracker } from "./recently-viewed-tracker";
import { RecentlyViewedSection } from "./recently-viewed-section";
import { trackEvent } from "../lib/analytics";
import type { ProductDetail } from "../lib/store-api";

function sameCombination(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export function ProductDetailView({ product, locale, whatsappNumber }: { product: ProductDetail; locale: string; whatsappNumber: string | null }) {
  const colorOption = product.options.find((o) => o.type === "color");
  const sizeOption = product.options.find((o) => o.type === "size");
  const otherOptions = product.options.filter((o) => o !== colorOption && o !== sizeOption);

  const [selected, setSelected] = useState<Record<string, string>>(() => {
    // Default to the first value of each option so a single-option (or
    // free-size, zero-option) product already has a fully resolved variant.
    const initial: Record<string, string> = {};
    for (const option of product.options) {
      const firstValue = option.values[0];
      if (firstValue) initial[option.id] = firstValue.id;
    }
    return initial;
  });
  const [showSizeChart, setShowSizeChart] = useState(false);
  const [showNotifyMe, setShowNotifyMe] = useState(false);
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const cart = useCart();
  const router = useRouter();

  useEffect(() => {
    trackEvent("view_item", { productId: product.id, slug: product.slug });
    // Fire once per product view, not on every re-render as selection state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const selectedValueIds = useMemo(() => Object.values(selected), [selected]);

  const matchedVariant = useMemo(
    () => product.variants.find((v) => sameCombination(v.optionValueIds, selectedValueIds)) ?? null,
    [product.variants, selectedValueIds],
  );

  const prices = product.variants.map((v) => v.price);
  const priceLabel = matchedVariant ? formatBdt(matchedVariant.price) : prices.length > 0 ? `${formatBdt(Math.min(...prices))} – ${formatBdt(Math.max(...prices))}` : "";

  const galleryMedia = useMemo(() => {
    const colorValueId = colorOption ? selected[colorOption.id] : undefined;
    const forColor = colorValueId ? product.media.filter((m) => m.optionValueId === colorValueId) : [];
    const generic = product.media.filter((m) => !m.optionValueId);
    return forColor.length > 0 ? forColor : generic.length > 0 ? generic : product.media;
  }, [product.media, colorOption, selected]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  /** A given option value is unavailable if no active, in-stock variant exists once it's combined with everything else currently selected. */
  function isValueDisabled(optionId: string, valueId: string): boolean {
    const candidate = { ...selected, [optionId]: valueId };
    const candidateIds = Object.values(candidate);
    const variant = product.variants.find((v) => sameCombination(v.optionValueIds, candidateIds));
    return !variant || !variant.available;
  }

  function selectValue(optionId: string, valueId: string) {
    setSelected((prev) => ({ ...prev, [optionId]: valueId }));
    setActiveImageIndex(0);
    setShowNotifyMe(false);
  }

  async function handleAddToCart(buyNow: boolean) {
    if (!matchedVariant) return;
    setAdding(true);
    setCartMessage(null);
    try {
      await cart.addItem(matchedVariant.id, 1);
      trackEvent("add_to_cart", { productId: product.id, variantId: matchedVariant.id });
      if (buyNow) {
        router.push("/checkout");
      } else {
        setCartMessage(locale === "bn" ? "কার্টে যুক্ত হয়েছে।" : "Added to your cart.");
      }
    } catch (error) {
      setCartMessage(error instanceof Error ? error.message : "Could not add to cart");
    } finally {
      setAdding(false);
    }
  }

  // Set after mount (not during the initial server-rendered pass) so the
  // href never differs between server and client markup — `window.location`
  // doesn't exist on the server at all.
  const [pageUrl, setPageUrl] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading window.location, not external data; there's no other point this can happen before first paint.
    setPageUrl(window.location.href);
  }, []);
  const whatsappHref = whatsappNumber && `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`${t(product.title, locale as "bn" | "en")} — ${pageUrl}`)}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <RecentlyViewedTracker productId={product.id} />
      <nav className="mb-4 flex flex-wrap gap-1 text-xs text-surface-foreground/50" aria-label="Breadcrumb">
        <Link href="/">{locale === "bn" ? "হোম" : "Home"}</Link>
        {product.breadcrumb.map((entry) => (
          <span key={entry.id}>
            {" "}
            / <Link href={`/c/${entry.slug}`}>{t(entry.name, locale as "bn" | "en")}</Link>
          </span>
        ))}
      </nav>

      <div className="grid gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="aspect-square overflow-hidden rounded-theme bg-muted">
            {galleryMedia[activeImageIndex]?.url && (
              // eslint-disable-next-line @next/next/no-img-element -- see apps/storefront/components/header.tsx
              <img src={galleryMedia[activeImageIndex]?.url ?? undefined} alt={t(product.title, locale as "bn" | "en")} className="h-full w-full object-cover" />
            )}
          </div>
          {galleryMedia.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {galleryMedia.map((media, index) => (
                <button key={media.id} onClick={() => setActiveImageIndex(index)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-theme border ${index === activeImageIndex ? "border-brand" : "border-border"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- see apps/storefront/components/header.tsx */}
                  {media.url && <img src={media.url} alt="" className="h-full w-full object-cover" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold text-surface-foreground">{t(product.title, locale as "bn" | "en")}</h1>
          {product.ratingCount > 0 ? (
            <p className="text-sm text-surface-foreground/70">
              ★ {product.ratingAvg.toFixed(1)} ({product.ratingCount} {locale === "bn" ? "রিভিউ" : "reviews"})
            </p>
          ) : (
            <p className="text-sm text-surface-foreground/50">{locale === "bn" ? "এখনো কোনো রিভিউ নেই" : "No reviews yet"}</p>
          )}

          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold text-surface-foreground">{priceLabel}</span>
            {matchedVariant?.compareAtPrice && <span className="text-sm text-surface-foreground/50 line-through">{formatBdt(matchedVariant.compareAtPrice)}</span>}
          </div>

          {product.shortDescription && <p className="text-sm text-surface-foreground/80">{t(product.shortDescription, locale as "bn" | "en")}</p>}

          {colorOption && (
            <div>
              <span className="text-sm font-medium text-surface-foreground">{t(colorOption.name, locale as "bn" | "en")}</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {colorOption.values.map((value) => (
                  <button
                    key={value.id}
                    onClick={() => selectValue(colorOption.id, value.id)}
                    aria-pressed={selected[colorOption.id] === value.id}
                    className={`h-9 w-9 rounded-full border-2 ${selected[colorOption.id] === value.id ? "border-brand" : "border-border"}`}
                    style={value.colorHex ? { backgroundColor: value.colorHex } : undefined}
                    title={t(value.value, locale as "bn" | "en")}
                  >
                    {value.swatchImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- see apps/storefront/components/header.tsx
                      <img src={value.swatchImageUrl} alt="" className="h-full w-full rounded-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {sizeOption && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-surface-foreground">{t(sizeOption.name, locale as "bn" | "en")}</span>
                {product.sizeChart && (
                  <button onClick={() => setShowSizeChart(true)} className="text-xs text-brand underline">
                    {locale === "bn" ? "সাইজ চার্ট" : "Size chart"}
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {sizeOption.values.map((value) => {
                  const disabled = isValueDisabled(sizeOption.id, value.id);
                  return (
                    <button
                      key={value.id}
                      disabled={disabled}
                      onClick={() => selectValue(sizeOption.id, value.id)}
                      aria-pressed={selected[sizeOption.id] === value.id}
                      className={`rounded-theme border px-4 py-2 text-sm ${selected[sizeOption.id] === value.id ? "border-brand bg-brand/10" : "border-border"} ${disabled ? "cursor-not-allowed text-surface-foreground/30 line-through" : ""}`}
                    >
                      {t(value.value, locale as "bn" | "en")}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {otherOptions.map((option) => (
            <div key={option.id}>
              <span className="text-sm font-medium text-surface-foreground">{t(option.name, locale as "bn" | "en")}</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {option.values.map((value) => (
                  <button
                    key={value.id}
                    onClick={() => selectValue(option.id, value.id)}
                    className={`rounded-theme border px-4 py-2 text-sm ${selected[option.id] === value.id ? "border-brand bg-brand/10" : "border-border"}`}
                  >
                    {t(value.value, locale as "bn" | "en")}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {matchedVariant && !matchedVariant.available ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-danger">{locale === "bn" ? "স্টক শেষ" : "Out of stock"}</p>
              {showNotifyMe ? (
                <NotifyMeForm variantId={matchedVariant.id} locale={locale} />
              ) : (
                <button onClick={() => setShowNotifyMe(true)} className="w-fit rounded-theme border border-border px-4 py-2 text-sm">
                  {locale === "bn" ? "স্টকে আসলে জানান" : "Notify me"}
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <button disabled={adding} onClick={() => handleAddToCart(false)} className="flex-1 rounded-theme bg-brand px-6 py-3 text-sm font-medium text-brand-foreground disabled:opacity-60">
                {locale === "bn" ? "কার্টে যুক্ত করুন" : "Add to cart"}
              </button>
              <button disabled={adding} onClick={() => handleAddToCart(true)} className="flex-1 rounded-theme border border-brand px-6 py-3 text-sm font-medium text-brand disabled:opacity-60">
                {locale === "bn" ? "এখনই কিনুন" : "Buy now"}
              </button>
              <WishlistButton productId={product.id} locale={locale} />
            </div>
          )}
          {cartMessage && <p className="text-xs text-surface-foreground/60">{cartMessage}</p>}

          {whatsappHref && (
            <a href={whatsappHref} target="_blank" rel="noreferrer" className="w-fit rounded-theme border border-success px-4 py-2 text-sm text-success">
              {locale === "bn" ? "হোয়াটসঅ্যাপে অর্ডার করুন" : "Order on WhatsApp"}
            </a>
          )}

          {(product.fabric || product.careInstructions || product.modelInfo) && (
            <dl className="flex flex-col gap-1 border-t border-border pt-4 text-sm">
              {product.fabric && (
                <div className="flex gap-2">
                  <dt className="font-medium text-surface-foreground">{locale === "bn" ? "ফেব্রিক" : "Fabric"}</dt>
                  <dd className="text-surface-foreground/70">{t(product.fabric, locale as "bn" | "en")}</dd>
                </div>
              )}
              {product.careInstructions && (
                <div className="flex gap-2">
                  <dt className="font-medium text-surface-foreground">{locale === "bn" ? "যত্ন" : "Care"}</dt>
                  <dd className="text-surface-foreground/70">{t(product.careInstructions, locale as "bn" | "en")}</dd>
                </div>
              )}
              {product.modelInfo && (
                <div className="flex gap-2">
                  <dt className="font-medium text-surface-foreground">{locale === "bn" ? "মডেল তথ্য" : "Model info"}</dt>
                  <dd className="text-surface-foreground/70">{t(product.modelInfo, locale as "bn" | "en")}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>

      {product.description && (
        <section className="mt-10 border-t border-border pt-6">
          <h2 className="mb-2 text-lg font-semibold text-surface-foreground">{locale === "bn" ? "বিবরণ" : "Description"}</h2>
          <p className="whitespace-pre-line text-sm text-surface-foreground/80">{t(product.description, locale as "bn" | "en")}</p>
        </section>
      )}

      {Object.entries(product.relations).map(([type, items]) =>
        items.length > 0 ? (
          <section key={type} className="mt-10 border-t border-border pt-6">
            <h2 className="mb-4 text-lg font-semibold text-surface-foreground">{relationTitle(type, locale)}</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {items.map((item) => (
                <ProductCard key={item.id} product={item} locale={locale} />
              ))}
            </div>
          </section>
        ) : null,
      )}

      <RecentlyViewedSection excludeId={product.id} locale={locale} />

      {/* Sticky add-to-cart bar on mobile (§7.4) */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 shadow-lg sm:hidden">
        <span className="text-sm font-semibold text-surface-foreground">{priceLabel}</span>
        <button disabled={adding} onClick={() => handleAddToCart(false)} className="rounded-theme bg-brand px-5 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60">
          {locale === "bn" ? "কার্টে যুক্ত করুন" : "Add to cart"}
        </button>
      </div>

      {showSizeChart && product.sizeChart && <SizeChartModal sizeChart={product.sizeChart} locale={locale} onClose={() => setShowSizeChart(false)} />}
    </div>
  );
}

function relationTitle(type: string, locale: string): string {
  const titles: Record<string, { bn: string; en: string }> = {
    similar: { bn: "একই রকম পণ্য", en: "Similar products" },
    complete_the_look: { bn: "লুকটি সম্পূর্ণ করুন", en: "Complete the look" },
    upsell: { bn: "আরও দেখুন", en: "You may also like" },
    cross_sell: { bn: "একসাথে কেনা হয়", en: "Frequently bought together" },
  };
  const entry = titles[type] ?? { bn: type, en: type };
  return locale === "bn" ? entry.bn : entry.en;
}
