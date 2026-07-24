import React from "react";
import Link from "next/link";
import { ChevronDown, ArrowRight } from "lucide-react";

export type DropdownItem = {
  label: string;
  href: string;
  description?: string;
  icon?: React.ReactNode;
  comingSoon?: boolean;
};

export type NavbarDropdownProps = {
  label: string;
  items: DropdownItem[];
};

export const NavbarDropdown = ({ label, items }: NavbarDropdownProps) => {
  const hasDescriptions = items.some((item) => item.description);

  return (
    <div className="relative group text-[19.0491px] box-border caret-transparent leading-[30.4786px] min-h-0 min-w-0 text-left z-[900] mx-auto cursor-pointer md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
      {/* Trigger */}
      <div
        role="button"
        className="flex items-center gap-x-1 px-3 py-2 text-zinc-800 dark:text-[#C8C6C3] hover:text-zinc-500 dark:hover:text-[#F5F3F0] transition-colors duration-150 select-none cursor-pointer text-nowrap z-[2]"
      >
        <span className="text-[14px] font-medium tracking-wide">
          {label}
        </span>
        <ChevronDown className="w-3.5 h-3.5 mt-px opacity-60 group-hover:opacity-90 group-hover:rotate-180 transition-all duration-300 ease-out" />
      </div>

      {/* Invisible bridge to prevent gap between trigger and panel */}
      <div className="absolute left-0 top-full h-3 w-full" />

      {/* Dropdown Panel */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+12px)]
          opacity-0 invisible translate-y-1
          group-hover:opacity-100 group-hover:visible group-hover:translate-y-0
          transition-all duration-200 ease-out z-50 pointer-events-none group-hover:pointer-events-auto"
      >
        {/* Arrow pointer */}
        <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-white dark:bg-[#2C2B27] border-l border-t border-stone-200/80 dark:border-[#3A3833] z-10" />

        <div
          className={`relative bg-white/90 dark:bg-[#2C2B27]/95 backdrop-blur-xl border border-stone-200/80 dark:border-[#3A3833] shadow-[0_8px_40px_-8px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_40px_-8px_rgba(0,0,0,0.4),0_2px_8px_-2px_rgba(0,0,0,0.2)] rounded-2xl overflow-hidden
            ${hasDescriptions ? "min-w-[320px]" : "min-w-[200px]"}`}
        >
          {/* Top accent line */}
          <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-stone-300/60 to-transparent" />

          <div className="p-2">
            {items.map((item, index) =>
              item.comingSoon ? (
                <div
                  key={index}
                  className="relative flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-default opacity-50"
                >
                  {item.icon && (
                    <div className="mt-0.5 w-8 h-8 flex items-center justify-center rounded-lg bg-stone-100 text-zinc-400 shrink-0">
                      {item.icon}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium text-zinc-500 dark:text-[#9E9C99] leading-snug">
                        {item.label}
                      </span>
                      <span className="text-[10px] font-medium text-zinc-400 dark:text-[#6B6966] border border-stone-200 dark:border-[#3A3935] rounded-full px-1.5 py-px leading-none">
                        Soon
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-[12px] text-zinc-400 dark:text-[#6B6966] mt-0.5 leading-snug">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <Link
                  key={index}
                  href={item.href}
                  className="group/item relative flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 dark:hover:bg-[#3A3833] transition-all duration-150 cursor-pointer"
                >
                  {item.icon && (
                    <div className="mt-0.5 w-8 h-8 flex items-center justify-center rounded-lg bg-stone-100 text-zinc-500 group-hover/item:bg-stone-200 group-hover/item:text-zinc-700 transition-colors duration-150 shrink-0">
                      {item.icon}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-medium text-zinc-800 dark:text-[#F5F3F0] group-hover/item:text-zinc-900 dark:group-hover/item:text-white leading-snug">
                        {item.label}
                      </span>
                      <ArrowRight className="w-3 h-3 text-zinc-300 group-hover/item:text-zinc-500 group-hover/item:translate-x-0.5 transition-all duration-150 shrink-0" />
                    </div>
                    {item.description && (
                      <p className="text-[12px] text-zinc-400 mt-0.5 leading-snug">
                        {item.description}
                      </p>
                    )}
                  </div>
                </Link>
              )
            )}
          </div>

          {/* Bottom accent */}
          <div className="absolute bottom-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-stone-200/40 to-transparent" />
        </div>
      </div>
    </div>
  );
};

