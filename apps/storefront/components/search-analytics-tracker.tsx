"use client";

import { useEffect } from "react";
import { trackEvent } from "../lib/analytics";

/** No UI — logs the search term + result count (docs/PROJECT_SPEC.md §7.3 "search terms logged for analytics"; §8.2 Reports "search terms (top, zero-result)"). */
export function SearchAnalyticsTracker({ term, resultCount }: { term: string; resultCount: number }) {
  useEffect(() => {
    trackEvent("search", { term, resultCount });
  }, [term, resultCount]);

  return null;
}
