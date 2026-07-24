import { Metadata } from "next";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { Section } from "@/components/marketing/Section";
import { CommonQuestions } from "@/components/marketing/CommonQuestions";

export const metadata: Metadata = {
  title: "Features - Autonomous AI Agent Platform with Mission Mode",
  description: "2Hands gives you autonomous AI agents and Mission Mode — set long-term goals and let the AI work in the background, every hour, without you lifting a finger.",
  keywords: ["AI agent features", "Mission Mode", "autonomous AI", "AI workforce", "task automation"],
};

const features = [
  {
    label: "Mission Mode",
    title: "Set a goal. Ship results.",
    description: "Give the AI a long-term objective. It plans, delegates to specialist agents, and ships results every hour — autonomously, in the background. No prompting required.",
  },
  {
    label: "AI Agents",
    title: "Specialists built to execute",
    description: "Deploy research, outreach, coding, SEO, and data agents. They run 24/7 without hand-holding — picking up tasks, running them to completion, and reporting back.",
  },
  {
    label: "Web Automation",
    title: "Browse, extract, interact",
    description: "Agents navigate real websites, fill forms, scrape structured data, and interact with any web app — just like a human, but at scale and without fatigue.",
  },
  {
    label: "Integrations",
    title: "Works with your stack",
    description: "Connect Slack, GitHub, Notion, Google Workspace, Salesforce, and 100+ more. Agents act on live data from tools your team already uses.",
  },
  {
    label: "Approval Workflow",
    title: "You stay in control",
    description: "High-stakes actions pause for review. Before sending emails, making purchases, or modifying files — agents ask. You approve directly from Slack or the app.",
  },
  {
    label: "Smart Scheduling",
    title: "Any cadence, any trigger",
    description: "Set agents and missions to run hourly, daily, or on event triggers. The AI adapts its pace based on progress, context, and goal proximity.",
  },
];

