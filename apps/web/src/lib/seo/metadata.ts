import { Metadata } from "next";

interface SEOMetadataProps {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: "website" | "article" | "product" | "software";
  keywords?: string[];
  noIndex?: boolean;
  canonical?: string;
}

export function generateSEOMetadata({
  title,
  description,
  path = "",
  image = "/og-image.png",
  type = "website",
  keywords = [],
  noIndex = false,
  canonical,
}: SEOMetadataProps): Metadata {
  const baseUrl = "https://2hands.ai";
  const url = path ? `${baseUrl}${path}` : baseUrl;
  const fullImageUrl = image.startsWith("http") ? image : `${baseUrl}${image}`;

  return {
    title: `${title} | 2Hands`,
    description,
    keywords: [
      "AI agents",
      "task automation",
      "AI assistant",
      "autonomous AI",
      ...keywords,
    ],
    authors: [{ name: "2Hands" }],
    creator: "2Hands",
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: canonical || url,
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: type as "website" | "article",
      locale: "en_US",
      url,
      siteName: "2Hands",
      title: `${title} | 2Hands`,
      description,
      images: [
        {
          url: fullImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | 2Hands`,
      description,
      images: [fullImageUrl],
      creator: "@2handsai",
    },
    // Verification tags (add when you have them)
    verification: {
      // google: "your-google-verification-code",
      // other: {
      //   "msvalidate.01": "your-bing-verification-code",
      // },
    },
  };
}

// Page-specific metadata presets
export const pageMetadata = {
  home: generateSEOMetadata({
    title: "AI Agent Manager | Automate Any Computer Task",
    description:
      "2Hands is an AI-powered agent management platform. Delegate complex computer tasks to autonomous AI agents that work 24/7 on virtual machines.",
    path: "/",
    keywords: [
      "AI agent manager",
      "task automation",
      "autonomous AI",
      "workflow automation",
    ],
  }),

  signup: generateSEOMetadata({
    title: "Sign Up - Start Automating with AI Agents",
    description:
      "Create your free 2Hands account. No credit card required. Start delegating tasks to AI agents in minutes.",
    path: "/signup",
    keywords: ["sign up", "free trial", "AI automation"],
  }),

  signin: generateSEOMetadata({
    title: "Sign In - Access Your AI Agents",
    description: "Sign in to your 2Hands account to manage your AI agents and automation workflows.",
    path: "/sign-in",
    keywords: ["login", "sign in", "account access"],
    noIndex: true, // Don't index login pages
  }),

  privacy: generateSEOMetadata({
    title: "Privacy Policy",
    description:
      "2Hands privacy policy. Learn how we protect your data and keep your information secure.",
    path: "/privacy",
    keywords: ["privacy", "data protection", "security"],
  }),

  terms: generateSEOMetadata({
    title: "Terms of Service",
    description:
      "2Hands terms of service. Read our terms and conditions for using the AI agent management platform.",
    path: "/terms",
    keywords: ["terms", "conditions", "legal"],
  }),

  dashboard: generateSEOMetadata({
    title: "Dashboard - Manage Your AI Agents",
    description: "Manage your AI agents, monitor tasks, and configure automation workflows.",
    noIndex: true, // Dashboard should not be indexed
  }),
};

// JSON-LD structured data helpers
export function generateSoftwareApplicationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "2Hands",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "AI-powered agent management platform for autonomous task automation",
    url: "https://2hands.ai",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "0",
      highPrice: "249",
      offerCount: "4",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "150",
    },
  };
}

export function generateOrganizationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "2Hands",
    url: "https://2hands.ai",
    logo: {
      "@type": "ImageObject",
      url: "https://2hands.ai/logo.png",
      width: 512,
      height: 512,
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "support@2hands.ai",
      },
    ],
  };
}

export function generateBreadcrumbSchema(
  items: { name: string; item?: string }[]
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
}
