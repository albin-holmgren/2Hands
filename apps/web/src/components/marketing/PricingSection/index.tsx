"use client";

import { PricingCards } from "@/components/marketing/PricingSection/components/PricingCards";

export const PricingSection = () => {
  return (
    <section className="relative flex flex-col">
      <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
      <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
      <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto w-full">
        <PricingCards />
        <p className="text-zinc-400 dark:text-[#6B6966] text-[13px] text-center mt-8">
          All prices in USD. Prices shown don&apos;t include applicable tax. Credits reset monthly.
        </p>
      </div>
      <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
    </section>
  );
};
