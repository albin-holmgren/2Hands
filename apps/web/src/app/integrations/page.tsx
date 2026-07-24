import { Metadata } from "next";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { CTABanner } from "@/components/marketing/CTABanner";
import {
  SiSlack, SiGmail, SiDiscord,
  SiNotion, SiGooglecalendar, SiGooglesheets,
  SiHubspot, SiShopify,
  SiOpenai, SiPerplexity, SiElevenlabs,
} from "react-icons/si";
import type { IconType } from "react-icons";

const OutlookSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <rect x="1" y="4" width="14" height="16" rx="1.5" fill="#0078D4"/>
    <path d="M15 8.5L23 5v14l-8-3.5V8.5Z" fill="#106EBE"/>
    <ellipse cx="8" cy="12" rx="3.5" ry="4" fill="white"/>
    <ellipse cx="8" cy="12" rx="2" ry="2.5" fill="#0078D4"/>
  </svg>
);

const TeamsSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="16" cy="6" r="3" fill="#7B83EB"/>
    <rect x="11" y="10" width="10" height="9" rx="2" fill="#7B83EB"/>
    <circle cx="8.5" cy="8" r="3.5" fill="#5059C9"/>
    <rect x="1" y="12" width="12" height="9" rx="2" fill="#5059C9"/>
    <rect x="3" y="14" width="8" height="2" rx="1" fill="white"/>
    <rect x="3" y="17" width="5" height="2" rx="1" fill="white"/>
  </svg>
);

export const metadata: Metadata = {
  title: "Integrations - Connect your tools | 2Hands",
  description:
    "Connect Slack, GitHub, Notion, Gmail, and more. Your agents read, write, and take action across your entire stack.",
  keywords: ["AI integrations", "Slack automation", "GitHub automation", "Notion automation", "Gmail automation"],
};

type Integration = {
  name: string;
  description: string;
  Icon?: IconType;
  CustomSvg?: () => React.JSX.Element;
  slug: string;
  color: string;
};

type Category = {
  name: string;
  items: Integration[];
};

const catalog: Category[] = [
  {
    name: "Communication",
    items: [
      { name: "Slack", description: "Send messages, create channels, and deliver agent updates to your workspace.", Icon: SiSlack, slug: "slack", color: "#4A154B" },
      { name: "Gmail", description: "Read, draft, and send emails. Automate follow-ups and inbox management.", Icon: SiGmail, slug: "gmail", color: "#EA4335" },
      { name: "Outlook", description: "Microsoft 365 email automation with full read and write capabilities.", CustomSvg: OutlookSvg, slug: "microsoftoutlook", color: "#0078D4" },
      { name: "Microsoft Teams", description: "Post messages and interact with Teams channels from your agents.", CustomSvg: TeamsSvg, slug: "microsoftteams", color: "#6264A7" },
      { name: "Discord", description: "Send messages and interact with servers and DMs from your agents.", Icon: SiDiscord, slug: "discord", color: "#5865F2" },
    ],
  },
  {
    name: "Productivity",
    items: [
      { name: "Notion", description: "Create pages, update databases, and organise knowledge automatically.", Icon: SiNotion, slug: "notion", color: "#000000" },
      { name: "Google Calendar", description: "Schedule meetings, check availability, and send invites.", Icon: SiGooglecalendar, slug: "googlecalendar", color: "#4285F4" },
      { name: "Google Sheets", description: "Read data, update cells, and generate reports from spreadsheets.", Icon: SiGooglesheets, slug: "googlesheets", color: "#34A853" },
    ],
  },
  {
    name: "CRM & Sales",
    items: [
      { name: "HubSpot", description: "Manage contacts, deals, and marketing campaigns automatically.", Icon: SiHubspot, slug: "hubspot", color: "#FF7A59" },
    ],
  },
  {
    name: "E-commerce",
    items: [
      { name: "Shopify", description: "Manage products, orders, and customer data from your store.", Icon: SiShopify, slug: "shopify", color: "#96BF48" },
    ],
  },
  {
    name: "AI & Data",
    items: [
      { name: "OpenAI", description: "Access GPT-4 and other OpenAI models for advanced processing tasks.", Icon: SiOpenai, slug: "openai", color: "#412991" },
      { name: "Perplexity", description: "Augment agents with real-time web search and AI-powered research.", Icon: SiPerplexity, slug: "perplexity", color: "#1FB8CD" },
      { name: "ElevenLabs", description: "Generate realistic voice audio from text for notifications and content.", Icon: SiElevenlabs, slug: "elevenlabs", color: "#000000" },
      { name: "Firecrawl", description: "Extract structured data from any website with intelligent crawling.", slug: "firecrawl", color: "#FC442B" },
    ],
  },
];

const totalCount = catalog.reduce((sum, cat) => sum + cat.items.length, 0);

