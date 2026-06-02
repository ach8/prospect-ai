import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyTimeout: 120000,
  },
  async rewrites() {
    const isProd = process.env.NODE_ENV === 'production';
    return [
      {
        source: '/api/v1/:path*',
        destination: isProd 
          ? 'http://api:4000/api/v1/:path*' 
          : 'http://127.0.0.1:4000/api/v1/:path*',
      },
    ];
  },
};

export default nextConfig;
