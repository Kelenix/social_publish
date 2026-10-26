import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@app/core", "@app/db"],
  serverExternalPackages: ["@node-rs/argon2"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default config;