export default function FeaturesPage() {
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
      <main className="text-[19.0491px] box-border caret-transparent flex basis-[0%] flex-col grow leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">

        {/* Hero */}
        <section className="relative text-[19.0491px] items-stretch bg-stone-50 dark:bg-[#1A1918] box-border caret-transparent flex flex-col justify-center leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
          <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
          <div className="text-[19.0491px] box-border caret-transparent basis-[0%] grow leading-[30.4786px] max-w-[1440px] w-[calc(100%_-_67.1429px)] z-[1] mx-auto md:text-[19.8571px] md:leading-[31.7714px] md:w-[calc(100%_-_118.857px)]">
            <div className="text-center max-w-[800px] mx-auto">
              <div className="text-[13px] font-medium text-[#D97757] mb-6 tracking-widest uppercase">
                Platform features
              </div>
              <div className="min-w-full mb-[32px] md:mb-[38px]">
                <h1 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[37.375px] leading-[1.1] md:text-6xl">
                  Every tool your AI<br />needs to execute
                </h1>
              </div>
              <div className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] max-w-[580px] mx-auto mb-10">
                <p>
                  From one-off agent tasks to months-long autonomous missions — 2Hands gives your AI a memory, a goal, and the tools to get real work done.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <div className="relative text-stone-50 bg-neutral-900 dark:text-neutral-900 dark:bg-white text-[17px] items-center caret-transparent flex justify-center leading-[17px] min-h-10 text-center align-middle px-6 py-2.5 rounded-[8.5px] shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px] dark:shadow-[rgb(200,200,200)_0px_0px_0px_0px,rgb(150,150,150)_0px_0px_0px_1px]">
                  <div className="relative font-medium box-border caret-transparent flow-root z-[1] px-2">
                    Try 2Hands for free
                  </div>
                  <div className="absolute box-border caret-transparent h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                    <a href="/sign-in" className="absolute box-border caret-transparent block h-full max-w-full outline-offset-4 w-full rounded-[8.5px] inset-[0%]"></a>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
        </section>

        {/* Features grid */}
        <section className="relative text-[19.0491px] items-stretch bg-white dark:bg-[#2C2B27] box-border caret-transparent flex flex-col justify-center leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
          <div className="absolute text-[19.0491px] bg-stone-200 dark:bg-[#3A3935] box-border caret-transparent h-px leading-[30.4786px] w-full top-[0%] inset-x-[0%] md:text-[19.8571px] md:leading-[31.7714px]"></div>
          <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
          <div className="text-[19.0491px] box-border caret-transparent basis-[0%] grow leading-[30.4786px] max-w-[1440px] w-[calc(100%_-_67.1429px)] z-[1] mx-auto md:text-[19.8571px] md:leading-[31.7714px] md:w-[calc(100%_-_118.857px)]">
            <div className="text-center mb-16 md:mb-20">
              <div className="min-w-full mb-6">
                <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-[1.2] md:text-[40px]">
                  Everything connected,<br />everything autonomous
                </h2>
              </div>
              <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] max-w-[600px] mx-auto">
                Agents feed missions. Missions spawn agents. Everything reports back to your AI Manager.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="bg-neutral-50 dark:bg-[#2C2B27] border border-stone-200 dark:border-[#3A3935] rounded-2xl p-8 md:p-10"
                >
                  <div className="text-[13px] font-medium text-[#D97757] mb-4 tracking-widest uppercase">
                    {feature.label}
                  </div>
                  <h3 className="text-[20px] font-medium text-neutral-900 dark:text-[#F5F3F0] leading-[1.3] font-display md:text-[22px] mb-4">
                    {feature.title}
                  </h3>
                  <p className="text-zinc-500 dark:text-[#9E9C99] text-[15px] leading-[1.7]">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
        </section>

        {/* Mission Mode spotlight */}
        <section className="relative text-[19.0491px] items-stretch bg-stone-50 dark:bg-[#1A1918] box-border caret-transparent flex flex-col justify-center leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
          <div className="absolute text-[19.0491px] bg-stone-200 dark:bg-[#3A3935] box-border caret-transparent h-px leading-[30.4786px] w-full top-[0%] inset-x-[0%] md:text-[19.8571px] md:leading-[31.7714px]"></div>
          <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
          <div className="text-[19.0491px] box-border caret-transparent basis-[0%] grow leading-[30.4786px] max-w-[1440px] w-[calc(100%_-_67.1429px)] z-[1] mx-auto md:text-[19.8571px] md:leading-[31.7714px] md:w-[calc(100%_-_118.857px)]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-20 items-center">
              <div>
                <div className="text-[13px] font-medium text-[#D97757] mb-6 tracking-widest uppercase">
                  Signature feature
                </div>
                <div className="mb-6">
                  <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-[1.2] md:text-[40px]">
                    Mission Mode
                  </h2>
                </div>
                <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] mb-8">
                  Set a long-term goal once. 2Hands plans the approach, delegates tasks to specialist agents, and ships results every hour — without you lifting a finger. As context builds, missions get smarter.
                </p>
                <div className="flex flex-col gap-4">
                  {[
                    { title: "Autonomous planning", body: "The AI breaks your goal into a sequence of agent tasks and adapts the plan as work progresses." },
                    { title: "Multi-agent coordination", body: "Missions spawn multiple specialist agents that work in parallel and feed results to each other." },
                    { title: "Hourly progress", body: "Results ship every tick cycle — you can check in anytime or just wait for the final deliverable." },
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
                <div className="mt-10">
                  <div className="relative inline-flex text-stone-50 bg-neutral-900 dark:text-neutral-900 dark:bg-white text-[17px] items-center caret-transparent justify-center leading-[17px] min-h-10 text-center align-middle px-6 py-2.5 rounded-[8.5px] shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px] dark:shadow-[rgb(200,200,200)_0px_0px_0px_0px,rgb(150,150,150)_0px_0px_0px_1px]">
                    <div className="relative font-medium z-[1] px-2">Try Mission Mode</div>
                    <div className="absolute h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                      <a href="/sign-in" className="absolute block h-full max-w-full outline-offset-4 w-full rounded-[8.5px] inset-[0%]"></a>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-[#2C2B27] border border-stone-200 dark:border-[#3A3935] rounded-2xl p-8 md:p-10">
                <div className="text-[13px] font-medium text-zinc-400 dark:text-[#9E9C99] mb-4 font-mono">Agent Mission</div>
                <div className="bg-neutral-50 dark:bg-[#1A1918] border border-stone-200 dark:border-[#3A3935] rounded-xl p-5 mb-6 text-[15px] text-neutral-700 dark:text-[#C8C6C3] leading-[1.6]">
                  Research our top 5 competitors, monitor their pricing pages weekly, draft a competitive positioning doc, and send a Slack summary every Monday morning.
                </div>
                <div className="space-y-3">
                  {[
                    { agent: "Research agent", status: "Completed 5 competitor profiles" },
                    { agent: "Monitoring agent", status: "Watching 5 URLs — next check in 6h" },
                    { agent: "Writing agent", status: "Drafting positioning doc...", active: true },
                    { agent: "Scheduler agent", status: "Slack report queued for Monday" },
                  ].map((row, i) => (
                    <div key={i}>
                      <div className={`text-[13px] font-medium ${row.active ? "text-neutral-900 dark:text-white" : "text-neutral-700 dark:text-[#C8C6C3]"}`}>{row.agent}</div>
                      <div className="text-[12px] text-zinc-400 dark:text-[#9E9C99]">{row.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
        </section>

        {/* Security section */}
        <Section
          variant="security"
          sectionContent={{
            variant: "security",
            contentGridVariant: "security",
            securityItems: [
              {
                icon: "",
                title: "You control what agents access",
                description: "Each agent connects only to the tools and data sources you explicitly authorize. No broad permissions, no surprise access — you define the scope for every agent.",
              },
              {
                icon: "",
                title: "Agents ask before acting",
                description: "Before sending emails, making purchases, or modifying files, your agents request confirmation. High-stakes actions pause until you approve them in Slack or the app.",
              },
              {
                icon: "",
                title: "Enterprise-grade encryption",
                description: "All credentials are encrypted with AES-256-GCM at rest. Full audit logs track every agent action. Your data never trains our models.",
              },
            ],
          }}
        />

        <CommonQuestions
          items={[
            {
              q: "What can 2Hands agents actually do?",
              a: "2Hands agents complete real work: research markets, draft emails, update CRMs, organize files, analyze data, monitor websites, and run multi-step workflows. They operate your browser, call APIs, and process documents — all without you watching.",
            },
            {
              q: "What is Mission Mode?",
              a: "Mission Mode lets you set a long-term goal rather than a single task. The AI plans the approach, breaks it into agent sub-tasks, and ships results every hour — autonomously. It's the difference between delegating a task and delegating an entire workstream.",
            },
            {
              q: "How is this different from ChatGPT?",
              a: "ChatGPT answers questions. 2Hands agents complete tasks. Instead of writing a draft for you to send, a 2Hands agent researches, writes, and sends the email. Instead of suggesting code, it opens your editor, writes, tests, and commits.",
            },
            {
              q: "Is my company data secure?",
              a: "Yes. Agents only access what you explicitly connect — each integration uses scoped permissions you control. Sensitive actions require your approval before executing. All agent activity is logged with full audit trails. Your data never trains our models.",
            },
            {
              q: "What tools integrate with 2Hands?",
              a: "Connect Slack, GitHub, Notion, Google Workspace, Salesforce, HubSpot, Linear, Figma, and more. Custom API integrations and webhooks let you connect proprietary systems.",
            },
            {
              q: "Do I need technical skills?",
              a: "No. Describe what you need in plain language — 'Find all overdue deals in Salesforce and email the sales team' — and 2Hands handles the rest. Anyone can delegate work effectively from day one.",
            },
          ]}
          ctaTitle="Ready to put your work on autopilot?"
          ctaButtonText="Try 2Hands for free"
          ctaButtonUrl="/sign-in"
        />

      </main>
      <Footer />
    </div>
  );
}
