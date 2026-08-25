import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingIncludes: {
    "/api/search": ["./.runtime-data/**/*"],
    "/api/query-plan": ["./.runtime-data/**/*"],
    "/api/entities": ["./.runtime-data/**/*"],
    "/api/benchmark-editor": ["./.runtime-data/**/*"],
    "/api/benchmark-pool": ["./.runtime-data/**/*"],
    "/api/health": ["./.runtime-data/**/*"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https://image.tmdb.org; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self'",
          },
        ],
      },
    ];
  },
  images: {
    qualities: [75],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        port: "",
        pathname: "/t/p/**",
        search: "",
      },
    ],
    maximumRedirects: 0,
    maximumResponseBody: 5_000_000,
  },
};

export default nextConfig;
