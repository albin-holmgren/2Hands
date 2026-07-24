"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChatInput } from "@/components/chat/chat-input";

const FEATURES = [
  {
    icon: "🎯",
    title: "Mission Mode",
    desc: "Give the AI a long-term goal. It works autonomously every hour — planning, delegating, reporting back.",
  },
  {
    icon: "🤖",
    title: "Specialist Agents",
    desc: "Spin up agents for research, outreach, coding, SEO, and more. They run in the background while you focus.",
  },
  {
    icon: "🔗",
    title: "Deep Integrations",
    desc: "Connect Slack, GitHub, Webhooks and more. Your agents act on real data from your actual tools.",
  },
];

const EXAMPLE_PROMPTS = [
  "Build my SaaS to $1M ARR",
  "Monitor competitors daily and alert me to changes",
  "Write and publish SEO content every week",
  "Keep improving our product autonomously",
];

export function LandingContent() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSend = useCallback(async (message: string) => {
    setIsLoading(true);
    sessionStorage.setItem("landing-message", message);
    router.push("/signup");
  }, [router]);

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-52px)] px-4 sm:px-6">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-[760px] mx-auto pt-8 sm:pt-12 pb-36 sm:pb-8">

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mb-3 text-center"
        >
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary bg-primary/8 px-3 py-1 rounded-full mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            AI agents working for you, right now
          </span>
          <h1 className="text-[28px] sm:text-[40px] font-bold text-foreground leading-[1.2] tracking-tight text-center">
            Your AI workforce,<br className="hidden sm:block" /> working{" "}
            <span className="text-primary">autonomously</span>
          </h1>
          <p className="mt-3 text-[15px] sm:text-[17px] text-muted-foreground max-w-[560px] mx-auto leading-relaxed">
            Give 2Hands a mission. It plans, delegates to specialist agents, and ships results — every hour, in the background, without you lifting a finger.
          </p>
        </motion.div>

        {/* Example prompts */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="flex flex-wrap gap-2 justify-center mb-8 mt-4"
        >
          {EXAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => handleSend(p)}
              className="text-[12px] px-3 py-1.5 rounded-full border border-border bg-card hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-all"
            >
              {p}
            </button>
          ))}
        </motion.div>

        {/* Chat Input */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="w-full mb-10"
        >
          <div className="fixed bottom-16 left-0 right-0 px-4 sm:static sm:px-0 sm:bottom-auto">
            <ChatInput
              onSend={handleSend}
              isLoading={isLoading}
              placeholder={isMobile ? "Give me a goal..." : "Give me a long-term goal, e.g. 'Grow my business to $100K ARR'"}
            />
          </div>
        </motion.div>

        {/* Mission Mode live demo card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="hidden sm:block w-full mb-6"
        >
          <div className="rounded-2xl border border-primary/20 bg-primary/4 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-primary/10">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-[12px]">🎯</span>
                </div>
                <div>
                  <span className="text-[13px] font-bold text-foreground">Mission tick complete</span>
                  <p className="text-[11px] text-muted-foreground">Build my SaaS to $1M ARR</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium border border-purple-500/15">2 agents spawned</span>
                <span className="text-[11px] text-muted-foreground">next in 47m</span>
              </div>
            </div>
            <div className="px-4 py-3 space-y-2">
              <p className="text-[13px] text-foreground/80 leading-relaxed">Focused this tick on competitive positioning. Delegated market research to 2 specialist agents running in background.</p>
              <ul className="space-y-1">
                {[
                  "Competitor Research agent: scraping pricing pages for top 5 rivals",
                  "Growth Strategy agent: analyzing successful B2B SaaS acquisition channels",
                ].map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0 mt-1.5" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="hidden sm:grid grid-cols-3 gap-4 w-full"
        >
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card/60 p-4 text-left">
              <span className="text-[22px] mb-2 block">{f.icon}</span>
              <p className="text-[13px] font-semibold text-foreground mb-1">{f.title}</p>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Social proof */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.55 }}
          className="hidden sm:flex items-center justify-center gap-6 mt-4 flex-wrap"
        >
          {[
            { label: "SaaS growth", icon: "📈" },
            { label: "Competitor monitoring", icon: "🔍" },
            { label: "SEO content", icon: "✍️" },
            { label: "Product improvement", icon: "⚡" },
            { label: "Outreach automation", icon: "📬" },
          ].map((u) => (
            <span key={u.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
              <span>{u.icon}</span>
              <span>{u.label}</span>
            </span>
          ))}
        </motion.div>
      </div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="pb-4 text-center text-[11px] text-muted-foreground/60 leading-[1.6] hidden sm:block"
      >
        By using 2Hands, you agree to our{" "}
        <Link href="/terms" className="underline hover:text-muted-foreground">Terms</Link>
        {" "}and{" "}
        <Link href="/privacy" className="underline hover:text-muted-foreground">Privacy Policy</Link>.
      </motion.p>
    </div>
  );
}
