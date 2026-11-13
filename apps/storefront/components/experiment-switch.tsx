"use client";

import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { getAssignments, reportClick, reportExposure } from "../lib/personalization-api";

/** Longest we keep the control invisible while waiting for the assignment — after that it just shows (a slow network shouldn't blank the page). */
const ANTI_FLICKER_MS = 800;

/**
 * A/B test wrapper (docs/PROJECT_SPEC.md §9.1 block `variants`, §16 M14).
 * Every variant is server-rendered (so the page stays static and
 * cacheable, like `AudienceGate`); this only chooses which one is visible.
 * The control is the first entry. While the assignment loads, the control
 * holds its space invisibly (no layout shift) for at most
 * `ANTI_FLICKER_MS`. Clicks on links inside count toward the "click" goal.
 */
export function ExperimentSwitch({ experimentId, variants }: { experimentId: string; variants: { key: string; node: ReactNode }[] }) {
  const [shown, setShown] = useState<string | null>(null);
  const [assigned, setAssigned] = useState(false);
  const controlKey = variants[0]?.key ?? "control";

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setShown((current) => current ?? controlKey);
    }, ANTI_FLICKER_MS);
    void getAssignments().then((assignments) => {
      if (cancelled) return;
      const mine = assignments.find((a) => a.experimentId === experimentId);
      const key = mine && variants.some((v) => v.key === mine.variantKey) ? mine.variantKey : controlKey;
      setShown(key);
      if (mine) {
        setAssigned(true);
        reportExposure(experimentId);
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // The variant list is fixed for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId]);

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (assigned && (event.target as HTMLElement).closest("a")) reportClick(experimentId);
  }

  return (
    <div onClickCapture={onClickCapture}>
      {variants.map((variant) => {
        const visible = shown === null ? variant.key === controlKey : variant.key === shown;
        const pending = shown === null && variant.key === controlKey;
        return (
          <div key={variant.key} hidden={!visible} className={pending ? "invisible" : undefined} data-experiment={experimentId} data-variant={variant.key}>
            {variant.node}
          </div>
        );
      })}
    </div>
  );
}
