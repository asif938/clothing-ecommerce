"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/**
 * Web push opt-in (docs/PROJECT_SPEC.md §16 M10) — a plain button, never
 * an auto-prompt on page load (browsers throttle/penalize unsolicited
 * permission prompts, and it's simply bad UX). Shown on the account page;
 * silently renders nothing when push isn't configured/enabled so there's
 * no dead button on a fresh install with no VAPID keys generated yet.
 */
function supportsPush(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window;
}

export function PushOptIn({ enabled, vapidPublicKey, strings }: { enabled: boolean; vapidPublicKey: string | null; strings: { enable: string; enabled: string; unavailable: string } }) {
  // Lazy initializer, not an effect — feature support never changes after mount, so there's nothing to "synchronize" here.
  const [status, setStatus] = useState<"idle" | "subscribing" | "subscribed" | "unsupported">(() => (supportsPush() ? "idle" : "unsupported"));

  useEffect(() => {
    if (!supportsPush()) return;
    navigator.serviceWorker.ready.then((registration) =>
      registration.pushManager.getSubscription().then((sub) => {
        if (sub) setStatus("subscribed");
      }),
    );
  }, []);

  if (!enabled || !vapidPublicKey || status === "unsupported") return null;

  async function subscribe() {
    setStatus("subscribing");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!) as BufferSource });
      const json = subscription.toJSON();
      await fetch("/api/v1/store/push/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setStatus("subscribed");
    } catch {
      setStatus("idle");
    }
  }

  if (status === "subscribed") return <p className="text-sm text-surface-foreground/70">{strings.enabled}</p>;

  return (
    <button type="button" onClick={subscribe} disabled={status === "subscribing"} className="rounded-theme border border-border px-4 py-2 text-sm font-medium text-surface-foreground">
      {strings.enable}
    </button>
  );
}
