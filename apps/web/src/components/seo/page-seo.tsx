"use client";

import Script from "next/script";
import {
  generateBreadcrumb,
  generateStructuredData,
} from "@/lib/seo/structured-data";

interface PageSEOProps {
  breadcrumbs?: { name: string; item?: string }[];
  additionalSchema?: Record<string, unknown>;
}

export function PageSEO({ breadcrumbs, additionalSchema }: PageSEOProps) {
  const schemas: unknown[] = [];

  if (breadcrumbs && breadcrumbs.length > 0) {
    schemas.push(generateBreadcrumb(breadcrumbs));
  }

  if (additionalSchema) {
    schemas.push(additionalSchema);
  }

  if (schemas.length === 0) return null;

  const jsonLd = generateStructuredData(schemas);

  return (
    <Script
      id="page-structured-data"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd }}
    />
  );
}

// Breadcrumb component for navigation
interface BreadcrumbsProps {
  items: { name: string; href?: string }[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="py-2">
      <ol
        className="flex items-center space-x-2 text-sm text-muted-foreground"
        itemScope
        itemType="https://schema.org/BreadcrumbList"
      >
        {items.map((item, index) => (
          <li
            key={index}
            className="flex items-center"
            itemProp="itemListElement"
            itemScope
            itemType="https://schema.org/ListItem"
          >
            {index > 0 && (
              <svg
                className="mx-2 h-4 w-4 text-muted-foreground/50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
            {item.href ? (
              <a
                href={item.href}
                itemProp="item"
                className="hover:text-foreground transition-colors"
              >
                <span itemProp="name">{item.name}</span>
              </a>
            ) : (
              <span itemProp="name" className="text-foreground">
                {item.name}
              </span>
            )}
            <meta itemProp="position" content={String(index + 1)} />
          </li>
        ))}
      </ol>
    </nav>
  );
}
