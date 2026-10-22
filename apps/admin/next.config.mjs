/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@clothing/ui", "@clothing/shared", "@clothing/sdk"],
};

export default nextConfig;
