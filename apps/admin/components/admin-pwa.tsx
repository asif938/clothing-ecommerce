"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "../lib/api";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(safe);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function supportsPush(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window;
}

/**
 * Admin PWA shell (docs/PROJECT_SPEC.md §8.2 Admin PWA, §16 M11): registers
 * the push-only service worker and offers a per-device "turn on alerts"
 * button. Like the storefront's opt-in it never auto-prompts. The service
 * worker caches nothing - an authenticated admin shell must never be served
 * from a stale offline cache (see docs/DECISIONS.md).
 */
export function AdminPwa() {
  const t = useTranslations("adminPwa");
  const [state, setState] = useState<"idle" | "busy" | "on" | "unsupported" | "unconfigured">(() => (supportsPush() ? "idle" : "unsupported"));

  useEffect(() => {
    if (!supportsPush()) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled && subscription) setState("on");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setState("busy");
    try {
      const { publicKey } = await api.get<{ publicKey: string | null }>("/admin/staff-push/public-key");
      if (!publicKey) {
        setState("unconfigured");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource });
      const json = subscription.toJSON();
      await api.post("/admin/staff-push/subscribe", { endpoint: json.endpoint, keys: json.keys, locale: document.documentElement.lang || "bn" });
      setState("on");
    } catch {
      setState("idle");
    }
  }

  if (state === "unsupported") return null;
  if (state === "on") return <span className="px-2 text-xs text-surface-foreground/60">{t("on")}</span>;
  if (state === "unconfigured") return <span className="px-2 text-xs text-warning">{t("unconfigured")}</span>;
  return (
    <button type="button" onClick={() => void enable()} disabled={state === "busy"} className="px-2 text-left text-sm text-surface-foreground/70 hover:text-surface-foreground">
      {t("enable")}
    </button>
  );
}