export default function IntegrationsPage() {
  return (
    <div className="marketing-page">
      <div className="fixed text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
        <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
        <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
        <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
        <div className="text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
        <div className="text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
        <div className="text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
      </div>
      <Navbar />
      <main className="flex flex-col flex-grow">

        {/* Hero — left-aligned */}
        <section className="relative items-stretch bg-stone-50 dark:bg-[#1A1918] flex flex-col justify-center">
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="max-w-[680px]">
              <div className="text-[13px] font-medium text-[#D97757] mb-6 tracking-widest uppercase">
                Integrations
              </div>
              <div className="mb-[32px] md:mb-[38px]">
                <h1 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[37.375px] leading-[1.1] md:text-6xl">
                  Your agents work<br />across your entire stack
                </h1>
              </div>
              <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] mb-10 max-w-[520px]">
                Connect the tools you already use. Agents read, write, and take action across {totalCount}+ integrations — no switching tabs, no manual hand-offs.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 items-start">
                <div className="relative inline-flex text-stone-50 bg-neutral-900 dark:text-neutral-900 dark:bg-white text-[17px] items-center caret-transparent justify-center leading-[17px] min-h-10 text-center align-middle px-6 py-2.5 rounded-[8.5px] shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px]">
                  <div className="relative font-medium z-[1] px-2">Try 2Hands for free</div>
                  <div className="absolute h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                    <a href="/sign-in" className="absolute block h-full max-w-full outline-offset-4 w-full rounded-[8.5px] inset-[0%]"></a>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        {/* Integration directory — grouped by category */}
        <section className="relative flex flex-col bg-white dark:bg-[#2C2B27]">
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto w-full py-0">
            {catalog.map((category) => (
              <div key={category.name}>
                {/* Category label row */}
                <div className="flex items-center gap-4 py-5 border-b border-stone-200 dark:border-[#3A3935]">
                  <span className="text-[12px] font-medium text-zinc-400 dark:text-[#6B6966] uppercase tracking-widest min-w-[140px]">
                    {category.name}
                  </span>
                </div>
                {/* Integration rows */}
                {category.items.map((item) => {
                  return (
                    <div
                      key={item.name}
                      className="flex items-center gap-5 py-5 border-b border-stone-100 dark:border-[#2A2927] last:border-stone-200 last:dark:border-[#3A3935]"
                    >
                      {/* Icon */}
                      <div className="w-9 h-9 bg-white dark:bg-white border border-stone-200 rounded-lg flex items-center justify-center shrink-0 p-1.5">
                        {item.CustomSvg ? (
                          <item.CustomSvg />
                        ) : item.Icon ? (
                          <item.Icon size={20} color={item.color} />
                        ) : (
                          <span className="text-[13px] font-bold" style={{ color: item.color }}>
                            {item.name.charAt(0)}
                          </span>
                        )}
                      </div>
                    {/* Name */}
                    <div className="text-[15px] font-medium text-neutral-900 dark:text-[#F5F3F0] min-w-[140px] shrink-0">
                      {item.name}
                    </div>
                    {/* Description */}
                    <div className="text-[14px] text-zinc-500 dark:text-[#9E9C99] leading-[1.6] hidden sm:block">
                      {item.description}
                    </div>
                  </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        {/* Custom API section */}
        <section className="relative items-stretch bg-white dark:bg-[#2C2B27] flex flex-col justify-center">
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24 items-start">
              <div>
                <div className="text-[13px] font-medium text-[#D97757] mb-6 tracking-widest uppercase">Custom APIs</div>
                <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-[1.2] md:text-[36px] mb-6">
                  Connect any tool, not just the ones listed
                </h2>
                <p className="text-zinc-500 dark:text-[#9E9C99] text-[16px] leading-[1.7] mb-8">
                  Paste your OpenAPI spec and 2Hands generates the integration automatically. Any internal tool, any proprietary API — if it has a spec, agents can use it.
                </p>
                <div className="relative inline-flex text-stone-50 bg-neutral-900 dark:text-neutral-900 dark:bg-white text-[17px] items-center caret-transparent justify-center leading-[17px] min-h-10 text-center align-middle px-6 py-2.5 rounded-[8.5px] shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px]">
                  <div className="relative font-medium z-[1] px-2">Read the docs</div>
                  <div className="absolute h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                    <a href="/docs" className="absolute block h-full max-w-full outline-offset-4 w-full rounded-[8.5px] inset-[0%]"></a>
                  </div>
                </div>
              </div>
              <div className="bg-stone-50 dark:bg-[#1A1918] border border-stone-200 dark:border-[#3A3935] rounded-2xl p-7 md:p-8">
                <div className="text-[12px] font-medium text-zinc-400 dark:text-[#6B6966] mb-5 tracking-widest uppercase">Example prompt</div>
                <p className="text-neutral-800 dark:text-[#C8C6C3] text-[15px] leading-[1.75] font-mono">
                  &ldquo;Check our sales pipeline in HubSpot, find deals stalled for 14+ days, create follow-up tasks in Notion for each account owner, and post a summary to #sales in Slack.&rdquo;
                </p>
                <div className="mt-6 pt-5 border-t border-stone-200 dark:border-[#3A3935]">
                  <div className="text-[12px] font-medium text-zinc-400 dark:text-[#6B6966] mb-3 tracking-widest uppercase">Tools used</div>
                  <div className="flex gap-2">
                    {([{ Icon: SiHubspot, color: "#FF7A59" }, { Icon: SiNotion, color: "#000000" }, { Icon: SiSlack, color: "#4A154B" }] as const).map(({ Icon, color }, i) => (
                      <div key={i} className="w-7 h-7 bg-white border border-stone-200 rounded-md flex items-center justify-center p-1">
                        <Icon size={16} color={color} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        <CTABanner
          title="Connect your tools in minutes."
          buttonText="Try 2Hands for free"
          buttonUrl="/sign-in"
        />

      </main>
      <Footer />
    </div>
  );
}
