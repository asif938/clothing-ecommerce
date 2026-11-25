"use client";

import { useEffect, useState } from "react";
import { t } from "@clothing/shared";
import { PRODUCT_TILE_CLASS, PRODUCT_TILE_WRAPPER_CLASS, ProductTileContent } from "../../product-tile.tsx";
import { ProductTileActions } from "../../product-actions.tsx";
import type { BlockComponentProps } from "../../registry.ts";
import { SectionHeading } from "../../section-heading.tsx";
import type { ForYouProps } from "./schema.ts";
import { BlockLink } from "../../block-link.tsx";

interface ProductCard {
  id: string;
  slug: string;
  title: { bn?: string; en?: string };
  imageUrl: string | null;
  priceFrom: number;
  compareAtFrom: number | null;
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
    <section className="px-4 py-12 sm:px-8 sm:py-20">
      {heading && <SectionHeading>{t(heading, lang)}</SectionHeading>}
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-12 md:grid-cols-4">
        {state.products.map((product) => (
          <div key={product.id} className={PRODUCT_TILE_WRAPPER_CLASS}>
            <BlockLink href={`${locale === "en" ? "/en" : ""}/p/${product.slug}`} className={PRODUCT_TILE_CLASS}>
              <ProductTileContent product={product} locale={locale} />
            </BlockLink>
            <ProductTileActions product={{ id: product.id, slug: product.slug, title: product.title }} locale={locale} />
          </div>
        ))}
      </div>
    </section>
  );
}
