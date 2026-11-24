"use client";

import { useEffect, useState } from "react";

interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  fitFeedback: "small" | "true_to_size" | "large" | null;
  mediaUrls: string[];
  adminReply: string | null;
  helpfulCount: number;
  createdAt: string;
  customer: { name: string | null } | null;
}

const FIT_LABEL: Record<string, { bn: string; en: string }> = {
  small: { bn: "সাইজ ছোট", en: "Runs small" },
  true_to_size: { bn: "সঠিক সাইজ", en: "True to size" },
  large: { bn: "সাইজ বড়", en: "Runs large" },
};

/** Review display (docs/PROJECT_SPEC.md §7.4 "reviews display", §16 M8 "photo reviews and fit feedback") — submission happens from the account order page (§8.2's own "verified purchase" requirement means it needs an `order_item_id` the PDP doesn't have). */
export function ProductReviews({ productId, locale }: { productId: string; locale: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch(`/api/v1/store/reviews/products/${productId}?pageSize=10`)
      .then((r) => r.json())
      .then((result: { items: Review[]; total: number }) => {
        setReviews(result.items);
        setTotal(result.total);
      })
      .catch(() => undefined);
  }, [productId]);

  const [voted, setVoted] = useState<Set<string>>(new Set());

  async function markHelpful(id: string) {
    setVoted((prev) => new Set(prev).add(id));
    // The server counts one vote per visitor and returns the real total; show that rather than guessing +1.
    const result = await fetch(`/api/v1/store/reviews/${id}/helpful`, { method: "POST", credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ helpfulCount: number }>) : null))
      .catch(() => null);
    if (result) setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, helpfulCount: result.helpfulCount } : r)));
  }

  if (total === 0) return null;

  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className="mb-4 text-lg font-semibold text-surface-foreground">{locale === "bn" ? `রিভিউ (${total})` : `Reviews (${total})`}</h2>
      <div className="flex flex-col gap-4">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-theme border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-surface-foreground">★ {review.rating} {review.title}</span>
              <span className="text-xs text-surface-foreground/50">{review.customer?.name ?? (locale === "bn" ? "গ্রাহক" : "Customer")}</span>
            </div>
            <p className="mt-1 text-sm text-surface-foreground/80">{review.body}</p>
            {review.fitFeedback && <p className="mt-1 text-xs text-surface-foreground/50">{locale === "bn" ? FIT_LABEL[review.fitFeedback]?.bn : FIT_LABEL[review.fitFeedback]?.en}</p>}
            {review.mediaUrls.length > 0 && (
              <div className="mt-2 flex gap-2">
                {review.mediaUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element -- user-uploaded review photo, not a catalog image
                  <img key={url} src={url} alt="" className="h-16 w-16 rounded-theme object-cover" />
                ))}
              </div>
            )}
            {review.adminReply && <p className="mt-2 rounded-theme bg-muted p-2 text-xs text-surface-foreground/70">{locale === "bn" ? "দোকানের উত্তর" : "Store reply"}: {review.adminReply}</p>}
            <button onClick={() => void markHelpful(review.id)} disabled={voted.has(review.id)} className="mt-2 min-h-11 text-xs text-surface-foreground/50 hover:text-brand disabled:cursor-default disabled:text-brand">
              {locale === "bn" ? "সহায়ক" : "Helpful"} ({review.helpfulCount})
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
