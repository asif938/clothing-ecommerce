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
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    ttq?: { track: (event: string, params?: Record<string, unknown>) => void };
  }
}

/** Meta's own click-id/browser-id cookies (`_fbc`/`_fbp`), set by the Pixel script — read client-side since the server can't see cross-site cookies Meta's own script wrote. */
export function readCookie(name: string): string | undefined {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match?.[1] !== undefined ? decodeURIComponent(match[1]) : undefined;
  } catch {
    return undefined;
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

/**
 * The client half of the Purchase event (docs/PROJECT_SPEC.md §10.5,
 * §13.3) — `eventId` must be the same id passed to `placeOrder()` so the
 * server-side CAPI/MP/Events-API copy (`TrackingService.recordPurchase`,
 * dispatched per `tracking.purchaseEventTiming`) can be matched to this one
 * for platform-side dedup. Fires on whichever pixels are actually loaded
 * (each one's own snippet makes `fbq`/`gtag`/`ttq` safe to call before its
 * real script finishes loading — calls just queue).
 */
export function trackPurchase(eventId: string, totalPoisha: number, currency = "BDT"): void {
  const value = totalPoisha / 100;
  try {
    window.fbq?.("track", "Purchase", { value, currency }, { eventID: eventId });
  } catch {
    // never let a tracking call break the success page
  }
  try {
    window.gtag?.("event", "purchase", { transaction_id: eventId, value, currency });
  } catch {
    // ignore
  }
  try {
    window.ttq?.track("CompletePayment", { value, currency, content_id: eventId });
  } catch {
    // ignore
  }
  trackEvent("purchase", { eventId, value, currency });
}
