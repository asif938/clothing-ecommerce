"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface BlockAudience {
  mode: "all" | "guest" | "customer";
  segmentIds?: string[];
}

/**
 * Audience-targeted blocks (docs/PROJECT_SPEC.md §16 M10) — the one client
 * component in an otherwise server-rendered page's block list. Hides its
 * (already server-rendered) children until `/store/audience/me` resolves,
 * so a page's static/cached HTML never has to vary per-viewer — see
 * `BlockRenderer` and docs/DECISIONS.md. Fails open (shows the block)
 * on any error, since a broken personalization check shouldn't also hide
 * content.
 */
export function AudienceGate({ audience, children }: { audience: BlockAudience; children: ReactNode }) {
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/store/audience/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { loggedIn: boolean; segmentIds: string[] } | null) => {
        if (cancelled) return;
        if (!data) {
          setVisible(true);
          return;
        }
        if (audience.mode === "guest") setVisible(!data.loggedIn);
        else if (audience.mode === "customer") {
          const segmentIds = audience.segmentIds ?? [];
          setVisible(data.loggedIn && (segmentIds.length === 0 || segmentIds.some((id) => data.segmentIds.includes(id))));
        } else setVisible(true);
      })
      .catch(() => {
        if (!cancelled) setVisible(true);
      });
    return () => {
      cancelled = true;
    };
  }, [audience.mode, audience.segmentIds]);

  if (visible === false) return null;
  // `visible === null` (still checking) renders the content immediately —
  // a brief flash beats a layout-shifting spinner for this use case, and
  // it means server-rendered HTML isn't empty for crawlers/no-JS viewers.
  return <>{children}</>;
}
