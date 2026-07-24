import { Metadata } from "next";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { CommonQuestions } from "@/components/marketing/CommonQuestions";

export const metadata: Metadata = {
  title: "Use Cases — What You Can Build With 2Hands",
  description:
    "Explore real workflows you can automate with 2Hands AI agents. From competitive research to sales outreach to content operations — see what's possible.",
  keywords: ["AI use cases", "automation workflows", "AI agent examples", "business automation", " Mission Mode examples"],
};

const useCases = [
  {
    category: "Research & Intelligence",
    items: [
      {
        title: "Competitive monitoring",
        description: "Track competitor pricing pages, product updates, and news mentions. Get a weekly digest delivered to Slack.",
        prompt: "Monitor our top 5 competitors' pricing and product pages. Alert me to any changes and send a weekly summary every Monday.",
      },
      {
        title: "Market research",
        description: "Research industry trends, customer segments, and market sizing. Build living research documents that update as new data emerges.",
        prompt: "Research the SMB CRM market: identify top 10 players, pricing trends, and feature gaps. Update the doc monthly.",
      },
      {
        title: "Customer intelligence",
        description: "Enrich lead and account data from public sources. Build comprehensive profiles before your sales team reaches out.",
        prompt: "For every new lead in HubSpot, research the company size, recent funding, tech stack, and key decision makers.",
      },
    ],
  },
  {
    category: "Sales & Outreach",
    items: [
      {
        title: "Outbound prospecting",
        description: "Identify ideal customers, research accounts, and draft personalised outreach sequences — all on autopilot.",
        prompt: "Find 50 companies matching our ICP, research each one, and draft personalised cold emails with specific pain points.",
      },
      {
        title: "Follow-up automation",
        description: "Monitor email opens and replies. Send timely, contextual follow-ups that don't feel automated.",
        prompt: "Track our outbound sequence. If no reply after 3 days, send a value-add follow-up. If opened 3+ times, alert sales.",
      },
      {
        title: "CRM hygiene",
        description: "Keep Salesforce or HubSpot current automatically. Update records, log activities, and flag stale data.",
        prompt: "Weekly: find all deals with no activity in 14 days, update the owner, and suggest next steps based on deal stage.",
      },
    ],
  },
  {
    category: "Content & Marketing",
    items: [
      {
        title: "SEO content engine",
        description: "Research keywords, outline articles, draft posts, and publish to your CMS — building your search presence continuously.",
        prompt: "Publish 3 SEO blog posts per week targeting our top 15 keywords. Include internal links and meta descriptions.",
      },
      {
        title: "Social monitoring",
        description: "Track brand mentions, competitor activity, and industry conversations across social platforms.",
        prompt: "Monitor Twitter and LinkedIn for mentions of our brand and competitors. Daily digest to marketing Slack.",
      },
      {
        title: "Campaign reporting",
        description: "Pull data from ad platforms, analytics, and CRM. Generate weekly campaign performance reports.",
        prompt: "Every Friday, pull ad spend, conversion data, and pipeline contribution. Generate a performance deck for leadership.",
      },
    ],
  },
  {
    category: "Operations & Data",
    items: [
      {
        title: "Reporting automation",
        description: "Connect multiple data sources and generate executive dashboards. No more manual spreadsheet wrangling.",
        prompt: "Daily at 9am: pull revenue, churn, and NPS from 4 systems. Generate executive summary and post to #leadership.",
      },
      {
        title: "Alert monitoring",
        description: "Watch metrics and data streams for anomalies. Get notified when thresholds breach or patterns emerge.",
        prompt: "Monitor server metrics and support ticket volume. If error rate > 5% or tickets spike 50%, page the on-call.",
      },
      {
        title: "Data sync",
        description: "Keep systems in sync automatically. Transfer records, update statuses, and maintain data consistency.",
        prompt: "When a deal closes in Salesforce, create a project in Asana, notify Slack #delivery, and update the finance sheet.",
      },
    ],
  },
  {
    category: "Support & Success",
    items: [
      {
        title: "Ticket triage",
        description: "Read incoming tickets, classify urgency, and route to the right team — cutting response times.",
        prompt: "Auto-triage support tickets: classify as bug, feature request, or billing. Route bugs to engineering, billing to finance.",
      },
      {
        title: "Response drafting",
        description: "Draft contextual first responses using your knowledge base and past resolutions.",
        prompt: "For tier-1 support tickets, draft a response using our help docs. Queue for agent review before sending.",
      },
      {
        title: "Health score monitoring",
        description: "Track customer engagement metrics and flag accounts at risk of churn.",
        prompt: "Weekly: calculate health scores for all customers. Flag accounts with declining usage for CSM outreach.",
      },
    ],
  },
];

