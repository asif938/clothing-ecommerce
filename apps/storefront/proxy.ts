import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import type { NextRequest, NextResponse } from "next/server";

// Next.js 16 renamed `middleware.ts` to `proxy.ts`; behavior is unchanged.
const intlProxy = createMiddleware(routing);

/**
 * §12 "CSP on storefront and admin (allow-list tracking domains from
 * settings)". The tracking domains here are a static allow-list, not read
 * from settings at request time — bounded by which drivers
 * `components/tracking-scripts.tsx` (M8) can ever render (GTM, Meta, GA4,
 * TikTok); there is no generic/arbitrary tracking URL feature for a
 * setting to drive.
 *
 * Deliberately `'unsafe-inline'` on `script-src` rather than per-request
 * nonces: threading a nonce from here into `tracking-scripts.tsx`'s inline
 * `<Script>` tags needs the request-header-forwarding half of
 * `NextResponse.next({ request: { headers } })`, which next-intl's own
 * `createMiddleware` already returns a fully-built response for — this
 * file can only add response headers to that response, not rebuild its
 * request-forwarding. A real nonce needs next-intl's own middleware
 * composition support (or dropping next-intl's proxy and reimplementing
 * its locale routing here); `'unsafe-inline'` plus the tight host
 * allow-list below (nothing here is ever reflected user input — see the
 * sanitization work in apps/api/src/cms/pages.service.ts) is the pragmatic
 * trade documented here rather than shipped broken (see docs/DECISIONS.md).
 */
function withSecurityHeaders(response: NextResponse): NextResponse {
  const frameAncestors = ["'self'", process.env.ADMIN_URL].filter(Boolean).join(" ");
  const isDev = process.env.NODE_ENV !== "production";
  // The local storage driver serves media from `${API_URL}/media` — on plain http in development,
  // which the `https:` source alone doesn't cover, so product images were blocked (docs/DECISIONS.md 2026-11-14).
  const apiOrigin = new URL(process.env.API_URL ?? "http://localhost:4000").origin;
  const csp = [
    "default-src 'self'",
    // Dev only: React's debug tooling needs eval, and Next's HMR client needs its websocket.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://analytics.tiktok.com https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https: ${apiOrigin}`,
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws://localhost:3000 ws://127.0.0.1:3000" : ""} https://www.google-analytics.com https://analytics.tiktok.com https://connect.facebook.net https://www.facebook.com`,
    // Cloudflare Turnstile (checkout captcha) runs in an iframe from its own origin.
    "frame-src 'self' https://challenges.cloudflare.com",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return response;
}

export default function proxy(request: NextRequest) {
  const response = intlProxy(request) as NextResponse;
  return withSecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
