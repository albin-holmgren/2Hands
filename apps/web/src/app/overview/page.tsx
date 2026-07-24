import { Metadata } from "next";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { CTABanner } from "@/components/marketing/CTABanner";
import { Section } from "@/components/marketing/Section";

export const metadata: Metadata = {
  title: "Platform Overview - See everything 2Hands can do | 2Hands",
  description:
    "2Hands is an autonomous AI agent platform. Deploy agents that research, automate, and deliver — while you focus on strategy.",
  keywords: [
    "AI agent platform",
    "autonomous AI",
    "AI workforce",
    "task automation",
    "AI overview",
  ],
};

const capabilities = [
  {
    title: "AI Manager",
    description:
      "Your central command. Chat naturally to delegate tasks, launch agents, and get status updates — all from one conversation.",
  },
  {
    title: "Autonomous Agents",
    description:
      "Specialist agents that research, write, code, and automate. They work in the background 24/7 without hand-holding.",
  },
  {
    title: "Mission Mode",
    description:
      "Set a long-term goal. The AI plans, delegates to agents, and ships results every hour — autonomously.",
  },
  {
    title: "Web Automation",
    description:
      "Agents navigate websites, extract data, fill forms, and interact with any web application — just like a human.",
  },
  {
    title: "Integrations",
    description:
      "Connect Slack, GitHub, Notion, Google Workspace, Salesforce, and 100+ more tools your team already uses.",
  },
  {
    title: "Approval Workflow",
    description:
      "High-stakes actions pause for your review. Agents ask before sending emails, making purchases, or modifying files.",
  },
];

const stats = [
  { value: "100+", label: "Integrations" },
  { value: "24/7", label: "Always running" },
  { value: "50+", label: "Agent types" },
  { value: "<5 min", label: "Setup time" },
];

