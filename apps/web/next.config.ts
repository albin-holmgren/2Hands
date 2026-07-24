import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

const isDev = process.env.NODE_ENV === "development";

// Allow the configured Supabase origin in connect-src when it is not a hosted
// *.supabase.co project (local `supabase start` stacks, self-hosted). Without
// this, sign-in against a local stack is blocked by CSP in dev/E2E runs.
const supabaseOrigin = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!url) return null;
    const origin = new URL(url).origin;
    return origin.endsWith(".supabase.co") ? null : origin;
  } catch {
    return null;
  }
})();
const supabaseConnectSrc = supabaseOrigin
  ? ` ${supabaseOrigin} ${supabaseOrigin.replace(/^http/, "ws")}`
  : "";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Performance: Enable React Compiler for automatic optimizations
  reactCompiler: true,

  // Performance: Optimize package imports for faster builds
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      'framer-motion',
      'react-markdown',
    ],
  },

  // Performance: Externalize heavy Node.js-only packages from the bundle.
  // playwright-core drives the v3 deterministic browser login (Slice 3) and
  // must not be bundled — it resolves browser binaries at runtime.
  serverExternalPackages: ['pino', 'pino-pretty', 'sharp', 'playwright-core'],

  // Performance: Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },

  // Performance: Compress responses
  compress: true,

  // Performance: Generate ETags for caching
  generateEtags: true,

  // Performance: Strict mode for better debugging
  reactStrictMode: true,

  // Security: Hide X-Powered-By header
  poweredByHeader: false,

  // Security headers to prevent common attacks
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Control referrer information
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Disable unnecessary browser features. Microphone stays allowed for
          // same-origin — v3 push-to-talk records via getUserMedia (Slice 9).
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), browsing-topics=()' },
          // XSS protection (legacy browsers)
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // HSTS: enforce HTTPS for 1 year + subdomains + preload
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://va.vercel-scripts.com https://vercel.live`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' blob: data: https://*.supabase.co https://*.stripe.com https://cdn.jsdelivr.net https://cdn.simpleicons.org",
              "font-src 'self' https://fonts.gstatic.com",
              `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://va.vercel-scripts.com https://vercel.live${supabaseConnectSrc}`,
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
      {
        // Cache static assets aggressively (fonts, images, etc.)
        source: '/(.*)\\.(ico|png|jpg|jpeg|gif|webp|avif|svg|woff|woff2|ttf|eot)$',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Cache JS/CSS with revalidation
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Static legal & marketing pages - cacheable public content
        source: '/(privacy|terms|about|features|docs|changelog|pricing)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
      {
        // Auth-dependent pages - never cache publicly (middleware redirects based on cookies)
        source: '/(login|signup)',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
      {
        // Landing page - auth-dependent redirect, no public caching
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
      {
        // Dashboard pages - private, no caching
        source: '/app/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
      {
        // Stricter headers for API routes
        source: '/api/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },
};

// In development: skip Sentry to avoid webpack plugin overhead & instrumentation compile steps
// In production: wrap with Sentry for error tracking & source map uploads
const withAnalyzer = withBundleAnalyzer(nextConfig);

export default isDev
  ? withAnalyzer
  : withSentryConfig(withAnalyzer, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      bundleSizeOptimizations: {
        excludeDebugStatements: true,
      },
    });
