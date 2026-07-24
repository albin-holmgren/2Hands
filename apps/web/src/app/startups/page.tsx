import { Metadata } from "next";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { CommonQuestions } from "@/components/marketing/CommonQuestions";

export const metadata: Metadata = {
  title: "2Hands for Startups — Ship at the Speed of a Full Team",
  description:
    "2Hands gives founders an autonomous AI workforce. Agents handle research, outreach, content, and ops — so you can focus on what only you can do.",
  keywords: ["AI for startups", "startup automation", "AI agents for founders", "autonomous AI", "Mission Mode"],
};

const useCases = [
  {
    label: "Competitive intelligence",
    title: "Always know what your competitors are doing",
    description:
      "Brief a Research agent to track competitor pricing pages, monitor product update blogs, and watch review sites. It delivers a weekly briefing to your Slack — automatically.",
    agents: ["Research agent", "Monitoring agent", "Slack report"],
    mission: "Track our top 5 competitors and deliver a weekly summary every Monday.",
  },
  {
    label: "Sales outreach",
    title: "Build real pipeline without a sales team",
    description:
      "Connect HubSpot and Gmail. Agents research target accounts, write personalised outreach, and queue drafts for your approval. You review and send — the legwork is done.",
    agents: ["Research agent", "Writing agent", "HubSpot sync"],
    mission: "Find 20 warm leads in our ICP this week and draft personalised intro emails.",
  },
  {
    label: "Content engine",
    title: "Grow your SEO presence on autopilot",
    description:
      "Set a content mission with your target keywords and tone. Agents research topics, draft posts, and publish to your CMS — giving you a consistent content output without a content manager.",
    agents: ["Research agent", "Writing agent", "Publishing agent"],
    mission: "Publish 3 SEO blog posts per week targeting our top 10 keywords.",
  },
];

const benefits = [
  {
    label: "Speed",
    title: "Go from idea to execution in minutes",
    description:
      "Stop context-switching between research, writing, and follow-up. Brief an agent in plain language and get results back within the hour.",
  },
  {
    label: "Leverage",
    title: "Output of a team. Headcount of two.",
    description:
      "Agents work 24/7 without fatigue, holidays, or slack in the system. Run 10 workstreams in parallel without adding a single hire.",
  },
  {
    label: "Focus",
    title: "Only do what only you can do",
    description:
      "Founders are expensive. Every hour spent on reporting, research, or scheduling is an hour not spent on product, customers, or fundraising.",
  },
  {
    label: "Mission Mode",
    title: "Set long-term goals, not just tasks",
    description:
      "Mission Mode lets you delegate entire workstreams — not just one-off tasks. The AI plans, delegates to agents, and ships progress every hour, autonomously.",
  },
  {
    label: "Integrations",
    title: "Works with your existing stack",
    description:
      "Connect Slack, Gmail, HubSpot, Notion, Google Sheets, and more. Agents act on live data from tools you already use — no migration, no disruption.",
  },
  {
    label: "Control",
    title: "You approve anything high-stakes",
    description:
      "Before sending emails, publishing content, or updating records — agents pause for your sign-off. Full control without having to do the work yourself.",
  },
];

