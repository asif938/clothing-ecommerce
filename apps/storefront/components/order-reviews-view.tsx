"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { orderDetail, type OrderDetail } from "../lib/account-api";

type ItemStatus = "idle" | "sending" | "done" | "error";

/** Per-item review submission from a delivered order (docs/PROJECT_SPEC.md §16 M8 "photo reviews and fit feedback") — lives here, not the PDP, because verified-purchase review requires an `order_item_id` only the account's own order detail has. */
export function OrderReviewsView() {
  const params = useParams<{ id: string; locale: string }>();
  const locale = params.locale ?? "bn";
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { rating: number; title: string; body: string; fit: "small" | "true_to_size" | "large" | ""; photoUrl: string | null }>>({});
  const [status, setStatus] = useState<Record<string, ItemStatus>>({});
  const [errorMessage, setErrorMessage] = useState<Record<string, string>>({});

  useEffect(() => {
    orderDetail(params.id).then(setOrder).catch(() => setOrder(null));
  }, [params.id]);

  function draft(itemId: string) {
    return drafts[itemId] ?? { rating: 5, title: "", body: "", fit: "" as const, photoUrl: null };
  }

  function updateDraft(itemId: string, patch: Partial<ReturnType<typeof draft>>) {
    setDrafts((prev) => ({ ...prev, [itemId]: { ...draft(itemId), ...patch } }));
  }

  async function handlePhoto(itemId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/v1/store/reviews/photos", { method: "POST", body: formData });
    if (response.ok) {
      const result = (await response.json()) as { url: string };
      updateDraft(itemId, { photoUrl: result.url });
    }
  }

  async function submit(itemId: string) {
    const d = draft(itemId);
    setStatus((prev) => ({ ...prev, [itemId]: "sending" }));
    try {
      const response = await fetch("/api/v1/store/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId: itemId, rating: d.rating, title: d.title || undefined, body: d.body, fitFeedback: d.fit || undefined, mediaUrls: d.photoUrl ? [d.photoUrl] : [] }),
      });
      if (response.ok) {
        setStatus((prev) => ({ ...prev, [itemId]: "done" }));
      } else {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setErrorMessage((prev) => ({ ...prev, [itemId]: body.message ?? "Failed" }));
        setStatus((prev) => ({ ...prev, [itemId]: "error" }));
      }
    } catch {
      setStatus((prev) => ({ ...prev, [itemId]: "error" }));
    }
  }

  if (!order) return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-surface-foreground/60">…</div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-surface-foreground">{locale === "bn" ? `অর্ডার ${order.orderNumber} এর রিভিউ` : `Review order ${order.orderNumber}`}</h1>
      <div className="flex flex-col gap-6">
        {order.items.map((item) => {
          const d = draft(item.id);
          const itemStatus = status[item.id] ?? "idle";
          return (
            <div key={item.id} className="rounded-theme border border-border p-4">
              <p className="font-medium text-surface-foreground">{item.title.en ?? item.title.bn} ({item.sku})</p>
              {itemStatus === "done" ? (
                <p className="mt-2 text-sm text-success">{locale === "bn" ? "ধন্যবাদ! আপনার রিভিউ জমা দেওয়া হয়েছে।" : "Thanks! Your review was submitted."}</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => updateDraft(item.id, { rating: star })} className={star <= d.rating ? "text-brand" : "text-surface-foreground/30"}>
                        ★
                      </button>
                    ))}
                  </div>
                  <select value={d.fit} onChange={(e) => updateDraft(item.id, { fit: e.target.value as typeof d.fit })} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
                    <option value="">{locale === "bn" ? "ফিট ফিডব্যাক (ঐচ্ছিক)" : "Fit feedback (optional)"}</option>
                    <option value="small">{locale === "bn" ? "সাইজ ছোট" : "Runs small"}</option>
                    <option value="true_to_size">{locale === "bn" ? "সঠিক সাইজ" : "True to size"}</option>
                    <option value="large">{locale === "bn" ? "সাইজ বড়" : "Runs large"}</option>
                  </select>
                  <input
                    value={d.title}
                    onChange={(e) => updateDraft(item.id, { title: e.target.value })}
                    placeholder={locale === "bn" ? "শিরোনাম (ঐচ্ছিক)" : "Title (optional)"}
                    className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
                  />
                  <textarea
                    value={d.body}
                    onChange={(e) => updateDraft(item.id, { body: e.target.value })}
                    placeholder={locale === "bn" ? "আপনার মতামত লিখুন…" : "Write your review…"}
                    rows={3}
                    className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
                  />
                  <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void handlePhoto(item.id, e.target.files[0])} className="text-xs" />
                  {d.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- just-uploaded review photo preview
                    <img src={d.photoUrl} alt="" className="h-16 w-16 rounded-theme object-cover" />
                  )}
                  {itemStatus === "error" && <p className="text-xs text-danger">{errorMessage[item.id]}</p>}
                  <button
                    onClick={() => void submit(item.id)}
                    disabled={itemStatus === "sending" || !d.body}
                    className="self-start rounded-theme bg-brand px-4 py-2 text-sm text-brand-foreground disabled:opacity-50"
                  >
                    {locale === "bn" ? "রিভিউ জমা দিন" : "Submit review"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
