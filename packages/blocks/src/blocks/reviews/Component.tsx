import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import { SectionHeading } from "../../section-heading.tsx";
import { storeApiGet } from "../../store-api.ts";
import { buildReviewCards, type FeaturedReviewData, type ReviewCardData } from "./cards.ts";
import type { ReviewsProps } from "./schema.ts";
import { BlockLink } from "../../block-link.tsx";

function Stars({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={`${rating}/5`} className="flex gap-0.5 text-accent">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 fill-current ${n <= rating ? "" : "opacity-20"}`}>
          <path d="M10 1.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L10 14.9l-5.25 2.7 1-5.8L1.5 7.7l5.9-.9z" />
        </svg>
      ))}
    </span>
  );
}

function ReviewCard({ card, locale, verifiedLabel }: { card: ReviewCardData; locale: string; verifiedLabel: string | null }) {
  const productTitle = card.product ? t(card.product.title, locale as "bn" | "en") : "";
  return (
    <figure className="flex w-[82%] shrink-0 snap-start flex-col gap-4 rounded-theme border border-border bg-surface p-5 sm:w-auto sm:p-6">
      <Stars rating={card.rating} />
      <blockquote className="flex flex-1 flex-col gap-2">
        {card.title && <p className="text-base font-medium text-surface-foreground">{card.title}</p>}
        <p className="text-[15px] leading-relaxed text-surface-foreground/75">{card.body}</p>
      </blockquote>
      {card.photoUrl && <img src={card.photoUrl} alt="" loading="lazy" className="aspect-square w-20 rounded-theme object-cover" />}
      <figcaption className="flex flex-col gap-3 border-t border-border pt-4">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium text-surface-foreground">{card.name}</span>
          {card.verified && verifiedLabel && (
            <span className="inline-flex items-center gap-1 text-xs text-surface-foreground/55">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current text-accent">
                <path d="M10 1a9 9 0 100 18 9 9 0 000-18zm4.2 6.7l-5 5a1 1 0 01-1.4 0l-2-2a1 1 0 111.4-1.4l1.3 1.3 4.3-4.3a1 1 0 111.4 1.4z" />
              </svg>
              {verifiedLabel}
            </span>
          )}
        </span>
        {card.product && (
          <BlockLink href={`${locale === "en" ? "/en" : ""}/p/${card.product.slug}`} className="group flex min-h-11 items-center gap-3">
            {card.product.imageUrl && <img src={card.product.imageUrl} alt="" loading="lazy" className="h-11 w-9 shrink-0 rounded-theme bg-muted object-cover" />}
            <span className="line-clamp-2 text-[13px] leading-snug text-surface-foreground/70 transition-colors group-hover:text-brand">{productTitle}</span>
          </BlockLink>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * Testimonials/reviews (§9.1). Server-rendered like `product_grid`; renders
 * nothing when there is nothing to show. On phones the cards sit in one
 * swipeable row (360px first, golden rule 5); from `sm` up they wrap into a
 * two- then three-column grid.
 */
export async function ReviewsBlock({ props, locale }: BlockComponentProps<ReviewsProps>) {
  let reviews: FeaturedReviewData[] = [];
  if (props.source !== "none") {
    const query = new URLSearchParams({ sort: props.source, minRating: String(props.minRating), limit: String(props.limit) });
    reviews = (await storeApiGet<FeaturedReviewData[]>(`/store/catalog/reviews?${query.toString()}`)) ?? [];
  }
  const cards = buildReviewCards(props, reviews, locale);
  if (cards.length === 0) return null;
  const lang = locale as "bn" | "en";
  const verifiedLabel = props.verifiedLabel ? t(props.verifiedLabel, lang) : null;

  return (
    <section className="py-12 sm:px-8 sm:py-20">
      {props.heading && (
        <div className="px-4 sm:px-0">
          <SectionHeading>{t(props.heading, lang)}</SectionHeading>
        </div>
      )}
      <div className="mx-auto flex max-w-6xl snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:grid sm:snap-none sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
        {cards.map((card) => (
          <ReviewCard key={card.key} card={card} locale={locale} verifiedLabel={verifiedLabel} />
        ))}
      </div>
    </section>
  );
}
