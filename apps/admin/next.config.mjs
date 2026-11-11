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
  // §12 CSP — static (no nonce needed: the admin app renders no inline
  // `<script>`, every script is Next's own same-origin bundle). `frame-src`
  // allows the page builder's live-preview iframe (M3) to embed the
  // storefront; `frame-ancestors 'none'` because nothing should embed the
  // admin panel itself.
  async headers() {
    const storefrontUrl = process.env.STOREFRONT_URL ?? "http://localhost:3000";
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
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
