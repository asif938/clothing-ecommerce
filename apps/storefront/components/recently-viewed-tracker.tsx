"use client";

import { useEffect } from "react";
import { useLocalList } from "../lib/use-local-list";

const RECENTLY_VIEWED_KEY = "recently-viewed";

/** No UI — records this PDP view into the "recently viewed" list (docs/PROJECT_SPEC.md §7.2, §7.4). */
export function RecentlyViewedTracker({ productId }: { productId: string }) {
  const recentlyViewed = useLocalList(RECENTLY_VIEWED_KEY);

  useEffect(() => {
    recentlyViewed.add(productId);
    // Only re-run when the viewed product changes, not when the list itself updates (adding would otherwise re-trigger this effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  return null;
}
