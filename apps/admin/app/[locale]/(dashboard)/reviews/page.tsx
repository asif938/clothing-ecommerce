"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card } from "../../../../components/ui";

interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  fitFeedback: "small" | "true_to_size" | "large" | null;
  mediaUrls: string[];
  status: "pending" | "approved" | "rejected";
  adminReply: string | null;
  createdAt: string;
  product: { title: { bn?: string; en?: string }; slug: string };
  customer: { name: string | null; phone: string | null } | null;
}

export default function ReviewsPage() {
  const t = useTranslations("reviews");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "">("pending");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  async function load() {
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const result = await api.get<{ items: ReviewRow[] }>(`/admin/reviews?${params.toString()}`);
      setRows(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load reviews");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-filter-change
    void load();
  }, [status]);

  async function moderate(id: string, next: "approved" | "rejected") {
    try {
      await api.patch(`/admin/reviews/${id}`, { status: next, adminReply: replyDrafts[id] || undefined });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to moderate review");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}
      <div className="flex gap-2">
        {(["pending", "approved", "rejected", ""] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatus(s)}
            className={`rounded-theme px-3 py-1.5 text-sm ${status === s ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"}`}
          >
            {s ? t(`status${s[0]!.toUpperCase()}${s.slice(1)}`) : t("statusAll")}
          </button>
        ))}
      </div>
      <Card className="flex flex-col gap-3">
        {rows.map((review) => (
          <div key={review.id} className="rounded-theme border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-surface-foreground">
                {review.rating}★ {review.title ?? ""} — {review.product.title.en ?? review.product.title.bn}
              </span>
              <span className="text-xs text-surface-foreground/50">{review.customer?.name ?? review.customer?.phone ?? t("guest")}</span>
            </div>
            <p className="mt-1 text-sm text-surface-foreground/80">{review.body}</p>
            {review.fitFeedback && <p className="mt-1 text-xs text-surface-foreground/50">{t("fit")}: {t(`fit_${review.fitFeedback}`)}</p>}
            {review.mediaUrls.length > 0 && (
              <div className="mt-2 flex gap-2">
                {review.mediaUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element -- admin moderation thumbnail, not a next/image-optimized storefront image
                  <img key={url} src={url} alt="" className="h-16 w-16 rounded-theme object-cover" />
                ))}
              </div>
            )}
            {review.status === "pending" && (
              <div className="mt-2 flex flex-col gap-2">
                <textarea
                  value={replyDrafts[review.id] ?? ""}
                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [review.id]: e.target.value }))}
                  placeholder={t("replyPlaceholder")}
                  rows={2}
                  className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <Button onClick={() => void moderate(review.id, "approved")}>{t("approve")}</Button>
                  <Button variant="danger" onClick={() => void moderate(review.id, "rejected")}>{t("reject")}</Button>
                </div>
              </div>
            )}
            {review.adminReply && <p className="mt-2 rounded-theme bg-muted p-2 text-xs text-surface-foreground/70">{t("adminReply")}: {review.adminReply}</p>}
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-surface-foreground/50">—</p>}
      </Card>
    </div>
  );
}
