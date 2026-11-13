"use client";

import { useEffect, useState } from "react";
import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import type { ForYouProps } from "./schema.ts";

interface ProductCard {
  id: string;
  slug: string;
  title: { bn?: string; en?: string };
  imageUrl: string | null;
  priceFrom: number;
  compareAtFrom: number | null;
}

function formatBdt(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString("en-US")}`;
}

/** The storefront's recently-viewed list (`apps/storefront/lib/use-local-list.ts`, key "recently-viewed"): product ids, most recent first. */
function recentlyViewed(): string[] {
  try {
    const raw = window.localStorage.getItem("recently-viewed");
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

/**
 * "For you" (§9.1 phase 2, §16 M14). Client-side on purpose, like
 * `AudienceGate`: the page stays one cached HTML for everyone and only this
 * block asks the API for the visitor's picks (recently viewed ids from the
 * browser + purchase history when logged in). Renders nothing until it has
 * products, and nothing at all on failure.
 */
export function ForYouBlock({ props, locale }: BlockComponentProps<ForYouProps>) {
  const [state, setState] = useState<{ products: ProductCard[]; personalized: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ limit: String(props.limit) });
    const viewed = recentlyViewed();
    if (viewed.length > 0) query.set("viewed", viewed.join(","));
    fetch(`/api/v1/store/recommendations/for-you?${query.toString()}`, { credentials: "same-origin", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ products: ProductCard[]; personalized: boolean }>) : null))
      .then((data) => {
        if (!cancelled && data) setState(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [props.limit]);

  if (!state || state.products.length === 0) return null;
  const heading = state.personalized ? props.heading : (props.fallbackHeading ?? props.heading);
  const lang = locale as "bn" | "en";

  return (
    <section className="px-6 py-10">
      {heading && <h2 className="mb-4 text-center text-2xl font-semibold text-surface-foreground">{t(heading, lang)}</h2>}
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {state.products.map((product) => (
          <a key={product.id} href={`${locale === "en" ? "/en" : ""}/p/${product.slug}`} className="group flex flex-col gap-2">
            <div className="aspect-[3/4] overflow-hidden rounded-theme bg-muted">
              {product.imageUrl && <img src={product.imageUrl} alt={t(product.title, lang)} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />}
            </div>
            <span className="truncate text-sm text-surface-foreground">{t(product.title, lang)}</span>
            <span className="flex items-center gap-2 text-sm font-medium text-surface-foreground">
              {formatBdt(product.priceFrom)}
              {product.compareAtFrom && <span className="text-xs text-surface-foreground/50 line-through">{formatBdt(product.compareAtFrom)}</span>}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
