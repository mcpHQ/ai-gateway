import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "@secretlint/node", "@secretlint/secretlint-rule-preset-recommend"],
};

export default nextConfig;
