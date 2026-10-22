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
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
