import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://2hands.ai";

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/privacy",
          "/terms",
          "/sign-in",
          "/signup",
          "/llms.txt",
        ],
        disallow: [
          "/app",
          "/app/*",
          "/api",
          "/api/*",
          "/auth/callback",
          "/_next",
          "/_next/*",
          "/invite/*", // Private invite links
          "/settings", // User settings
        ],
      },
      // AI crawlers - explicitly allow public content for training/indexing
      {
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "OAI-SearchBot",
          "Google-Extended",
          "Googlebot",
          "Anthropic-AI",
          "ClaudeBot",
          "Claude-Web",
          "PerplexityBot",
          "Bytespider",
          "CCBot",
          "cohere-ai",
          "Diffbot",
          "FacebookBot",
          "ImagesiftBot",
          "Omgilibot",
          "Timpibot",
          "YouBot",
          "Applebot",
          "Applebot-Extended",
        ],
        allow: [
          "/",
          "/privacy",
          "/terms",
          "/llms.txt",
        ],
        disallow: [
          "/app",
          "/app/*",
          "/api",
          "/api/*",
          "/invite/*",
        ],
      },
      // SEO crawlers
      {
        userAgent: [
          "AhrefsBot",
          "AhrefsSiteAudit",
          "SemrushBot",
          "Mozbot",
          "Screaming Frog SEO Spider",
        ],
        allow: "/",
        disallow: [
          "/app",
          "/api",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
