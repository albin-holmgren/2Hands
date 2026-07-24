import { FooterContent } from "@/components/marketing/Footer/components/FooterContent";
import { FooterBottom } from "@/components/marketing/Footer/components/FooterBottom";

export const Footer = () => {
  return (
    <footer className="text-stone-50 text-[19.0491px] items-stretch bg-neutral-900 box-border caret-transparent flex flex-col justify-center leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
      <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
      <div className="text-[19.0491px] box-border caret-transparent basis-[0%] grow leading-[30.4786px] max-w-[1440px] w-[calc(100%_-_67.1429px)] z-[1] mx-auto md:text-[19.8571px] md:leading-[31.7714px] md:w-[calc(100%_-_118.857px)]">
        <FooterContent />
        <FooterBottom />
      </div>
      <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
    </footer>
  );
};