export default function OverviewPage() {
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
        <section className="relative text-[19.0491px] items-stretch bg-white dark:bg-[#2C2B27] box-border caret-transparent flex flex-col justify-center leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
          <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
          <div className="text-[19.0491px] box-border caret-transparent basis-[0%] grow leading-[30.4786px] max-w-[1440px] w-[calc(100%_-_67.1429px)] z-[1] mx-auto md:text-[19.8571px] md:leading-[31.7714px] md:w-[calc(100%_-_118.857px)]">
            <div className="text-center">
              <div className="min-w-full mb-[32px] md:mb-[38px]">
                <h1 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[37.375px] leading-[1.1] md:text-6xl">
                  Your AI workforce,<br />ready to deploy
                </h1>
              </div>
              <div className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] max-w-[640px] mx-auto mb-12">
                <p>
                  2Hands gives you autonomous AI agents that research, automate, and deliver real results — while you focus on the work that matters most.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
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
          <div className="relative text-[19.0491px] box-border caret-transparent h-[33.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[59.4286px] md:leading-[31.7714px]"></div>
        </section>

        {/* Stats bar */}
        <section className="relative text-[19.0491px] items-stretch bg-white dark:bg-[#2C2B27] box-border caret-transparent flex flex-col justify-center leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
          <div className="absolute text-[19.0491px] bg-stone-200 dark:bg-[#3A3935] box-border caret-transparent h-px leading-[30.4786px] w-full top-[0%] inset-x-[0%] md:text-[19.8571px] md:leading-[31.7714px]"></div>
          <div className="text-[19.0491px] box-border caret-transparent basis-[0%] grow leading-[30.4786px] max-w-[1440px] w-[calc(100%_-_67.1429px)] z-[1] mx-auto py-16 md:py-20 md:text-[19.8571px] md:leading-[31.7714px] md:w-[calc(100%_-_118.857px)]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-[34px] font-medium text-neutral-900 dark:text-[#F5F3F0] leading-[1.1] font-serif md:text-[42px] mb-3">
                    {stat.value}
                  </div>
                  <div className="text-zinc-500 dark:text-[#9E9C99] text-[15px] leading-6">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute text-[19.0491px] bg-stone-200 dark:bg-[#3A3935] box-border caret-transparent h-px leading-[30.4786px] w-full bottom-[0%] inset-x-[0%] md:text-[19.8571px] md:leading-[31.7714px]"></div>
        </section>

        {/* Platform capabilities */}
        <section className="relative text-[19.0491px] items-stretch bg-white dark:bg-[#2C2B27] box-border caret-transparent flex flex-col justify-center leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
          <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
          <div className="text-[19.0491px] box-border caret-transparent basis-[0%] grow leading-[30.4786px] max-w-[1440px] w-[calc(100%_-_67.1429px)] z-[1] mx-auto md:text-[19.8571px] md:leading-[31.7714px] md:w-[calc(100%_-_118.857px)]">
            <div className="text-center mb-16 md:mb-20">
              <div className="min-w-full mb-6">
                <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-[1.2] md:text-[40px]">
                  Everything you need to<br />automate real work
                </h2>
              </div>
              <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] max-w-[600px] mx-auto">
                From a single agent task to a months-long autonomous mission — 2Hands handles the full spectrum.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
              {capabilities.map((cap, index) => (
                <div
                  key={index}
                  className="bg-neutral-50 dark:bg-[#2C2B27] border border-stone-200 dark:border-[#3A3935] rounded-2xl p-8 md:p-10"
                >
                  <h3 className="text-[20px] font-medium text-neutral-900 dark:text-[#F5F3F0] leading-[1.3] font-serif md:text-[22px] mb-4">
                    {cap.title}
                  </h3>
                  <p className="text-zinc-500 dark:text-[#9E9C99] text-[15px] leading-[1.7]">
                    {cap.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
        </section>

        {/* How it works */}
        <section className="relative text-[19.0491px] items-stretch bg-stone-50 dark:bg-[#1A1918] box-border caret-transparent flex flex-col justify-center leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
          <div className="absolute text-[19.0491px] bg-stone-200 dark:bg-[#3A3935] box-border caret-transparent h-px leading-[30.4786px] w-full top-[0%] inset-x-[0%] md:text-[19.8571px] md:leading-[31.7714px]"></div>
          <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
          <div className="text-[19.0491px] box-border caret-transparent basis-[0%] grow leading-[30.4786px] max-w-[1440px] w-[calc(100%_-_67.1429px)] z-[1] mx-auto md:text-[19.8571px] md:leading-[31.7714px] md:w-[calc(100%_-_118.857px)]">
            <div className="text-center mb-16 md:mb-20">
              <div className="min-w-full mb-6">
                <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-[1.2] md:text-[40px]">
                  How 2Hands works
                </h2>
              </div>
              <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] max-w-[600px] mx-auto">
                Three steps from idea to autonomous execution.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16 max-w-[1000px] mx-auto">
              <div className="text-center md:text-left">
                <div className="text-[13px] font-medium text-[#D97757] mb-4 tracking-widest uppercase">
                  Step 01
                </div>
                <h3 className="text-[22px] font-medium text-neutral-900 dark:text-[#F5F3F0] leading-[1.3] font-serif mb-4">
                  Describe your goal
                </h3>
                <p className="text-zinc-500 dark:text-[#9E9C99] text-[15px] leading-[1.7]">
                  Tell the AI Manager what you need in plain language. &quot;Research our top competitors and create a comparison report.&quot;
                </p>
              </div>
              <div className="text-center md:text-left">
                <div className="text-[13px] font-medium text-[#D97757] mb-4 tracking-widest uppercase">
                  Step 02
                </div>
                <h3 className="text-[22px] font-medium text-neutral-900 dark:text-[#F5F3F0] leading-[1.3] font-serif mb-4">
                  Agents get to work
                </h3>
                <p className="text-zinc-500 dark:text-[#9E9C99] text-[15px] leading-[1.7]">
                  Specialist agents spin up automatically — browsing the web, processing data, writing reports, and connecting to your tools.
                </p>
              </div>
              <div className="text-center md:text-left">
                <div className="text-[13px] font-medium text-[#D97757] mb-4 tracking-widest uppercase">
                  Step 03
                </div>
                <h3 className="text-[22px] font-medium text-neutral-900 dark:text-[#F5F3F0] leading-[1.3] font-serif mb-4">
                  Results delivered
                </h3>
                <p className="text-zinc-500 dark:text-[#9E9C99] text-[15px] leading-[1.7]">
                  Get structured deliverables back in your chat. Review, approve actions, and let agents keep iterating on long-running missions.
                </p>
              </div>
            </div>
          </div>
          <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
        </section>

        <CTABanner
          title="Ready to put your work on autopilot?"
          buttonText="Try 2Hands for free"
          buttonUrl="/sign-in"
        />

      </main>
      <Footer />
    </div>
  );
}
