import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  images: {
    localPatterns: [
      {
        // Cho phép logo/cache-bust ?v=... với next/image
        pathname: "/images/**",
      },
    ],
  },
  experimental: {
    proxyClientMaxBodySize: "200mb",
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;
