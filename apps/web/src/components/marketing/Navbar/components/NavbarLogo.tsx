import { Logo } from "@/components/ui/logo";

export const NavbarLogo = () => {
  return (
    <a
      aria-label="Home page"
      href="/"
      className="relative items-center flex justify-start -outline-offset-2 z-[2]"
    >
      <Logo />
    </a>
  );
};
