// Structured data helpers for SEO
// https://schema.org/docs/schemas.html

export interface OrganizationSchema {
  "@type": "Organization";
  "@id": string;
  name: string;
  url: string;
  logo: {
    "@type": "ImageObject";
    url: string;
    width?: number;
    height?: number;
  };
  sameAs?: string[];
  contactPoint?: {
    "@type": "ContactPoint";
    contactType: string;
    email?: string;
  }[];
}

export interface WebSiteSchema {
  "@type": "WebSite";
  "@id": string;
  url: string;
  name: string;
  description?: string;
  publisher: { "@id": string };
  potentialAction?: {
    "@type": "SearchAction";
    target: string;
    "query-input": string;
  };
}

export interface SoftwareApplicationSchema {
  "@type": "SoftwareApplication";
  "@id": string;
  name: string;
  applicationCategory: string;
  operatingSystem: string;
  description: string;
  url: string;
  provider: { "@id": string };
  offers?: {
    "@type": "AggregateOffer" | "Offer";
    priceCurrency: string;
    lowPrice?: string;
    highPrice?: string;
    price?: string;
    offerCount?: string;
  };
  featureList?: string[];
  screenshot?: {
    "@type": "ImageObject";
    url: string;
  };
  aggregateRating?: {
    "@type": "AggregateRating";
    ratingValue: string;
    ratingCount: string;
  };
}

export interface BreadcrumbListSchema {
  "@type": "BreadcrumbList";
  "@id": string;
  itemListElement: {
    "@type": "ListItem";
    position: number;
    name: string;
    item?: string;
  }[];
}

export interface FAQPageSchema {
  "@type": "FAQPage";
  "@id": string;
  mainEntity: {
    "@type": "Question";
    name: string;
    acceptedAnswer: {
      "@type": "Answer";
      text: string;
    };
  }[];
}

export interface ProductSchema {
  "@type": "Product";
  "@id": string;
  name: string;
  description: string;
  url: string;
  brand?: { "@id": string };
  offers?: {
    "@type": "Offer";
    url: string;
    priceCurrency: string;
    price: string;
    availability: string;
    validFrom?: string;
  };
}

export interface HowToSchema {
  "@type": "HowTo";
  "@id": string;
  name: string;
  description: string;
  totalTime?: string;
  estimatedCost?: {
    "@type": "MonetaryAmount";
    currency: string;
    value: string;
  };
  step: {
    "@type": "HowToStep";
    position: number;
    name: string;
    text: string;
    url?: string;
  }[];
}

export type SchemaType = 
  | OrganizationSchema 
  | WebSiteSchema 
  | SoftwareApplicationSchema 
  | BreadcrumbListSchema 
  | FAQPageSchema
  | ProductSchema
  | HowToSchema;

export function generateStructuredData(schemas: unknown[]): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": schemas,
  };
  return JSON.stringify(data);
}

// Pre-defined schemas for 2Hands
export const twoHandsOrganization: OrganizationSchema = {
  "@type": "Organization",
  "@id": "https://2hands.ai/#organization",
  name: "2Hands",
  url: "https://2hands.ai",
  logo: {
    "@type": "ImageObject",
    url: "https://2hands.ai/logo.png",
    width: 512,
    height: 512,
  },
  sameAs: [
    // Add social profiles when available
    // "https://twitter.com/2handsai",
    // "https://linkedin.com/company/2hands",
    // "https://crunchbase.com/organization/2hands",
  ],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "support@2hands.ai",
    },
  ],
};

export const twoHandsWebSite: WebSiteSchema = {
  "@type": "WebSite",
  "@id": "https://2hands.ai/#website",
  url: "https://2hands.ai",
  name: "2Hands - AI Agent Manager",
  description: "AI-powered agent management platform for autonomous task automation",
  publisher: { "@id": "https://2hands.ai/#organization" },
  potentialAction: {
    "@type": "SearchAction",
    target: "https://2hands.ai/?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

export const twoHandsSoftware: SoftwareApplicationSchema = {
  "@type": "SoftwareApplication",
  "@id": "https://2hands.ai/#software",
  name: "2Hands",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: "AI-powered agent management platform. Delegate complex computer tasks to autonomous AI agents that work 24/7 on virtual machines.",
  url: "https://2hands.ai",
  provider: { "@id": "https://2hands.ai/#organization" },
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "USD",
    lowPrice: "0",
    highPrice: "249",
    offerCount: "4",
  },
  featureList: [
    "AI Agent Management",
    "Autonomous Task Execution",
    "24/7 Virtual Machine Operations",
    "Web Research Automation",
    "Email Automation",
    "Form Filling & Data Entry",
    "Screenshot & Report Generation",
    "Secure Credential Vault",
  ],
  screenshot: {
    "@type": "ImageObject",
    url: "https://2hands.ai/og-image.png",
  },
};

export const twoHandsFAQ: FAQPageSchema = {
  "@type": "FAQPage",
  "@id": "https://2hands.ai/#faq",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is 2Hands?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "2Hands is an AI-powered agent management platform that lets you delegate complex computer tasks to autonomous AI agents. These agents work 24/7 on virtual machines, automating web research, email management, data entry, and other computer-based workflows.",
      },
    },
    {
      "@type": "Question",
      name: "How do 2Hands AI agents work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "2Hands AI agents operate on virtual machines and can control a computer just like a human. They can browse the web, read and send emails, fill out forms, capture screenshots, and execute multi-step workflows autonomously. You create agents through a conversational AI Manager interface.",
      },
    },
    {
      "@type": "Question",
      name: "What tasks can 2Hands automate?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "2Hands can automate web research and data collection, email management and responses, form filling and data entry, content gathering from multiple sources, lead generation, competitor monitoring, and any repetitive computer-based workflow that would normally require human attention.",
      },
    },
    {
      "@type": "Question",
      name: "Is 2Hands secure?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. 2Hands uses encrypted credential storage (AES-256-GCM), human-in-the-loop approval workflows for sensitive actions, and isolated virtual machine environments. You maintain control over what actions agents can take autonomously, and all data is protected with enterprise-grade security.",
      },
    },
    {
      "@type": "Question",
      name: "How much does 2Hands cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "2Hands offers a free tier to get started, with paid plans starting from affordable monthly rates. We offer Starter, Pro, and Business plans to match your needs. You can also purchase credit packs for additional agent execution time. Visit our pricing page for current rates.",
      },
    },
  ],
};

export function generateBreadcrumb(items: { name: string; item?: string }[]): BreadcrumbListSchema {
  return {
    "@type": "BreadcrumbList",
    "@id": "https://2hands.ai/#breadcrumb",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.item && { item: item.item }),
    })),
  };
}

export const gettingStartedHowTo: HowToSchema = {
  "@type": "HowTo",
  "@id": "https://2hands.ai/#howto-getstarted",
  name: "How to Create Your First AI Agent",
  description: "Learn how to set up and deploy your first autonomous AI agent with 2Hands in just a few simple steps.",
  totalTime: "PT5M",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Sign up for 2Hands",
      text: "Create your free 2Hands account at 2hands.ai. No credit card required to get started.",
      url: "https://2hands.ai/signup",
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Chat with the AI Manager",
      text: "Tell the AI Manager what task you want to automate. Describe your workflow in natural language.",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Configure your agent",
      text: "Set your agent's schedule (one-time, recurring, or continuous) and provide any necessary credentials.",
    },
    {
      "@type": "HowToStep",
      position: 4,
      name: "Deploy and monitor",
      text: "Your agent starts working immediately. Monitor progress, view screenshots, and receive notifications when tasks complete.",
    },
  ],
};
