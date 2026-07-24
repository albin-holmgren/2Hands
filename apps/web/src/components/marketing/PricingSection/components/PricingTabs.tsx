"use client";

import { useState } from "react";
import { User, Users } from "lucide-react";

interface PricingTabsProps {
  activeTab: "individual" | "team";
  onTabChange: (tab: "individual" | "team") => void;
}

export const PricingTabs = ({ activeTab, onTabChange }: PricingTabsProps) => {
  return (
    <div className="relative text-[19.0491px] items-start box-border caret-transparent gap-x-4 flex flex-wrap col-end-[-1] col-start-1 justify-center leading-[30.4786px] gap-y-4 w-full z-[2] mb-[28.1964px] md:text-[19.8571px] md:leading-[31.7714px] md:mb-[31.4286px]">
      <div
        role="tablist"
        className="relative text-[19.0491px] items-center bg-stone-200 dark:bg-[#3A3935] box-border caret-transparent flex justify-center leading-[30.4786px] w-full p-1 rounded-2xl md:text-[19.8571px] md:leading-[31.7714px] md:w-auto"
      >
        <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
          <button
            role="tab"
            onClick={() => onTabChange("individual")}
            className={`relative text-[19.0491px] items-center caret-transparent gap-x-2 flex h-10 justify-center leading-[30.4786px] max-w-full outline-offset-4 gap-y-2 text-center w-full z-[1] pl-3 pr-4 py-2 rounded-xl md:text-[19.8571px] md:leading-[31.7714px] md:w-auto transition-all duration-200 ${
              activeTab === "individual"
                ? "bg-white dark:bg-[#2C2B27] text-neutral-900 dark:text-[#F5F3F0] shadow-sm"
                : "bg-transparent text-zinc-600 dark:text-[#9E9C99]"
            }`}
          >
            <User className="w-4 h-4" />
            <div className="relative text-xs box-border caret-transparent flow-root tracking-[0.12px] leading-[19.2px] text-nowrap z-[1]">
              Individual
            </div>
          </button>
          <button
            role="tab"
            onClick={() => onTabChange("team")}
            className={`relative text-[19.0491px] items-center caret-transparent gap-x-2 flex h-10 justify-center leading-[30.4786px] max-w-full outline-offset-4 gap-y-2 text-center w-full z-[1] pl-3 pr-4 py-2 rounded-xl md:text-[19.8571px] md:leading-[31.7714px] md:w-auto transition-all duration-200 ${
              activeTab === "team"
                ? "bg-white dark:bg-[#2C2B27] text-neutral-900 dark:text-[#F5F3F0] shadow-sm"
                : "bg-transparent text-zinc-600 dark:text-[#9E9C99]"
            }`}
          >
            <Users className="w-4 h-4" />
            <div className="relative text-xs box-border caret-transparent flow-root tracking-[0.12px] leading-[19.2px] text-nowrap z-[1]">
              Team &amp; Enterprise
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
