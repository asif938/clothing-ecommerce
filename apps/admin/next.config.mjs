import createNextIntlPlugin from "next-intl/plugin";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@clothing/ui", "@clothing/shared", "@clothing/sdk"],
  // Browser calls hit the admin app's own origin at `/api/*`; Next.js
  // forwards them server-side to the real API (`API_URL`, infra-only env,
  // §4.1). Keeps the API's URL changeable by restarting this app — no
  // rebuild, no CORS, no NEXT_PUBLIC_* baked into the client bundle.
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
  // §12 CSP — static. NOTE: Next.js's App Router always injects inline
  // bootstrap scripts (`self.__next_r`, `self.__next_f.push(...)`), so a
  // `script-src 'self'` policy blocks hydration entirely (the page renders
  // but no JS runs — forms fall back to a native GET submit). A nonce can't
  // be threaded in from static `headers()`, so `'unsafe-inline'` is used,
  // same trade-off as apps/storefront/proxy.ts (docs/DECISIONS.md
  // 2026-11-12). Dev additionally needs `'unsafe-eval'` (React/Turbopack
  // dev tooling) and the HMR websocket. `frame-src` allows the page
  // builder's live-preview iframe (M3) to embed the storefront;
  // `frame-ancestors 'none'` because nothing should embed the admin panel.
  async headers() {
    const storefrontUrl = process.env.STOREFRONT_URL ?? "http://localhost:3000";
    const isDev = process.env.NODE_ENV !== "production";
    // The local storage driver serves media from `${API_URL}/media` — on plain http in development,
    // which the `https:` source alone doesn't cover (docs/DECISIONS.md 2026-11-14).
    const apiOrigin = new URL(process.env.API_URL ?? "http://localhost:4000").origin;
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https: ${apiOrigin}`,
      "font-src 'self' data:",
      // The media library uploads straight from the browser to the active
      // storage provider (direct-upload ticket). Cloudinary's upload API has a
      // fixed origin; without it here the browser blocks the request and the
      // upload fails with a bare "Failed to fetch".
      `connect-src 'self' https://api.cloudinary.com${isDev ? " ws://localhost:3001 ws://127.0.0.1:3001" : ""}`,
      `frame-src 'self' ${storefrontUrl}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
