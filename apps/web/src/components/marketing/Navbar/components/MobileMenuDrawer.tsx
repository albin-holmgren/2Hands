"use client";

import Link from "next/link";
import React, { useState } from "react";

const PlusMinusIcon = ({ isOpen }: { isOpen: boolean }) => (
  <div className="relative w-5 h-5 flex items-center justify-center">
    <span className="block absolute w-3.5 h-[1.5px] bg-current rounded-full transition-transform duration-300" />
    <span className={`block absolute w-3.5 h-[1.5px] bg-current rounded-full transition-transform duration-300 ${isOpen ? "rotate-0" : "rotate-90"}`} />
  </div>
);

const MobileAccordionItem = ({ label, items, onNavigate, style }: { label: string; items: { label: string; href: string; comingSoon?: boolean }[]; onNavigate: () => void; style?: React.CSSProperties }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <li className="border-b border-stone-200/60 dark:border-[#3A3833]/60" style={style}>
      <div
        role="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-5 text-zinc-800 dark:text-[#C8C6C3] hover:text-zinc-500 dark:hover:text-[#F5F3F0] transition-colors duration-150 cursor-pointer select-none"
      >
        <span className="text-[17px] font-medium">{label}</span>
        <PlusMinusIcon isOpen={isOpen} />
      </div>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <ul className="flex flex-col pb-5 -mt-1">
          {items.map((item, idx) => (
            <li key={idx}>
              {item.comingSoon ? (
                <div className="flex items-center gap-2 py-2.5 pl-1">
                  <span className="text-[15px] text-zinc-400 dark:text-[#6B6966]">{item.label}</span>
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-[#6B6966] border border-stone-200 dark:border-[#3A3935] rounded-full px-1.5 py-px leading-none">
                    Soon
                  </span>
                </div>
              ) : (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className="block py-2.5 pl-1 text-[15px] text-zinc-500 dark:text-[#9E9C99] hover:text-zinc-900 dark:hover:text-[#F5F3F0] transition-colors duration-150"
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
};

type MobileMenuDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

const navItems = [
  {
    type: "accordion" as const,
    label: "Platform",
    items: [
      { label: "Overview", href: "/overview" },
      { label: "Features", href: "/features" },
      { label: "Security", href: "/security" },
      { label: "Integrations", href: "/integrations" },
    ],
  },
  {
    type: "accordion" as const,
    label: "Solutions",
    items: [
      { label: "For Startups", href: "/startups" },
      { label: "For Enterprises", href: "/enterprises" },
      { label: "By Use Case", href: "/use-cases" },
    ],
  },
  { type: "link" as const, label: "Pricing", href: "/pricing" },
  {
    type: "accordion" as const,
    label: "Resources",
    items: [
      { label: "Blog", href: "/", comingSoon: true },
      { label: "Help Center", href: "/", comingSoon: true },
      { label: "Community", href: "/", comingSoon: true },
      { label: "API Documentation", href: "/", comingSoon: true },
    ],
  },
  { type: "link" as const, label: "Sign in", href: "/sign-in" },
];

export const MobileMenuDrawer = ({ isOpen, onClose }: MobileMenuDrawerProps) => {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 bg-stone-50 dark:bg-[#1A1918] flex flex-col"
      style={{ top: "53px", clipPath: isOpen ? "inset(0 0 0%)" : "inset(0 0 100%)", transition: "clip-path 480ms cubic-bezier(0.4, 0, 0.2, 1)", pointerEvents: isOpen ? "auto" : "none" }}
    >
      {/* Scrollable nav items with staggered animation */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6">
          <ul className="flex flex-col">
            {navItems.map((item, i) =>
              item.type === "accordion" ? (
                <MobileAccordionItem
                  key={item.label}
                  label={item.label}
                  items={item.items}
                  onNavigate={onClose}
                  style={{
                    opacity: isOpen ? 1 : 0,
                    transform: isOpen ? "translateY(0)" : "translateY(10px)",
                    transition: `opacity 300ms ease, transform 300ms ease`,
                    transitionDelay: isOpen ? `${120 + i * 50}ms` : "0ms",
                  }}
                />
              ) : (
                <li
                  key={item.label}
                  className="border-b border-stone-200/60 dark:border-[#3A3833]/60"
                  style={{
                    opacity: isOpen ? 1 : 0,
                    transform: isOpen ? "translateY(0)" : "translateY(10px)",
                    transition: `opacity 300ms ease, transform 300ms ease`,
                    transitionDelay: isOpen ? `${120 + i * 50}ms` : "0ms",
                  }}
                >
                  <Link
                    href={item.href!}
                    onClick={onClose}
                    className="flex items-center justify-between w-full py-5 text-[17px] font-medium text-zinc-800 dark:text-[#C8C6C3] hover:text-zinc-500 dark:hover:text-[#F5F3F0] transition-colors duration-150"
                  >
                    {item.label}
                  </Link>
                </li>
              )
            )}
          </ul>
        </div>
      </div>

      {/* Bottom CTA */}
      <div
        className="px-6 pb-10 pt-4 flex flex-col gap-3"
        style={{
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 300ms ease, transform 300ms ease",
          transitionDelay: isOpen ? "370ms" : "0ms",
        }}
      >
        <Link
          href="/signup"
          onClick={onClose}
          className="flex items-center justify-center w-full py-3.5 px-4 rounded-xl text-[16px] font-medium text-white dark:text-neutral-900 dark:bg-white bg-neutral-900 hover:opacity-80 transition-opacity duration-150"
        >
          Try 2Hands
        </Link>
      </div>
    </div>
  );
};

