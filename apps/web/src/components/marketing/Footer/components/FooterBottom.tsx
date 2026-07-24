"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const SunIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const SystemIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const options = [
  { value: "system", icon: <SystemIcon /> },
  { value: "light",  icon: <SunIcon /> },
  { value: "dark",   icon: <MoonIcon /> },
] as const;

const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return <div className="h-[34px] w-[100px]" />;

  const handleSetTheme = (value: string) => {
    if (typeof document === "undefined") { setTheme(value); return; }
    if (!("startViewTransition" in document)) { setTheme(value); return; }
    (document as Document & { startViewTransition: (cb: () => void) => void })
      .startViewTransition(() => setTheme(value));
  };

  return (
    <div
      className="flex items-center bg-neutral-700/50 rounded-xl p-[3px]"
      role="group"
      aria-label="Theme"
    >
      {options.map(({ value, icon }) => (
        <button
          key={value}
          onClick={() => handleSetTheme(value)}
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 cursor-pointer ${
            theme === value
              ? "bg-[#C76A50] text-white shadow-sm"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
          aria-pressed={theme === value}
        >
          {icon}
        </button>
      ))}
    </div>
  );
};

export const FooterBottom = () => {
  return (
    <div className="text-[19.0491px] items-center border-b-stone-50 border-l-stone-50 border-r-stone-50 border-t-neutral-700 box-border caret-transparent gap-x-4 flex flex-wrap justify-end leading-[30.4786px] gap-y-4 mt-16 pt-4 border-t md:text-[19.8571px] md:leading-[31.7714px]">
      <ThemeSwitcher />
    </div>
  );
};
