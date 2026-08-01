/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Do not bundle Chromium into the serverless function graph incorrectly
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  experimental: {
    serverComponentsExternalPackages: [
      "@sparticuz/chromium",
      "puppeteer-core",
    ],
    // Ensure chromium binary assets are included in the Vercel function
    outputFileTracingIncludes: {
      "/api/leads/[id]/estimate": [
        "./node_modules/@sparticuz/chromium/**/*",
        "./node_modules/@sparticuz/chromium/bin/**/*",
      ],
      "/api/leads/*/estimate": [
        "./node_modules/@sparticuz/chromium/**/*",
        "./node_modules/@sparticuz/chromium/bin/**/*",
      ],
    },
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Force webpack to leave these as require()'able node packages
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("@sparticuz/chromium");
        config.externals.push("puppeteer-core");
      }
    }
    return config;
  },
};

module.exports = nextConfig;
