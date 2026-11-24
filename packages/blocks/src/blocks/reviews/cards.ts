import { t } from "@clothing/shared";
import type { ReviewsProps } from "./schema.ts";

/** `GET /store/catalog/reviews` row (apps/api StoreCatalogService.listFeaturedReviews). */
export interface FeaturedReviewData {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  photoUrl: string | null;
  verified: boolean;
  authorName: string | null;
  product: { slug: string; title: { bn?: string; en?: string }; imageUrl: string | null };
}

export interface ReviewCardData {
  key: string;
  rating: number;
  title: string | null;
  body: string;
  name: string;
  verified: boolean;
  photoUrl: string | null;
  product: FeaturedReviewData["product"] | null;
}

/** Cards in display order: the owner's hand-written testimonials first, then live customer reviews. */
export function buildReviewCards(props: ReviewsProps, reviews: FeaturedReviewData[], locale: string): ReviewCardData[] {
  const lang = locale as "bn" | "en";
  const fallbackName = props.fallbackName ? t(props.fallbackName, lang) : "";
  const own: ReviewCardData[] = props.testimonials
    .map((item, index) => ({ key: `t${index}`, rating: item.rating, title: null, body: t(item.quote, lang), name: item.name, verified: false, photoUrl: null, product: null }))
    .filter((card) => card.body.trim().length > 0);
  const live: ReviewCardData[] = reviews.map((review) => ({
    key: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    name: review.authorName ?? fallbackName,
    verified: review.verified,
    photoUrl: review.photoUrl,
    product: review.product,
  }));
  return [...own, ...live];
}
