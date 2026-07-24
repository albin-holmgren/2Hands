import { redirect } from "next/navigation";
import { Globe, Bot, Timer, Layers } from "lucide-react";
import { Navbar } from "@/components/marketing/Navbar";
import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { Footer } from "@/components/marketing/Footer";
import { Modal } from "@/components/marketing/Modal";
import { CommonQuestions } from "@/components/marketing/CommonQuestions";
import {
  BrowserAutomationPanel,
  DeployAgentsPanel,
  OrchestratePanel,
  IntegratePanel,
} from "@/components/marketing/SectionPanels";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  if (params.code) {
    const qs = new URLSearchParams()
    qs.set('code', String(params.code))
    if (params.next) qs.set('next', String(params.next))
    redirect(`/auth/callback?${qs.toString()}`)
  }
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
        <Hero />

        {/* Use cases section */}
        <Section
          variant="use-cases"
          sectionHeader={{
            lottieUrl:
              "https://cdn.prod.website-files.com/6889473510b50328dbb70ae6/69693e489988f719dc4bdc84_Hand-Shake (1).lottie",
            iconUrl: "",
          }}
          sectionContent={{
            variant: "use-cases",
            contentGridVariant: "use-cases",
            useCaseCards: [
              {
                icon: "",
                category: "Daily Operations",
                title: "Start your day informed",
                description:
                  "Your agent compiles a morning briefing from Slack threads, Notion updates, and GitHub PRs. Know what's urgent without checking ten different apps.",
                buttonText: "Learn more",
                buttonUrl: "#",
              },
              {
                icon: "",
                category: "Research",
                title: "Get answers, not links",
                description:
                  "Ask complex questions about markets, competitors, or trends. Your agent researches across sources and delivers structured analysis with sources cited.",
                buttonText: "Learn more",
                buttonUrl: "#",
              },
              {
                icon: "",
                category: "Customer Insights",
                title: "Hear what customers really say",
                description:
                  "Synthesize feedback scattered across call transcripts, support tickets, Slack channels, and CRM notes. Spot patterns and priorities that drive retention.",
                buttonText: "Learn more",
                buttonUrl: "#",
              },
              {
                icon: "",
                category: "Document Processing",
                title: "Turn chaos into order",
                description:
                  "Feed your agent unstructured documents — contracts, reports, emails — and get organized, searchable summaries with key facts extracted and highlighted.",
                buttonText: "Learn more",
                buttonUrl: "#",
              },
            ],
          }}
        />

        {/* Power through tasks section */}
        <Section
          variant="power-through-tasks"
          sectionHeader={{
            lottieUrl:
              "https://cdn.prod.website-files.com/6889473510b50328dbb70ae6/695daf16fad07eb16878049d_Hand-Share.lottie",
            iconUrl:
              "https://c.animaapp.com/mmaathg2cJ7hC9/assets/icon-18.svg",
            title: (
              <>
                Your AI team
                <br />
                works while
                <br />
                you strategize
              </>
            ),
            description:
              "2Hands deploys AI agents that work autonomously across your tools. Describe the outcome, set the cadence — your agents execute and keep you in the loop.",
            showTabs: true,
            tabs: [
              {
                tabIcon: <Globe size={16} />,
                label: "Automate browsers",
                isActive: true,
              },
              {
                tabIcon: <Bot size={16} />,
                label: "Deploy agents",
              },
              {
                tabIcon: <Timer size={16} />,
                label: "Orchestrate",
              },
              {
                tabIcon: <Layers size={16} />,
                label: "Integrate",
              },
            ],
            tabPanels: [
              {
                panelContent: <BrowserAutomationPanel />,
                cardTitle: "Autonomous research",
                cardDescription:
                  "Agents browse websites, extract data, and compile structured reports. Get competitive intelligence delivered without the manual grunt work.",
              },
              {
                panelContent: <DeployAgentsPanel />,
                cardTitle: "CRM automation",
                cardDescription:
                  "Agents read your pipeline, identify opportunities, and take action. From data extraction to draft creation — your sales ops on autopilot.",
              },
              {
                panelContent: <OrchestratePanel />,
                cardTitle: "Always-on monitoring",
                cardDescription:
                  "Scheduled agents that watch, wait, and act. Set them once — they run continuously, alerting you only when something important happens.",
              },
              {
                panelContent: <IntegratePanel />,
                cardTitle: "Multi-agent teams",
                cardDescription:
                  "Parallel agent coordination for complex projects. Multiple agents work simultaneously, then combine results into unified deliverables.",
              },
            ],
          }}
        />

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
                description:
                  "Each agent connects only to the tools and data sources you explicitly authorize. No broad permissions, no surprise access — you define the boundaries for every agent.",
              },
              {
                icon: "",
                title: "Agents ask before acting",
                description:
                  "Before sending emails, making purchases, or modifying files, your agents request confirmation. High-stakes actions pause until you approve them directly in Slack or the app.",
              },
              {
                icon: "",
                title: "Built for team collaboration",
                description:
                  "Role-based permissions let you control who can create, edit, or deploy agents. Audit logs track every action, and workspace isolation keeps your data separate from other teams.",
              },
            ],
          }}
        />

        <CommonQuestions
          items={[
            {
              q: "What can 2Hands agents actually do?",
              a: "2Hands agents complete real work: research markets, draft emails, update CRMs, organize files, analyze data, monitor websites, and run multi-step workflows. They operate your browser, call APIs, and process documents — all without you watching. You set the objective, they deliver results.",
            },
            {
              q: "How is this different from ChatGPT?",
              a: "ChatGPT answers questions. 2Hands agents complete tasks. Instead of writing a draft for you to send, a 2Hands agent researches, writes, and sends the email. Instead of suggesting code, it opens your editor, writes, tests, and commits. It's the difference between advice and action.",
            },
            {
              q: "Is my company data secure?",
              a: "Yes. Agents only access what you explicitly connect — each integration uses scoped permissions you control. Sensitive actions require your approval before executing. All agent activity is logged with full audit trails. Your data never trains our models.",
            },
            {
              q: "How many agents can I run?",
              a: "Run multiple agents in parallel based on your plan. Pro supports several concurrent agents per person. Team plans add shared agent pools and collaboration features.",
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
          ctaTitle="Ready to multiply your output?"
          ctaButtonText="Try 2Hands for free"
          ctaButtonUrl="/sign-in"
        />
      </main>
      <Footer />
      <Modal iconSrc="https://c.animaapp.com/mmaathg2cJ7hC9/assets/icon-86.svg" placeholderImageSrc="https://c.animaapp.com/mmaathg2cJ7hC9/assets/68a333de57ba811ae7efe5ca_vid-placeholder.avif" />
      <Modal iconSrc="https://c.animaapp.com/mmaathg2cJ7hC9/assets/icon-86.svg" placeholderImageSrc="https://c.animaapp.com/mmaathg2cJ7hC9/assets/68a333de57ba811ae7efe5ca_vid-placeholder.avif" />
      <Modal iconSrc="https://c.animaapp.com/mmaathg2cJ7hC9/assets/icon-86.svg" placeholderImageSrc="https://c.animaapp.com/mmaathg2cJ7hC9/assets/68a333de57ba811ae7efe5ca_vid-placeholder.avif" />
    </div>
  );
}
