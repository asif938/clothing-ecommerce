"use client";

import { useEffect, useState } from "react";
import { getAssignments, reportExposure } from "../lib/personalization-api";

type LocalizedText = { bn?: string; en?: string };

/**
 * Offer A/B tests (§16 M14): the discount itself is applied (or not) by the
 * API's pricing for this visitor's variant; this strip just tells the
 * visitor about it when the variant carries a message. Counts the
 * visitor as exposed on any page view while the test runs, since the offer
 * applies site-wide.
 */
export function OfferExperimentStrip({ locale }: { locale: string }) {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getAssignments().then((assignments) => {
      if (cancelled) return;
      const offers = assignments.filter((a) => a.kind === "offer");
      for (const offer of offers) reportExposure(offer.experimentId);
      setMessages(
        offers
          .map((a) => (a.payload as { message?: LocalizedText | null } | null)?.message)
          .map((m) => (m ? (m[locale as "bn" | "en"] ?? m.bn ?? m.en ?? "") : ""))
          .filter((m) => m.length > 0),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (messages.length === 0) return null;
  return (
    <div className="border-b border-border bg-muted px-4 py-2 text-center text-xs font-medium text-surface-foreground" role="status">
      {messages.join(" · ")}
    </div>
  );
}
