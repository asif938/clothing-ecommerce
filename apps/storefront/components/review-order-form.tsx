"use client";

import { useState } from "react";
import { t } from "@clothing/shared";
import { Link } from "../i18n/navigation";
import { apiErrorMessage } from "../lib/api-error";
import type { ReviewText } from "../lib/review-text";

export interface ReviewOrderItem {
  id: string;
  title: { bn?: string; en?: string };
  imageUrl: string | null;
  quantity: number;
  reviewed: boolean;
}

type Fit = "small" | "true_to_size" | "large" | "";

interface Draft {
  rating: number;
  title: string;
  body: string;
  fit: Fit;
  photoUrl: string | null;
}

const EMPTY: Draft = { rating: 0, title: "", body: "", fit: "", photoUrl: null };

function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}/5`} onClick={() => onChange(n)} className="flex h-11 w-11 items-center justify-center">
          <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-8 w-8 ${n <= value ? "fill-accent text-accent" : "fill-transparent text-surface-foreground/30"}`} stroke="currentColor" strokeWidth={1.2}>
            <path d="M10 1.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L10 14.9l-5.25 2.7 1-5.8L1.5 7.7l5.9-.9z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

/**
 * Review form for every item of one delivered order, reached by the signed
 * link (`/review/<token>`) — from the review-request SMS, the account's
 * order list or the product page. No login needed: the link is the proof of
 * purchase. Stars first (required), then optional fit, title, text and one
 * photo; each item is submitted on its own.
 */
export function ReviewOrderForm({ token, orderNumber, items, text, locale }: { token: string; orderNumber: string; items: ReviewOrderItem[]; text: ReviewText; locale: string }) {
  const lang = locale as "bn" | "en";
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [state, setState] = useState<Record<string, "idle" | "sending" | "done" | "uploading">>(() => Object.fromEntries(items.filter((i) => i.reviewed).map((i) => [i.id, "done" as const])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const base = `/api/v1/store/reviews/order/${encodeURIComponent(token)}`;

  const draft = (id: string) => drafts[id] ?? EMPTY;
  const update = (id: string, patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY), ...patch } }));

  async function uploadPhoto(id: string, file: File) {
    setState((prev) => ({ ...prev, [id]: "uploading" }));
    setErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${base}/photos`, { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as { url?: string } | null;
      if (!response.ok || !body?.url) throw new Error(apiErrorMessage(body, text.failed));
      update(id, { photoUrl: body.url });
    } catch (error) {
      setErrors((prev) => ({ ...prev, [id]: error instanceof Error ? error.message : text.failed }));
    } finally {
      setState((prev) => ({ ...prev, [id]: "idle" }));
    }
  }

  async function submit(id: string) {
    const d = draft(id);
    setState((prev) => ({ ...prev, [id]: "sending" }));
    setErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId: id, rating: d.rating, title: d.title.trim() || undefined, body: d.body.trim(), fitFeedback: d.fit || undefined, mediaUrls: d.photoUrl ? [d.photoUrl] : [] }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await response.json().catch(() => null), text.failed));
      setState((prev) => ({ ...prev, [id]: "done" }));
    } catch (error) {
      setErrors((prev) => ({ ...prev, [id]: error instanceof Error ? error.message : text.failed }));
      setState((prev) => ({ ...prev, [id]: "idle" }));
    }
  }

  const allDone = items.length > 0 && items.every((item) => state[item.id] === "done");
  const fits: { value: Fit; label: string }[] = [
    { value: "small", label: text.fitSmall },
    { value: "true_to_size", label: text.fitTrue },
    { value: "large", label: text.fitLarge },
  ];
  const field = "w-full rounded-theme border border-border bg-surface px-3 py-2.5 text-[15px]";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl text-surface-foreground">{text.pageTitle.replace("{order_number}", orderNumber)}</h1>
        <p className="text-sm text-surface-foreground/65">{text.intro}</p>
      </div>

      {allDone && (
        <div className="flex flex-col items-start gap-3 rounded-theme bg-muted p-5">
          <p className="text-sm font-medium text-surface-foreground">{text.allDone}</p>
          <Link href="/shop" className="text-sm text-brand underline underline-offset-4">
            {text.continueShopping}
          </Link>
        </div>
      )}

      {items.map((item) => {
        const d = draft(item.id);
        const status = state[item.id] ?? "idle";
        const title = t(item.title, lang);
        return (
          <section key={item.id} className="flex flex-col gap-4 rounded-theme border border-border p-4 sm:p-5">
            <div className="flex items-center gap-3">
              {item.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- see apps/storefront/components/header.tsx
                <img src={item.imageUrl} alt="" className="aspect-[3/4] w-14 shrink-0 rounded-theme bg-muted object-cover" />
              )}
              <h2 className="text-[15px] font-medium leading-snug text-surface-foreground">{title}</h2>
            </div>

            {status === "done" ? (
              <p className="text-sm text-success">{item.reviewed ? text.alreadyReviewed : text.thanks}</p>
            ) : (
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit(item.id);
                }}
              >
                <StarPicker value={d.rating} onChange={(rating) => update(item.id, { rating })} label={text.rating} />
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm text-surface-foreground/70">{text.fit}</legend>
                  <div className="flex flex-wrap gap-2">
                    {fits.map((fit) => (
                      <button
                        key={fit.value}
                        type="button"
                        aria-pressed={d.fit === fit.value}
                        onClick={() => update(item.id, { fit: d.fit === fit.value ? "" : fit.value })}
                        className={`min-h-10 rounded-full border px-4 text-sm ${d.fit === fit.value ? "border-brand bg-brand/10 font-medium" : "border-border"}`}
                      >
                        {fit.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <input value={d.title} maxLength={160} onChange={(e) => update(item.id, { title: e.target.value })} placeholder={text.titlePlaceholder} className={field} />
                <textarea value={d.body} maxLength={4000} rows={4} onChange={(e) => update(item.id, { body: e.target.value })} placeholder={text.bodyPlaceholder} className={field} />
                <div className="flex items-center gap-3">
                  {d.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- just-uploaded review photo preview
                    <img src={d.photoUrl} alt="" className="h-16 w-16 rounded-theme object-cover" />
                  )}
                  <label className="flex min-h-11 cursor-pointer items-center rounded-theme border border-dashed border-border px-4 text-sm text-surface-foreground/75">
                    {status === "uploading" ? text.uploading : text.addPhoto}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={status === "uploading"} onChange={(e) => e.target.files?.[0] && void uploadPhoto(item.id, e.target.files[0])} />
                  </label>
                </div>
                {errors[item.id] && (
                  <p role="alert" className="text-sm text-danger">
                    {errors[item.id]}
                  </p>
                )}
                <button type="submit" disabled={status !== "idle" || d.rating === 0 || !d.body.trim()} className="min-h-12 rounded-theme bg-brand px-6 text-sm font-medium text-brand-foreground disabled:opacity-50">
                  {status === "sending" ? text.submitting : text.submit}
                </button>
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}
