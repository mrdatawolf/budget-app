import type { NextConfig } from "next";
import packageJson from "./package.json";

const apiPort = process.env.API_PORT || '3401';

const nextConfig: NextConfig = {
  // Enable standalone output for self-contained server deployment
  // This creates a minimal server that can run without node_modules
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  // Proxy /api/* requests to the Hono API server during development.
  // This avoids cross-origin issues when client and server run on different ports.
  // In production, NEXT_PUBLIC_SERVER_URI can point directly to the API server.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:${apiPort}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
