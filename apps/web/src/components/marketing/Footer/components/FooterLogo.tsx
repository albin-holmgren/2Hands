import { Logo } from "@/components/ui/logo";

export const FooterLogo = () => {
  return (
    <div className="flex flex-col items-start w-full md:w-auto">
      <a href="/">
        <Logo variant="light" />
      </a>
    </div>
  );
};
