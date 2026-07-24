"use client";

interface PricingPlan {
  name: string;
  description: string;
  price: string;
  priceDetail: string;
  buttonText: string;
  buttonUrl: string;
  featured?: boolean;
  features: string[];
  featuresLabel?: string;
}

const plans: PricingPlan[] = [
  {
    name: "Free",
    description: "Try 2Hands with no commitment. Explore the platform and run agents for personal tasks.",
    price: "$0",
    priceDetail: "Free forever",
    buttonText: "Try 2Hands for free",
    buttonUrl: "/sign-in",
    featuresLabel: "Includes",
    features: [
      "300 credits per day",
      "2 agents",
      "AI Manager chat",
      "Web research & browsing",
      "Core integrations",
    ],
  },
  {
    name: "Starter",
    description: "For individuals getting started with AI automation.",
    price: "$25",
    priceDetail: "per month · 10,000 credits",
    buttonText: "Get Starter",
    buttonUrl: "/sign-in?plan=starter",
    featuresLabel: "Everything in Free, plus",
    features: [
      "Up to 5 agents",
      "10,000 credits / month",
      "Mission Mode",
      "All integrations",
      "Scheduling",
      "Email support",
    ],
  },
  {
    name: "Pro",
    description: "For power users and small teams who need more capacity and speed.",
    price: "$49",
    priceDetail: "per month · 50,000 credits",
    buttonText: "Get Pro",
    buttonUrl: "/sign-in?plan=pro",
    featured: true,
    featuresLabel: "Everything in Starter, plus",
    features: [
      "Up to 15 agents",
      "50,000 credits / month",
      "Higher concurrency",
      "Approval workflows",
      "Audit logs",
      "Priority support",
    ],
  },
  {
    name: "Business",
    description: "For growing teams and departments running automation at scale.",
    price: "$149",
    priceDetail: "per month · 200,000 credits",
    buttonText: "Get Business",
    buttonUrl: "/sign-in?plan=business",
    featuresLabel: "Everything in Pro, plus",
    features: [
      "Up to 50 agents",
      "200,000 credits / month",
      "Highest concurrency",
      "Priority queue",
      "Dedicated support",
    ],
  },
];

export const PricingCards = () => {
  return (
    <div className="max-w-[1192px] mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan, index) => (
          <div
            key={index}
            className={`relative flex flex-col text-left border rounded-[18px] p-6 md:p-7 ${
              plan.featured
                ? "bg-white shadow-[rgba(217,119,87,0.1)_0px_4px_24px_0px] border-[#D97757]/25 dark:bg-[#2C2B27] dark:border-[#D97757]/30"
                : "bg-white border-stone-200 dark:bg-[#2C2B27] dark:border-[#3A3935]"
            }`}
          >
            {plan.featured && (
              <div className="absolute -top-3 left-6">
                <span className="text-[11px] font-medium text-white bg-[#D97757] rounded-full px-3 py-1 tracking-wide">
                  Most popular
                </span>
              </div>
            )}

            {/* Plan name */}
            <h3 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[22px] leading-none mb-2">
              {plan.name}
            </h3>

            {/* Description */}
            <p className="text-zinc-500 dark:text-[#9E9C99] text-[13px] leading-[1.6] mb-6">
              {plan.description}
            </p>

            {/* Price */}
            <div className="mb-1">
              <span className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[36px] leading-none">
                {plan.price}
              </span>
            </div>
            <div className="text-zinc-400 dark:text-[#6B6966] text-[12px] leading-[1.5] mb-6">
              {plan.priceDetail}
            </div>

            {/* CTA Button */}
            <div className={`relative text-[15px] items-center caret-transparent flex justify-center leading-[15px] min-h-[38px] text-center align-middle px-4 py-2 rounded-[8.5px] mb-6 ${
              plan.featured
                ? "text-stone-50 dark:text-neutral-900 dark:bg-[#D97757] bg-neutral-900 shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px] dark:shadow-[rgb(217,119,87)_0px_0px_0px_0px,rgb(199,106,80)_0px_0px_0px_1px]"
                : "text-stone-50 dark:text-neutral-900 dark:bg-white bg-neutral-900 shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px] dark:shadow-[rgb(200,200,200)_0px_0px_0px_0px,rgb(150,150,150)_0px_0px_0px_1px]"
            }`}>
              <div className="relative font-medium z-[1] px-2">
                {plan.buttonText}
              </div>
              <div className="absolute h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                <a href={plan.buttonUrl} className="absolute block h-full max-w-full outline-offset-4 w-full rounded-[8.5px] inset-[0%]"></a>
              </div>
            </div>

            {/* Divider + Features */}
            <div className="border-t border-stone-100 dark:border-[#3A3935] pt-5 flex-1">
              {plan.featuresLabel && (
                <div className="text-[11px] font-medium text-zinc-400 dark:text-[#6B6966] uppercase tracking-widest mb-3">
                  {plan.featuresLabel}
                </div>
              )}
              <ul className="flex flex-col gap-2.5">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 shrink-0 mt-[1px] text-emerald-500 dark:text-emerald-400" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-[13px] text-zinc-600 dark:text-[#C8C6C3] leading-[1.5]">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
