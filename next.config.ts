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
  // Never cache navigations or the start URL. Every page here is behind a login,
  // and a cached HTML page on a shared phone would be served to whoever opens
  // the app next. Only immutable static assets are cached.
  cacheStartUrl: false,
  dynamicStartUrl: false,
  cacheOnFrontEndNav: false,
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        // Hashed build output: safe to cache forever, identical for everyone.
        urlPattern: /\/_next\/static\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static",
          expiration: { maxEntries: 256, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\/icons\/.*\.png$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "app-icons",
          expiration: { maxEntries: 16, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\/manifest\.webmanifest$/i,
        handler: "StaleWhileRevalidate",
        options: { cacheName: "app-manifest" },
      },
    ],
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
