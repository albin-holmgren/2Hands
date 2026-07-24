import { Metadata } from "next";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { CommonQuestions } from "@/components/marketing/CommonQuestions";

export const metadata: Metadata = {
  title: "2Hands for Enterprises — AI Agents Across Every Department",
  description:
    "Deploy autonomous AI agents across sales, marketing, ops, and support. Full audit trails, approval gates, and scoped permissions — your teams stay in control.",
  keywords: ["AI for enterprises", "enterprise automation", "AI workforce", "autonomous agents for business"],
};

const departments = [
  {
    label: "Sales",
    title: "Autonomous pipeline generation",
    description:
      "Agents research accounts, enrich HubSpot data, draft personalised outreach, and queue follow-ups — all while your reps focus on closing.",
    mission: "Research 50 target accounts, enrich HubSpot records, and draft personalised first-touch emails ready for rep review.",
    agents: ["Research agent", "HubSpot sync agent", "Outreach writer", "Scheduler agent"],
  },
  {
    label: "Marketing",
    title: "Always-on research and content",
    description:
      "Monitor competitor moves, track industry news, draft SEO content, and brief campaigns — continuously, without a 24/7 team.",
    mission: "Monitor 15 competitor websites weekly, summarise pricing changes, and post a Friday briefing to #marketing in Slack.",
    agents: ["Web monitor agent", "Research agent", "Writing agent", "Slack notifier"],
  },
  {
    label: "Operations",
    title: "Automated data flows and reporting",
    description:
      "Agents pull data from multiple systems, generate reports, flag anomalies in Slack, and keep spreadsheets current — no manual wrangling.",
    mission: "Pull daily metrics from our tools, build a Google Sheets dashboard, and alert ops team if any KPI drops below threshold.",
    agents: ["Data sync agent", "Sheets agent", "Alert agent", "Report writer"],
  },
  {
    label: "Support",
    title: "Faster triage and first response",
    description:
      "Read incoming tickets, classify urgency, draft first responses for rep review, and surface the right context — cutting time-to-response while maintaining quality.",
    mission: "Read new support tickets, classify priority, draft a first response, and flag anything requiring specialist escalation.",
    agents: ["Triage agent", "Writing agent", "Escalation agent", "HubSpot update"],
  },
];

const controlFeatures = [
  {
    label: "Approval gates",
    title: "Agents pause before high-stakes actions",
    description:
      "Configure exactly which actions need human sign-off. Before sending emails, updating records, or posting to channels — the agent stops and waits for your approval via Slack or the app.",
  },
  {
    label: "Audit logs",
    title: "Every action logged with full context",
    description:
      "Every tool call, decision, and output is recorded with timestamps. See exactly what each agent did, what data it accessed, and what it produced — searchable and exportable.",
  },
  {
    label: "Scoped permissions",
    title: "Agents only access what you connect",
    description:
      "Each integration uses the credentials and permissions you explicitly set. An agent working on sales outreach can't touch your ops data — permissions are scoped per task.",
  },
  {
    label: "Data privacy",
    title: "Your data is never used for model training",
    description:
      "Agent inputs, outputs, and tool results are used only to complete your task. Nothing is used to train or fine-tune any AI model.",
  },
];

const integrations = [
  { name: "Slack", category: "Communication" },
  { name: "Gmail", category: "Communication" },
  { name: "Outlook", category: "Communication" },
  { name: "Microsoft Teams", category: "Communication" },
  { name: "HubSpot", category: "CRM" },
  { name: "Notion", category: "Productivity" },
  { name: "Google Sheets", category: "Productivity" },
  { name: "Google Calendar", category: "Productivity" },
  { name: "Shopify", category: "E-commerce" },
  { name: "Discord", category: "Communication" },
  { name: "Firecrawl", category: "Data" },
  { name: "Perplexity", category: "Research" },
];

