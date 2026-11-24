"use client";

import { useEffect, useRef } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once per page, however many widgets mount. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile did not load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile (docs/PROJECT_SPEC.md §10.6). Reports a token through `onToken`, and `null` when it expires or
 * fails. Tokens are single-use: remount the widget (change its `key`) after every order attempt to get a fresh one.
 */
export function TurnstileWidget({ siteKey, locale, onToken, onLoadError }: { siteKey: string; locale: string; onToken: (token: string | null) => void; onLoadError: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  // Latest callbacks without re-rendering the widget whenever the parent re-renders.
  const handlers = useRef({ onToken, onLoadError });
  useEffect(() => {
    handlers.current = { onToken, onLoadError };
  });

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          language: locale === "bn" ? "bn" : "en",
          callback: (token: string) => handlers.current.onToken(token),
          "expired-callback": () => handlers.current.onToken(null),
          "error-callback": () => handlers.current.onToken(null),
        });
      })
      .catch(() => {
        if (!cancelled) handlers.current.onLoadError();
      });
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, locale]);

  return <div ref={container} className="min-h-[65px]" />;
}
