import createNextIntlPlugin from "next-intl/plugin";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@clothing/ui", "@clothing/shared", "@clothing/sdk", "@clothing/blocks"],
  // `pnpm build`'s pre-existing static-export crash (docs/DECISIONS.md,
  // flagged since M4/M6, re-investigated in M9) is NOT fixed by anything
  // here — see DECISIONS.md 2026-11-06 for everything that was tried
  // (Turbopack vs. webpack, Next 16.4.2 vs. 16.4.5, `experimental.
  // serverMinification`/`prerenderEarlyExit`) and why none of it is a
  // safe permanent fix.
  images: {
    // Custom loader mapping to pre-generated sizes lands in Milestone 1/4
    // (docs/PROJECT_SPEC.md §3.3, §7.6) — no reliance on paid image optimization.
    remotePatterns: [],
  },
  // See apps/admin/next.config.mjs for why this proxies to the real API
  // server-side instead of exposing API_URL to the browser.
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