export default function UseCasesPage() {
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

        {/* ── Hero ── */}
        <section className="relative items-stretch bg-stone-50 dark:bg-[#1A1918] flex flex-col justify-center">
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="text-center max-w-[720px] mx-auto">
              <div className="text-[13px] font-medium text-[#D97757] mb-6 tracking-widest uppercase">
                Use Cases
              </div>
              <h1 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[37.375px] leading-[1.1] md:text-6xl mb-[32px] md:mb-[38px]">
                What will you build?
              </h1>
              <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] mb-10 max-w-[560px] mx-auto">
                2Hands agents can handle virtually any repeatable workflow. Here are real examples from our customers — copy the prompts and adapt them to your needs.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
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

        {/* ── Use case categories ── */}
        <section className="relative flex flex-col bg-white dark:bg-[#2C2B27]">
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="flex flex-col gap-0">
              {useCases.map((category, ci) => (
                <div key={ci} className="py-14 md:py-16 border-t border-stone-200 dark:border-[#3A3935]">
                  <div className="mb-12">
                    <div className="text-[13px] font-medium text-[#D97757] mb-4 tracking-widest uppercase">
                      {category.category}
                    </div>
                    <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[24px] md:text-[28px] leading-[1.2]">
                      {category.category}
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                    {category.items.map((item, ii) => (
                      <div
                        key={ii}
                        className="bg-neutral-50 dark:bg-[#2C2B27] border border-stone-200 dark:border-[#3A3935] rounded-2xl p-7 md:p-8 flex flex-col"
                      >
                        <h3 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[18px] md:text-[20px] leading-[1.3] mb-3">
                          {item.title}
                        </h3>
                        <p className="text-zinc-500 dark:text-[#9E9C99] text-[14px] leading-[1.7] mb-6 flex-1">
                          {item.description}
                        </p>
                        <div className="bg-white dark:bg-[#1E1D1B] border border-stone-200 dark:border-[#3A3935] rounded-xl p-4">
                          <div className="text-[11px] font-medium text-zinc-400 dark:text-[#6B6966] mb-2 tracking-widest uppercase">
                            Example prompt
                          </div>
                          <p className="text-neutral-700 dark:text-[#C8C6C3] text-[13px] leading-[1.6] font-mono">
                            &ldquo;{item.prompt}&rdquo;
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        {/* ── Mission Mode CTA ── */}
        <section className="relative items-stretch bg-stone-50 dark:bg-[#1A1918] flex flex-col justify-center">
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-20 items-center">
              <div>
                <div className="text-[13px] font-medium text-[#D97757] mb-6 tracking-widest uppercase">
                  Mission Mode
                </div>
                <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-[1.2] md:text-[40px] mb-6">
                  Set it once.<br />Ship forever.
                </h2>
                <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] mb-8">
                  Every use case above can run as a one-time task or a continuous Mission. Set your goal, define the cadence, and let agents work autonomously — researching, writing, monitoring, and reporting — while you focus on strategy.
                </p>
                <div className="flex flex-col gap-4">
                  {[
                    { title: "Recurring research", body: "Weekly competitive intel. Monthly market sizing. Daily news monitoring." },
                    { title: "Continuous outreach", body: "Always-on prospecting. Evergreen content. Persistent pipeline building." },
                    { title: "Background operations", body: "24/7 monitoring. Real-time alerts. Automatic data sync." },
                  ].map((item, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#D97757] mt-[10px] shrink-0"></div>
                      <div>
                        <div className="text-[15px] font-medium text-neutral-900 dark:text-[#F5F3F0] mb-1">{item.title}</div>
                        <div className="text-zinc-500 dark:text-[#9E9C99] text-[14px] leading-[1.6]">{item.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white dark:bg-[#2C2B27] border border-stone-200 dark:border-[#3A3935] rounded-2xl p-8 md:p-10">
                <div className="text-[13px] font-medium text-zinc-400 dark:text-[#9E9C99] mb-4 font-mono">
                  Mission Lifecycle
                </div>
                <div className="space-y-4">
                  {[
                    { step: "1", title: "Define your goal", desc: "Describe what you want in plain language" },
                    { step: "2", title: "AI plans the approach", desc: "Agents break it into tasks and assign specialists" },
                    { step: "3", title: "Autonomous execution", desc: "Agents run 24/7, adapting as context builds" },
                    { step: "4", title: "Results delivered", desc: "Check progress anytime or wait for completion" },
                  ].map((row, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="w-6 h-6 rounded-full bg-stone-100 dark:bg-[#3A3935] flex items-center justify-center text-[12px] font-medium text-zinc-600 dark:text-[#9E9C99] shrink-0">
                        {row.step}
                      </div>
                      <div>
                        <div className="text-[14px] font-medium text-neutral-900 dark:text-[#F5F3F0]">{row.title}</div>
                        <div className="text-[12px] text-zinc-400 dark:text-[#6B6966] mt-0.5">{row.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        {/* ── FAQ + CTA ── */}
        <CommonQuestions
          items={[
            {
              q: "Can I combine multiple use cases?",
              a: "Absolutely. A single Mission can chain together research, writing, outreach, and reporting. For example: research competitors → draft positioning doc → share to Slack → schedule follow-up research next month.",
            },
            {
              q: "How do I adapt these prompts to my needs?",
              a: "Just change the specifics. Replace company names, metrics, thresholds, and tools with your own. The structure — monitor X, research Y, draft Z, send to channel — works across virtually any workflow.",
            },
            {
              q: "What if I need a use case not listed here?",
              a: "These are starting points, not limits. Describe your workflow in natural language and 2Hands will figure out how to execute it. Custom integrations via OpenAPI spec let you connect any proprietary system.",
            },
            {
              q: "How does Mission Mode handle ongoing work?",
              a: "Set a recurring cadence — hourly, daily, weekly — and the Mission runs continuously. The AI learns from each cycle, improving its approach as it builds context about your business.",
            },
            {
              q: "Can I monitor what agents are doing?",
              a: "Yes. Full audit trails show every tool call, every decision, and every output. You can watch real-time progress or review historical runs. High-stakes actions can require your approval before executing.",
            },
            {
              q: "What integrations are supported?",
              a: "Slack, Gmail, Outlook, HubSpot, Salesforce, Notion, Google Workspace, Shopify, Discord, OpenAI, Perplexity, and more. Plus custom APIs via OpenAPI spec for your internal tools.",
            },
          ]}
          ctaTitle="Ready to automate your first workflow?"
          ctaButtonText="Try 2Hands for free"
          ctaButtonUrl="/sign-in"
        />

      </main>
      <Footer />
    </div>
  );
}
