"use client";

import { useState } from "react";
import { MobileNavbarLogo } from "@/components/marketing/Navbar/components/MobileNavbarLogo";
import { MobileMenuButton } from "@/components/marketing/Navbar/components/MobileMenuButton";
import { MobileMenuDrawer } from "@/components/marketing/Navbar/components/MobileMenuDrawer";

export const MobileNavbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="sticky top-0 bg-stone-50 dark:bg-[#1A1918] border-b border-stone-200 dark:border-[#3A3833] box-border z-50 block md:hidden">
      <div className="flex items-center justify-between px-5 py-3">
        <MobileNavbarLogo />
        <MobileMenuButton isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)} />
      </div>
      <MobileMenuDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </nav>
  );
};
