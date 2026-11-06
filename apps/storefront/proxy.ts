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
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://analytics.tiktok.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://www.google-analytics.com https://analytics.tiktok.com https://connect.facebook.net https://www.facebook.com",
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
