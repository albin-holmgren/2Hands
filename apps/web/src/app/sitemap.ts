import { MetadataRoute } from "next";

const baseUrl = "https://2hands.ai";

// Main pages sitemap
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    // Core landing pages
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
      images: [`${baseUrl}/logo.png`, `${baseUrl}/og-image.png`],
    },
    // Feature pages (for sitelinks)
    {
      url: `${baseUrl}/features`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/about`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // Developer docs
    {
      url: `${baseUrl}/docs`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    // Auth pages
    {
      url: `${baseUrl}/signup`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/sign-in`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    // Legal pages
    {
      url: `${baseUrl}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}

// Image sitemap for better image SEO
export function imageSitemap(): string {
  const images = [
    {
      loc: `${baseUrl}/logo.png`,
      title: "2Hands Logo",
      caption: "2Hands - AI Agent Manager Platform",
      license: `${baseUrl}/terms`,
    },
    {
      loc: `${baseUrl}/logo-white.svg`,
      title: "2Hands Logo White",
      caption: "2Hands Logo for Dark Backgrounds",
    },
    {
      loc: `${baseUrl}/logo-black.svg`,
      title: "2Hands Logo Black",
      caption: "2Hands Logo for Light Backgrounds",
    },
    {
      loc: `${baseUrl}/og-image.png`,
      title: "2Hands Platform",
      caption: "AI-powered agent management for autonomous task automation",
    },
    {
      loc: `${baseUrl}/appicon.png`,
      title: "2Hands App Icon",
      caption: "2Hands Mobile App Icon",
    },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${baseUrl}</loc>
    ${images
      .map(
        (img) => `    <image:image>
      <image:loc>${img.loc}</image:loc>
      <image:title>${img.title}</image:title>
      <image:caption>${img.caption}</image:caption>
      ${img.license ? `<image:license>${img.license}</image:license>` : ""}
    </image:image>`
      )
      .join("\n")}
  </url>
</urlset>`;

  return xml;
}

// Sitemap index for multiple sitemaps (useful when scaling)
export function sitemapIndex(): string {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/sitemap.xml</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-images.xml</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
  </sitemap>
</sitemapindex>`;

  return xml;
}
