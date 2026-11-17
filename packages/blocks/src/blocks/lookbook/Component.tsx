import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import { SectionHeading } from "../../section-heading.tsx";
import { storeApiGet } from "../../store-api.ts";
import { LookbookHotspotOverlay, type LookbookHotspotCard } from "./HotspotOverlay.tsx";
import type { LookbookProps } from "./schema.ts";

/**
 * Shop-the-look hotspots (docs/PROJECT_SPEC.md §16 M10) — one styled photo
 * with tappable dots, each tied to a real product. Used both as a CMS
 * block and, via `@clothing/blocks`'s block renderer, inside a `BlogPost`'s
 * own `lookbook`-style content.
 */
export async function LookbookBlock({ props, locale }: BlockComponentProps<LookbookProps>) {
  if (!props.imageUrl || props.hotspots.length === 0) return null;

  const productIds = [...new Set(props.hotspots.map((h) => h.productId))];
  const cards = await storeApiGet<LookbookHotspotCard[]>(`/store/catalog/products?source=manual&productIds=${productIds.join(",")}`);
  const cardsByProductId = Object.fromEntries((cards ?? []).map((card) => [card.id, card]));

  return (
    <section className="px-4 py-12 sm:px-8 sm:py-20">
      {props.heading && <SectionHeading>{t(props.heading, locale as "bn" | "en")}</SectionHeading>}
      <div className="relative mx-auto max-w-3xl">
        <img src={props.imageUrl} alt={props.imageAlt ? t(props.imageAlt, locale as "bn" | "en") : ""} className="w-full rounded-theme object-cover" />
        <LookbookHotspotOverlay hotspots={props.hotspots} cardsByProductId={cardsByProductId} locale={locale} />
      </div>
    </section>
  );
}