export default function StartupsPage() {
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
            <div className="max-w-[700px]">
              <div className="text-[13px] font-medium text-[#D97757] mb-6 tracking-widest uppercase">
                For Startups
              </div>
              <h1 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[37.375px] leading-[1.1] md:text-6xl mb-[32px] md:mb-[38px]">
                Ship at the speed of a team ten times your size
              </h1>
              <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] mb-10 max-w-[540px]">
                2Hands gives every founder an autonomous AI workforce. Agents handle research, outreach, reporting, and content — so you stay focused on what only you can do.
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

        {/* ── Stat strip ── */}
        <section className="relative flex flex-col bg-white dark:bg-[#2C2B27]">
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto py-12 md:py-16">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-stone-200 dark:bg-[#3A3935] rounded-2xl overflow-hidden border border-stone-200 dark:border-[#3A3935]">
              {[
                { stat: "24 / 7", label: "Agents work while you sleep" },
                { stat: "10+", label: "Integrations with your existing stack" },
                { stat: "1 prompt", label: "Kicks off an entire workstream" },
              ].map(({ stat, label }) => (
                <div key={stat} className="bg-white dark:bg-[#1E1D1B] px-8 py-10">
                  <div className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[36px] md:text-[44px] leading-none mb-2">
                    {stat}
                  </div>
                  <div className="text-zinc-500 dark:text-[#9E9C99] text-[14px] leading-[1.6]">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Use cases ── */}
        <section className="relative flex flex-col bg-white dark:bg-[#2C2B27]">
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="max-w-[600px] mb-16 md:mb-20">
              <div className="text-[13px] font-medium text-[#D97757] mb-6 tracking-widest uppercase">
                What founders use it for
              </div>
              <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-[1.2] md:text-[40px]">
                Real work, done autonomously
              </h2>
            </div>
            <div className="flex flex-col gap-0">
              {useCases.map((uc, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24 items-start py-14 md:py-16 border-t border-stone-200 dark:border-[#3A3935]"
                >
                  <div>
                    <div className="text-[13px] font-medium text-[#D97757] mb-5 tracking-widest uppercase">
                      {uc.label}
                    </div>
                    <h3 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[22px] md:text-[26px] leading-[1.25] mb-5">
                      {uc.title}
                    </h3>
                    <p className="text-zinc-500 dark:text-[#9E9C99] text-[16px] leading-[1.7]">
                      {uc.description}
                    </p>
                  </div>
                  <div className="bg-stone-50 dark:bg-[#1E1D1B] border border-stone-200 dark:border-[#3A3935] rounded-2xl p-7 md:p-8">
                    <div className="text-[12px] font-medium text-zinc-400 dark:text-[#6B6966] mb-4 tracking-widest uppercase">
                      Example mission
                    </div>
                    <p className="text-neutral-800 dark:text-[#C8C6C3] text-[15px] leading-[1.75] font-mono mb-6">
                      &ldquo;{uc.mission}&rdquo;
                    </p>
                    <div className="pt-5 border-t border-stone-200 dark:border-[#3A3935]">
                      <div className="text-[12px] font-medium text-zinc-400 dark:text-[#6B6966] mb-3 tracking-widest uppercase">
                        Agents spawned
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {uc.agents.map((agent) => (
                          <span
                            key={agent}
                            className="text-[12px] font-medium text-zinc-600 dark:text-[#9E9C99] bg-stone-100 dark:bg-[#2A2927] border border-stone-200 dark:border-[#3A3935] rounded-full px-3 py-1"
                          >
                            {agent}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        {/* ── Mission Mode spotlight ── */}
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
                  Delegate a goal,<br />not just a task
                </h2>
                <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] mb-8">
                  Most AI tools handle one-off requests. Mission Mode handles entire workstreams. Set a goal once — the AI plans the steps, spawns the right agents, and ships progress every hour while you focus on building.
                </p>
                <div className="flex flex-col gap-4 mb-10">
                  {[
                    { title: "Autonomous planning", body: "The AI breaks your goal into agent tasks and adapts the plan as work progresses and context builds." },
                    { title: "Runs in the background", body: "Missions tick every hour without you watching. Check in when you want to — or wait for the result." },
                    { title: "Full transparency", body: "Every agent action is logged. You see exactly what ran, what shipped, and what's next." },
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
                <div className="relative inline-flex text-stone-50 bg-neutral-900 dark:text-neutral-900 dark:bg-white text-[17px] items-center caret-transparent justify-center leading-[17px] min-h-10 text-center align-middle px-6 py-2.5 rounded-[8.5px] shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px]">
                  <div className="relative font-medium z-[1] px-2">Try Mission Mode</div>
                  <div className="absolute h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                    <a href="/sign-in" className="absolute block h-full max-w-full outline-offset-4 w-full rounded-[8.5px] inset-[0%]"></a>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-[#2C2B27] border border-stone-200 dark:border-[#3A3935] rounded-2xl p-8 md:p-10">
                <div className="text-[13px] font-medium text-zinc-400 dark:text-[#9E9C99] mb-4 font-mono">
                  Active Mission
                </div>
                <div className="bg-neutral-50 dark:bg-[#1A1918] border border-stone-200 dark:border-[#3A3935] rounded-xl p-5 mb-6 text-[15px] text-neutral-700 dark:text-[#C8C6C3] leading-[1.6]">
                  Build a full outbound pipeline this quarter: find ideal customers, research each account, draft personalised emails, and track open rates in HubSpot.
                </div>
                <div className="space-y-4">
                  {[
                    { agent: "ICP research agent", status: "Identified 47 matching companies", done: true },
                    { agent: "Account research agent", status: "Profiled 47 accounts — LinkedIn, news, recent hires", done: true },
                    { agent: "Copywriting agent", status: "Drafting personalised intros...", active: true },
                    { agent: "HubSpot sync agent", status: "Queued — awaiting email drafts" },
                  ].map((row, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-[6px] shrink-0 ${row.active ? "bg-[#D97757]" : row.done ? "bg-stone-300 dark:bg-[#4A4845]" : "bg-stone-200 dark:bg-[#3A3935]"}`} />
                      <div>
                        <div className={`text-[13px] font-medium ${row.active ? "text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-[#C8C6C3]"}`}>
                          {row.agent}
                        </div>
                        <div className={`text-[12px] mt-0.5 ${row.active ? "text-[#D97757]" : "text-zinc-400 dark:text-[#6B6966]"}`}>
                          {row.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        {/* ── Benefits grid ── */}
        <section className="relative flex flex-col bg-white dark:bg-[#2C2B27]">
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="text-center max-w-[600px] mx-auto mb-16 md:mb-20">
              <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-[1.2] md:text-[40px]">
                Why startups choose 2Hands
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
              {benefits.map((b, i) => (
                <div
                  key={i}
                  className="bg-neutral-50 dark:bg-[#2C2B27] border border-stone-200 dark:border-[#3A3935] rounded-2xl p-8 md:p-10"
                >
                  <div className="text-[13px] font-medium text-[#D97757] mb-4 tracking-widest uppercase">
                    {b.label}
                  </div>
                  <h3 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[20px] leading-[1.3] md:text-[22px] mb-4">
                    {b.title}
                  </h3>
                  <p className="text-zinc-500 dark:text-[#9E9C99] text-[15px] leading-[1.7]">
                    {b.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        {/* ── FAQ + CTA ── */}
        <CommonQuestions
          items={[
            {
              q: "Is 2Hands only for technical founders?",
              a: "No — describe what you need in plain language and agents handle the rest. You don't write code or prompts. If you can brief a junior employee, you can use 2Hands.",
            },
            {
              q: "How is this different from hiring a VA or using ChatGPT?",
              a: "A VA works a few hours a day and needs managing. ChatGPT answers questions but doesn't take action. 2Hands agents work 24/7, connect to your real tools, and complete multi-step tasks autonomously — with no supervision required.",
            },
            {
              q: "What does Mission Mode actually do?",
              a: "Mission Mode lets you set a long-term goal — like 'grow our outbound pipeline this quarter'. The AI plans the approach, breaks it into agent tasks, and ships progress every hour. It's delegation at the workstream level, not the task level.",
            },
            {
              q: "How quickly can I get started?",
              a: "You can have your first agent running in under five minutes. Connect a tool, describe what you want, and 2Hands handles the rest. No onboarding calls, no setup fee.",
            },
            {
              q: "Which integrations are included?",
              a: "Slack, Gmail, Outlook, HubSpot, Notion, Google Sheets, Google Calendar, Shopify, Discord, OpenAI, Perplexity, ElevenLabs, and Firecrawl — with more added regularly. You can also connect any internal API via OpenAPI spec.",
            },
            {
              q: "Is my data safe?",
              a: "Yes. Agents only access the tools you explicitly connect. High-stakes actions — sending emails, updating records — pause for your approval. All credentials are encrypted at rest and your data never trains our models.",
            },
          ]}
          ctaTitle="Your AI workforce is ready. Are you?"
          ctaButtonText="Try 2Hands for free"
          ctaButtonUrl="/sign-in"
        />

      </main>
      <Footer />
    </div>
  );
}
