import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Portable config for local dev & standard hosting (npm run build && npm start).
     For standalone/Docker deployments add: output: "standalone" */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
