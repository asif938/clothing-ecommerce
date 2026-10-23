"use client";

/**
 * First-party analytics (docs/PROJECT_SPEC.md §13.3): pushes to
 * `window.dataLayer` (so GTM/GA4 — M8 — can pick events up once
 * configured) and relays the same event to `POST /store/events` for the
 * first-party events table. Never throws and never blocks the caller —
 * tracking must not be able to break a page.
 */
declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

function anonymousId(): string {
  try {
    const key = "anonymous_id";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const generated = `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    return "anon_unknown";
  }
}

export function trackEvent(type: string, payload: Record<string, unknown> = {}): void {
  try {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ event: type, ...payload });
  } catch {
    // dataLayer push failing should never break the page.
  }

  void fetch("/api/v1/store/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, payload, anonymousId: anonymousId(), path: window.location.pathname }),
  }).catch(() => undefined);
}
