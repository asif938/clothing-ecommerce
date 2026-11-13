import { Suspense } from "react";
import type { Metadata } from "next";
import { GiftCardResultView } from "../../../../components/gift-card-result-view";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function GiftCardResultPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl px-4 py-10">…</div>}>
      <GiftCardResultView />
    </Suspense>
  );
}
