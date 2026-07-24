import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display, Newsreader } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Analytics } from "@vercel/analytics/react";
import {
  generateStructuredData,
  twoHandsOrganization,
  twoHandsWebSite,
  twoHandsSoftware,
  twoHandsFAQ,
  gettingStartedHowTo,
} from "@/lib/seo/structured-data";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  fallback: [
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "sans-serif",
  ],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  fallback: ["Georgia", "serif"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1918" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL("https://2hands.ai"),
  title: {
    default: "2Hands | Hands on AI",
    template: "%s | 2Hands",
  },
  description:
    "2Hands is an AI-powered agent management platform. Delegate complex computer tasks to autonomous AI agents that work 24/7 on virtual machines.",
  keywords: [
    "AI agents",
    "task automation",
    "AI assistant",
    "autonomous AI",
    "email automation",
    "web research",
    "AI manager",
    "workflow automation",
    "computer automation",
    "virtual assistant",
  ],
  authors: [{ name: "2Hands", url: "https://2hands.ai" }],
  creator: "2Hands",
  publisher: "2Hands",
  applicationName: "2Hands",
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  alternates: {
    canonical: "https://2hands.ai",
    languages: {
      "en-US": "https://2hands.ai",
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://2hands.ai",
    siteName: "2Hands",
    title: "2Hands - Hands on AI",
    description: "Delegate complex computer tasks to autonomous AI agents.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "2Hands - AI Agent Management Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@2handsai",
    creator: "@2handsai",
    title: "2Hands - Hands on AI",
    description: "Delegate complex computer tasks to autonomous AI agents.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg?v=2",
    apple: "/appicon.png?v=2",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "2Hands",
  },
  referrer: "origin-when-cross-origin",
  category: "technology",
  classification: "software",
  // GOOGLE SEARCH CONSOLE: Add your verification code here
  // Get it from: https://search.google.com/search-console
  verification: {
    // google: "YOUR_GOOGLE_VERIFICATION_CODE",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Generate comprehensive structured data
  const jsonLd = generateStructuredData([
    twoHandsOrganization,
    twoHandsWebSite,
    twoHandsSoftware,
    twoHandsFAQ,
    gettingStartedHowTo,
  ]);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${playfairDisplay.variable} ${newsreader.variable}`}
    >
      <head>
        {/* PWA and mobile */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="2Hands" />
        <meta name="application-name" content="2Hands" />
        <meta name="msapplication-TileColor" content="#1A1918" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="theme-color" content="#FFFFFF" />

        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />

        {/* AI/LLM specific */}
        <link rel="help" href="/llms.txt" />
      </head>
      <body
        className={`${dmSans.variable} ${playfairDisplay.variable} ${newsreader.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        {/* Skip to content link for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
        >
          Skip to content
        </a>
        <Providers>
          <div id="main-content">{children}</div>
        </Providers>
        {process.env.NODE_ENV === "production" ? <Analytics /> : null}
      </body>
    </html>
  );
}