export default function EnterprisesPage() {
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
            <div className="max-w-[720px]">
              <div className="text-[13px] font-medium text-[#D97757] mb-6 tracking-widest uppercase">
                For Enterprises
              </div>
              <h1 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[37.375px] leading-[1.1] md:text-6xl mb-[32px] md:mb-[38px]">
                Deploy AI agents across every department
              </h1>
              <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] mb-10 max-w-[560px]">
                2Hands gives enterprises mission control for autonomous AI agents. Sales, marketing, ops, and support — every team gets an AI workforce with the visibility and oversight IT requires.
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

        {/* ── Honest metrics bar ── */}
        <section className="relative flex flex-col bg-white dark:bg-[#2C2B27]">
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full bottom-0"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto py-10 md:py-14">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x md:divide-stone-200 md:dark:divide-[#3A3935]">
              {[
                { stat: "12+", label: "Native integrations" },
                { stat: "24/7", label: "Agent availability" },
                { stat: "Full", label: "Audit trail on every action" },
                { stat: "0", label: "Data used to train models" },
              ].map(({ stat, label }) => (
                <div key={stat} className="md:px-8 first:pl-0 last:pr-0">
                  <div className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[32px] md:text-[38px] leading-none mb-1.5">
                    {stat}
                  </div>
                  <div className="text-zinc-500 dark:text-[#9E9C99] text-[13px] leading-[1.5]">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Department use cases — 2×2 grid ── */}
        <section className="relative flex flex-col bg-white dark:bg-[#2C2B27]">
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="max-w-[560px] mb-16 md:mb-20">
              <div className="text-[13px] font-medium text-[#D97757] mb-5 tracking-widest uppercase">
                Department coverage
              </div>
              <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-[1.2] md:text-[40px]">
                Every team gets an AI workforce
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-stone-200 dark:bg-[#3A3935] rounded-2xl overflow-hidden border border-stone-200 dark:border-[#3A3935]">
              {departments.map((dept, i) => (
                <div key={i} className="bg-white dark:bg-[#1E1D1B] p-8 md:p-10">
                  <div className="text-[13px] font-medium text-[#D97757] mb-4 tracking-widest uppercase">
                    {dept.label}
                  </div>
                  <h3 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[20px] leading-[1.3] md:text-[22px] mb-4">
                    {dept.title}
                  </h3>
                  <p className="text-zinc-500 dark:text-[#9E9C99] text-[15px] leading-[1.7] mb-6">
                    {dept.description}
                  </p>
                  <div className="bg-stone-50 dark:bg-[#2A2927] rounded-xl p-4">
                    <div className="text-[11px] font-medium text-zinc-400 dark:text-[#6B6966] mb-2 tracking-widest uppercase">
                      Example mission
                    </div>
                    <p className="text-neutral-700 dark:text-[#C8C6C3] text-[13px] leading-[1.65] font-mono">
                      &ldquo;{dept.mission}&rdquo;
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {dept.agents.map((agent) => (
                      <span
                        key={agent}
                        className="text-[11px] font-medium text-zinc-600 dark:text-[#9E9C99] bg-stone-100 dark:bg-[#2A2927] border border-stone-200 dark:border-[#3A3935] rounded-full px-2.5 py-0.5"
                      >
                        {agent}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        {/* ── You stay in control ── */}
        <section className="relative items-stretch bg-stone-50 dark:bg-[#1A1918] flex flex-col justify-center">
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">

            <div className="max-w-[560px] mb-16 md:mb-20">
              <div className="text-[13px] font-medium text-[#D97757] mb-5 tracking-widest uppercase">
                Governance
              </div>
              <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-[1.2] md:text-[40px]">
                Powerful agents.<br />You stay in control.
              </h2>
            </div>

            {/* Approval gate flow diagram */}
            <div className="mb-16 md:mb-20">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-0">
                {[
                  { step: "Agent runs", detail: "Executing its assigned task" },
                  { step: "Hits a gate", detail: "Configured action requires approval" },
                  { step: "You're notified", detail: "Via Slack or the 2Hands app" },
                  { step: "Approve or edit", detail: "One click — or modify before approving" },
                  { step: "Agent continues", detail: "Proceeds with the approved action" },
                ].map((item, i, arr) => (
                  <div key={i} className="flex items-center gap-0 flex-1 w-full md:w-auto">
                    <div className="flex flex-col items-start md:items-center flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-medium mb-3 ${i === 1 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50" : i === 3 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50" : "bg-stone-100 dark:bg-[#2A2927] text-zinc-600 dark:text-[#9E9C99] border border-stone-200 dark:border-[#3A3935]"}`}>
                        {i + 1}
                      </div>
                      <div className="text-[14px] font-medium text-neutral-900 dark:text-[#F5F3F0] md:text-center">{item.step}</div>
                      <div className="text-[12px] text-zinc-400 dark:text-[#6B6966] mt-1 md:text-center max-w-[120px]">{item.detail}</div>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="hidden md:block w-8 shrink-0 text-center text-zinc-300 dark:text-[#3A3935] text-[18px]">→</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Control features list */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
              {controlFeatures.map((f, i) => (
                <div key={i} className="flex gap-6">
                  <div className="w-0.5 bg-[#D97757]/30 shrink-0 rounded-full"></div>
                  <div>
                    <div className="text-[12px] font-medium text-[#D97757] mb-2 tracking-widest uppercase">{f.label}</div>
                    <h3 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[17px] leading-[1.35] mb-2">{f.title}</h3>
                    <p className="text-zinc-500 dark:text-[#9E9C99] text-[14px] leading-[1.7]">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        {/* ── Integrations your teams already use ── */}
        <section className="relative flex flex-col bg-white dark:bg-[#2C2B27]">
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-start">
              <div>
                <div className="text-[13px] font-medium text-[#D97757] mb-5 tracking-widest uppercase">Integrations</div>
                <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-[1.2] md:text-[36px] mb-6">
                  Works with the tools your teams already use
                </h2>
                <p className="text-zinc-500 dark:text-[#9E9C99] text-[16px] leading-[1.7] mb-6">
                  Native integrations with communication, productivity, and CRM tools. For internal or proprietary systems, connect any API with our OpenAPI spec importer — no engineering required.
                </p>
                <div className="text-[14px] font-medium text-neutral-900 dark:text-[#F5F3F0]">
                  + Any custom API via OpenAPI spec
                </div>
              </div>
              <div>
                <div className="flex flex-col gap-0 border border-stone-200 dark:border-[#3A3935] rounded-2xl overflow-hidden">
                  {integrations.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100 dark:border-[#2A2927] last:border-0 bg-white dark:bg-[#1E1D1B]">
                      <span className="text-[14px] font-medium text-neutral-900 dark:text-[#F5F3F0]">{item.name}</span>
                      <span className="text-[11px] text-zinc-400 dark:text-[#6B6966] uppercase tracking-wider">{item.category}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        {/* ── FAQ ── */}
        <CommonQuestions
          title={"Enterprise\nquestions"}
          items={[
            {
              q: "How does 2Hands integrate with our existing systems?",
              a: "Connect via native integrations for HubSpot, Slack, Gmail, Outlook, Microsoft Teams, Notion, Google Workspace, Shopify, and more. For internal or proprietary systems, use our OpenAPI connector — paste a spec and agents can use it immediately.",
            },
            {
              q: "Is our data secure and private?",
              a: "Agents only access the tools and data you explicitly connect using credentials you provide. Each integration uses scoped permissions. Your data is never used to train or fine-tune any AI model.",
            },
            {
              q: "How do approval gates work?",
              a: "Configure which action types require human sign-off. When an agent reaches a gated action — like sending an email, posting to a channel, or updating a record — it pauses and notifies you in Slack or the app. You approve, reject, or edit before the agent proceeds.",
            },
            {
              q: "Can we see everything agents have done?",
              a: "Every agent action is logged: what tool was called, what data was passed, what the output was, and when it happened. You can review any agent run in full detail.",
            },
            {
              q: "How does pricing work for larger teams?",
              a: "Plans are based on credit usage, not per-seat licensing. Teams and departments share a credit pool, and you can add credit packs as needed. See the pricing page for current plan details.",
            },
            {
              q: "Do you support custom integrations?",
              a: "Yes. Paste any OpenAPI spec and 2Hands generates the integration automatically. Your agents can then call your internal APIs just like any native integration.",
            },
          ]}
          ctaTitle="Ready to deploy agents across your organisation?"
          ctaButtonText="Try 2Hands for free"
          ctaButtonUrl="/sign-in"
        />

      </main>
      <Footer />
    </div>
  );
}
