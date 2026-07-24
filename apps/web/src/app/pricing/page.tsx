import { Metadata } from "next";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { PricingSection } from "@/components/marketing/PricingSection";
import { CommonQuestions } from "@/components/marketing/CommonQuestions";

export const metadata: Metadata = {
  title: "Pricing — Simple, transparent pricing | 2Hands",
  description: "Start free, then scale. 2Hands plans are based on credits — pay for what your agents actually do. No per-seat pricing.",
  keywords: ["AI agent pricing", "automation costs", "AI pricing plans", "task automation pricing"],
};

const creditPacks = [
  { name: "Small", price: "$10", credits: "2,500 credits", perCredit: "$0.004 / credit" },
  { name: "Medium", price: "$25", credits: "7,500 credits", perCredit: "$0.0033 / credit", bestValue: true },
  { name: "Large", price: "$60", credits: "20,000 credits", perCredit: "$0.003 / credit" },
  { name: "XL", price: "$120", credits: "45,000 credits", perCredit: "$0.0027 / credit" },
];

export default function PricingPage() {
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
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto text-center">
            <h1 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[37.375px] leading-[1.1] md:text-[56px] mb-5">
              Pricing
            </h1>
            <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] max-w-[520px] mx-auto mb-8">
              Plans are based on credits — the fuel your agents use to do work. Start free, buy a subscription when you need more, or top up with one-time credit packs.
            </p>
            {/* Credits explainer pill row */}
            <div className="flex flex-wrap gap-3 justify-center">
              {[
                "300 free credits / day on the Free plan",
                "Credits reset monthly on paid plans",
                "Top up anytime with credit packs",
              ].map((item) => (
                <span key={item} className="text-[13px] text-zinc-500 dark:text-[#9E9C99] bg-white dark:bg-[#2A2927] border border-stone-200 dark:border-[#3A3935] rounded-full px-4 py-1.5">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        {/* ── Pricing Cards ── */}
        <PricingSection />

        {/* ── Credit Packs ── */}
        <section className="relative flex flex-col bg-white dark:bg-[#2C2B27]">
          <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-start">
              <div>
                <div className="text-[13px] font-medium text-[#D97757] mb-5 tracking-widest uppercase">Credit packs</div>
                <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-[1.2] md:text-[36px] mb-5">
                  Need more? Top up anytime.
                </h2>
                <p className="text-zinc-500 dark:text-[#9E9C99] text-[16px] leading-[1.7]">
                  One-time credit packs that add to your existing balance. No subscription required. Buy as many as you need, whenever you need them. Credits from packs carry over month to month (up to 2× your monthly allowance).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {creditPacks.map((pack) => (
                  <div
                    key={pack.name}
                    className={`relative border rounded-2xl p-5 ${
                      pack.bestValue
                        ? "bg-white dark:bg-[#2C2B27] border-[#D97757]/25 dark:border-[#D97757]/30 shadow-[rgba(217,119,87,0.08)_0px_4px_20px_0px]"
                        : "bg-white dark:bg-[#2C2B27] border-stone-200 dark:border-[#3A3935]"
                    }`}
                  >
                    {pack.bestValue && (
                      <div className="absolute -top-3 left-4">
                        <span className="text-[10px] font-medium text-white bg-[#D97757] rounded-full px-2.5 py-0.5 tracking-wide">
                          Best value
                        </span>
                      </div>
                    )}
                    <div className="text-[13px] font-medium text-zinc-400 dark:text-[#6B6966] mb-2">{pack.name}</div>
                    <div className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[28px] leading-none mb-1">{pack.price}</div>
                    <div className="text-[13px] font-medium text-neutral-800 dark:text-[#C8C6C3] mb-1">{pack.credits}</div>
                    <div className="text-[11px] text-zinc-400 dark:text-[#6B6966]">{pack.perCredit}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>

        {/* ── FAQ ── */}
        <CommonQuestions
          title={"Pricing\nquestions"}
          items={[
            {
              q: "What are credits and how do they work?",
              a: "Credits are consumed when your AI agents perform actions — browsing the web, calling tools, writing, or running searches. Simple lookups use fewer credits; complex multi-step automations use more. Free plan users get 300 credits per day. Paid plans include a monthly credit allowance that resets with your billing cycle.",
            },
            {
              q: "Can I upgrade or downgrade anytime?",
              a: "Yes. Upgrades take effect immediately with prorated billing. Downgrades apply at the start of your next billing cycle. No lock-in contracts — cancel anytime.",
            },
            {
              q: "What happens if I run out of credits?",
              a: "Your agents pause until credits refresh at the start of your next billing cycle. You can also purchase one-time credit packs anytime to keep your agents running without interruption.",
            },
            {
              q: "Do credit packs expire?",
              a: "Credits from packs carry over month to month, up to a cap of 2× your monthly plan allowance. This means you can build up a buffer without losing credits you've paid for.",
            },
            {
              q: "What's included in all plans?",
              a: "Every plan includes the AI Manager chat, web research, agent automation, and access to all core integrations. Higher tiers unlock more concurrent agents, Mission Mode, approval workflows, audit logs, and priority support.",
            },
            {
              q: "Do you offer annual billing?",
              a: "Yes. Annual billing is available for Starter, Pro, and Business plans and offers a discount compared to monthly billing. You can switch to annual billing from your account settings at any time.",
            },
          ]}
          ctaTitle="Start for free, scale when you're ready."
          ctaButtonText="Try 2Hands for free"
          ctaButtonUrl="/sign-in"
        />
      </main>
      <Footer />
    </div>
  );
}
