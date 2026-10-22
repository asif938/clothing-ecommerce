/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@clothing/ui", "@clothing/shared", "@clothing/sdk", "@clothing/blocks"],
  images: {
    // Custom loader mapping to pre-generated sizes lands in Milestone 1/4
    // (docs/PROJECT_SPEC.md §3.3, §7.6) — no reliance on paid image optimization.
    remotePatterns: [],
  },
};

export default nextConfig;
