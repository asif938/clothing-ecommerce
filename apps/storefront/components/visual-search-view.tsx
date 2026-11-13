"use client";

import { useEffect, useRef, useState } from "react";
import { ProductCard } from "./product-card";
import { trackEvent } from "../lib/analytics";
import { visualSearch, VisualSearchError, type VisualSearchResponse } from "../lib/personalization-api";

/**
 * Search by photo (docs/PROJECT_SPEC.md §16 M14). Mobile-first: one big
 * button that opens the camera or gallery (`capture` is only a hint —
 * phones offer both). The photo is sent to the API, matched against the
 * catalog's indexed images, and never stored.
 */
export function VisualSearchView({ locale }: { locale: string }) {
  const bn = locale === "bn";
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisualSearchResponse | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const response = await visualSearch(file);
      setResult(response);
      trackEvent("visual_search", { resultCount: response.products.length });
    } catch (err) {
      if (err instanceof VisualSearchError && err.status === 429) setError(bn ? "অনেকবার খোঁজা হয়েছে — একটু পরে আবার চেষ্টা করুন।" : "Too many photo searches — please try again a little later.");
      else if (err instanceof VisualSearchError && err.status === 400) setError(bn ? "এই ছবিটি পড়া গেল না — JPEG বা PNG ছবি দিন।" : "We couldn't read that photo — try a JPEG or PNG.");
      else setError(bn ? "খোঁজা যায়নি, আবার চেষ্টা করুন।" : "Search failed, please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const seen = result?.tags ? [result.tags.garment, ...result.tags.colors, result.tags.pattern].filter(Boolean).join(" · ") : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="text-xl font-semibold text-surface-foreground">{bn ? "ছবি দিয়ে খুঁজুন" : "Search by photo"}</h1>
      <p className="mt-1 text-sm text-surface-foreground/70">
        {bn ? "পছন্দের পোশাকের ছবি তুলুন বা গ্যালারি থেকে দিন — আমরা মিল আছে এমন পণ্য দেখাব।" : "Take or choose a photo of an outfit you like — we'll show matching products."}
      </p>

      <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <label className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-theme bg-brand px-5 py-3 text-sm font-medium text-brand-foreground ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? (bn ? "খোঁজা হচ্ছে…" : "Searching…") : bn ? "ছবি বেছে নিন" : "Choose a photo"}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a remote asset
          <img src={preview} alt={bn ? "আপনার ছবি" : "Your photo"} className="h-24 w-20 rounded-theme border border-border object-cover" />
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      {result && (
        <section className="mt-8">
          {seen && <p className="mb-3 text-sm text-surface-foreground/70">{bn ? `ছবিতে দেখা যাচ্ছে: ${seen}` : `We see: ${seen}`}</p>}
          {result.products.length === 0 ? (
            <p className="text-sm text-surface-foreground/70">{bn ? "মিল আছে এমন কিছু পাওয়া যায়নি। অন্য একটি ছবি দিয়ে চেষ্টা করুন।" : "No close matches. Try another photo."}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {result.products.map((product) => (
                <ProductCard key={product.id} product={product} locale={locale} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
