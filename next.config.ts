import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const withPWA = withPWAInit({
  dest: "public",
  // A service worker in `next dev` caches half-built assets and wastes hours.
  disable: process.env.NODE_ENV === "development",
  register: true,
  reloadOnOnline: true,
  workboxOptions: {
    skipWaiting: true,
  },
});

const nextConfig: NextConfig = {
  // Required for the SmarterASP deploy: emits .next/standalone with only the
  // traced runtime deps, so we never ship a Linux-built node_modules to Windows.
  output: "standalone",
  poweredByHeader: false,
  // bcryptjs and Prisma must stay real Node modules, never bundled for edge.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  experimental: {
    // Uploads go through a route handler; keep the body cap explicit.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default withPWA(withNextIntl(nextConfig));
