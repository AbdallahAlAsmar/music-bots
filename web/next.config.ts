import type { NextConfig } from "next";
import path from "node:path";

/**
 * Where API requests get proxied server-side. The bot host (fi7) only speaks
 * plain HTTP, which browsers block from an HTTPS page — so the browser calls
 * /api/* on this site and Vercel forwards it over HTTP where that's allowed.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:21024";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname)
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
