"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "../i18n/navigation";

/**
 * The account's "Write a review" for one order: asks the API for the order's
 * review link and goes there, so there is one review form for everyone —
 * account holders, guests following the review-request SMS, and the product
 * page button.
 */
export function OrderReviewsView() {
  const params = useParams<{ id: string; locale: string }>();
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/store/reviews/orders/${encodeURIComponent(params.id)}/link`, { credentials: "same-origin", cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ reviewUrl: string }>) : Promise.reject(new Error(String(response.status)))))
      .then((result) => router.replace(result.reviewUrl))
      .catch(() => setFailed(true));
  }, [params.id, router]);

  return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-surface-foreground/60">{failed ? "—" : "…"}</div>;
}
