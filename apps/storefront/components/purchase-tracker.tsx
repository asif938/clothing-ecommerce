"use client";

import { useEffect } from "react";
import { trackPurchase } from "../lib/analytics";

/** No UI — fires the client half of the Purchase event once, on the success page (docs/PROJECT_SPEC.md §10.5, §13.3). */
export function PurchaseTracker({ eventId, total }: { eventId: string | null; total: number | null }) {
  useEffect(() => {
    if (!eventId || total === null) return;
    trackPurchase(eventId, total);
  }, [eventId, total]);

  return null;
}
