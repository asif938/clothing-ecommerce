"use client";

import { useEffect } from "react";

/** Registers `/sw.js` once the page is interactive (docs/PROJECT_SPEC.md §16 M10) — silent, no install/permission prompt of its own; see `PushOptIn` for that. */
export function PwaRegister({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, [enabled]);

  return null;
}
