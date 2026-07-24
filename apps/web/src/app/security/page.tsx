import { Metadata } from "next";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { CommonQuestions } from "@/components/marketing/CommonQuestions";

export const metadata: Metadata = {
  title: "Security - How 2Hands keeps your data safe",
  description: "How 2Hands handles credential encryption, agent permissions, approval workflows, and data isolation.",
  keywords: ["AI security", "agent permissions", "data privacy", "credential encryption"],
};

const pillars = [
  {
    number: "01",
    title: "Credential encryption",
    body: "Integration credentials you connect are encrypted with AES-256-GCM before being stored. Keys are never stored alongside the data they protect. Agents never see your raw credentials — they receive only the access tokens needed to complete their task.",
  },
  {
    number: "02",
    title: "Scoped agent permissions",
    body: "Each agent is given access only to the specific integrations and tools you explicitly connect to it. An agent running a research task has no access to your email. An outreach agent has no access to your codebase. Scope is set by you, not inferred by the system.",
  },
  {
    number: "03",
    title: "Approval before high-stakes actions",
    body: "Agents that are about to send an email, modify a file, or take any action you've flagged as sensitive will pause and ask for your confirmation first. You approve or reject directly from Slack or the 2Hands app. Nothing happens without your sign-off.",
  },
  {
    number: "04",
    title: "Activity logging",
    body: "Every action an agent takes is logged — what it did, when, and what the outcome was. You can review any agent's activity from the dashboard at any time. Logs are retained so you can trace exactly what happened on any given run.",
  },
  {
    number: "05",
    title: "Workspace isolation",
    body: "Your workspace data is fully isolated from other workspaces. There is no shared state or data between teams. Agents, missions, and results are scoped to your workspace only.",
  },
  {
    number: "06",
    title: "Your data is never used for training",
    body: "We do not use your tasks, agent outputs, credentials, or any workspace data to train AI models — ours or anyone else's. Your data is used only to run the work you assign.",
  },
];

const faqItems = [
  {
    q: "Can agents access integrations I haven't connected?",
    a: "No. Each agent only has access to integrations you explicitly assign to it during setup. Other integrations in your workspace are not visible to agents that weren't given access.",
  },
  {
    q: "What exactly is stored when I connect an integration?",
    a: "OAuth tokens or API keys you authorize are encrypted and stored. The raw credential is never logged or exposed to the agent directly — the agent uses it only at the moment it needs to take an action.",
  },
  {
    q: "How do I control which actions require my approval?",
    a: "When setting up an agent you can flag specific action types — like sending emails or posting to Slack — as requiring confirmation. The agent will always pause before those actions and wait for your response.",
  },
  {
    q: "Is my data used to train 2Hands AI models?",
    a: "No. Your workspace data — tasks, outputs, credentials, agent history — is never used to train any AI model.",
  },
  {
    q: "Who at 2Hands can access my data?",
    a: "Access to customer data is strictly limited to situations where it's required to diagnose a technical issue you've reported, and only with your consent. We don't browse customer workspaces.",
  },
];

export default function SecurityPage() {
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

        {/* Hero — left-aligned, editorial style */}
        <section className="relative items-stretch bg-stone-50 dark:bg-[#1A1918] flex flex-col justify-center">
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="max-w-[640px]">
              <div className="text-[13px] font-medium text-[#D97757] mb-6 tracking-widest uppercase">
                Security &amp; privacy
              </div>
              <div className="mb-[32px] md:mb-[38px]">
                <h1 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[37.375px] leading-[1.1] md:text-6xl">
                  How we keep<br />your data safe
                </h1>
              </div>
              <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65]">
                This page explains what we actually do — not what we aspire to. We describe the security measures that are built and running today.
              </p>
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        {/* Pillars — numbered list layout, not cards */}
        <section className="relative items-stretch bg-white dark:bg-[#2C2B27] flex flex-col justify-center">
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto w-full">
            <div className="max-w-[800px]">
              {pillars.map((item) => (
                <div key={item.number} className="flex gap-8 md:gap-16 py-10 border-b border-stone-200 dark:border-[#3A3935] last:border-0">
                  <div className="text-[13px] font-medium text-zinc-300 dark:text-[#4A4845] tracking-widest shrink-0 w-8 pt-1">
                    {item.number}
                  </div>
                  <div>
                    <h3 className="text-[18px] font-medium text-neutral-900 dark:text-[#F5F3F0] mb-3 font-display">
                      {item.title}
                    </h3>
                    <p className="text-zinc-500 dark:text-[#9E9C99] text-[15px] leading-[1.75]">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        <CommonQuestions
          items={faqItems}
          ctaTitle="Questions about how we handle your data?"
          ctaButtonText="Get in touch"
          ctaButtonUrl="mailto:hello@2hands.ai"
        />

      </main>
      <Footer />
    </div>
  );
}
