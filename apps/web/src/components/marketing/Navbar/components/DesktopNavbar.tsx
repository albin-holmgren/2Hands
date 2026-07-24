import { NavbarLogo } from "@/components/marketing/Navbar/components/NavbarLogo";
import { NavbarMenu } from "@/components/marketing/Navbar/components/NavbarMenu";

export const DesktopNavbar = () => {
  return (
    <div
      role="banner"
      className="sticky top-0 text-[19.0491px] bg-stone-50 dark:bg-[#1A1918] border-b-stone-200 dark:border-b-[#3A3833] border-l-neutral-900 border-r-neutral-900 border-t-neutral-900 box-border caret-transparent hidden leading-[30.4786px] z-50 border-b md:text-[19.8571px] md:block md:leading-[31.7714px]"
    >
      <div className="text-[19.0491px] box-border caret-transparent gap-x-3 flex basis-[0%] grow justify-between leading-[30.4786px] max-w-[1440px] w-[calc(100%_-_67.1429px)] z-[1] mx-auto md:text-[19.8571px] md:leading-[31.7714px] md:w-[calc(100%_-_118.857px)]">
        <NavbarLogo />
        <NavbarMenu />
      </div>
    </div>
  );
};
