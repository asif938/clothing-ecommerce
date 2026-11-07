"use client";

import { useState } from "react";

export interface LookbookHotspotCard {
  id: string;
  slug: string;
  title: { bn?: string; en?: string };
  imageUrl: string | null;
  priceFrom: number;
}

function formatBdt(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString("en-US")}`;
}

/**
 * The only client-side piece of the `lookbook` block (docs/PROJECT_SPEC.md
 * §16 M10) — a tap/click opens one hotspot's product card, tapping it
 * again (or another dot) closes/switches it. Everything else (the image,
 * the product data fetch) stays server-rendered.
 */
export function LookbookHotspotOverlay({
  hotspots,
  cardsByProductId,
  locale,
}: {
  hotspots: { id: string; xPercent: number; yPercent: number; productId: string }[];
  cardsByProductId: Record<string, LookbookHotspotCard>;
  locale: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      {hotspots.map((hotspot) => {
        const card = cardsByProductId[hotspot.productId];
        if (!card) return null;
        const isOpen = openId === hotspot.id;
        return (
          <div key={hotspot.id} className="absolute" style={{ left: `${hotspot.xPercent}%`, top: `${hotspot.yPercent}%` }}>
            <button
              type="button"
              aria-label={card.title[locale as "bn" | "en"] ?? card.title.en ?? card.title.bn ?? "Product"}
              onClick={() => setOpenId(isOpen ? null : hotspot.id)}
              className="flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-brand text-brand-foreground shadow-md"
            >
              <span className="h-2 w-2 rounded-full bg-white" />
            </button>
            {isOpen && (
              <a
                href={`/p/${card.slug}`}
                className="absolute left-1/2 top-full z-10 mt-2 flex w-40 -translate-x-1/2 flex-col gap-1 rounded-theme border border-border bg-surface p-2 shadow-lg"
              >
                {card.imageUrl && <img src={card.imageUrl} alt="" className="aspect-square w-full rounded object-cover" />}
                <span className="truncate text-xs text-surface-foreground">{card.title[locale as "bn" | "en"] ?? card.title.en ?? card.title.bn}</span>
                <span className="text-xs font-medium text-surface-foreground">{formatBdt(card.priceFrom)}</span>
              </a>
            )}
          </div>
        );
      })}
    </>
  );
}
