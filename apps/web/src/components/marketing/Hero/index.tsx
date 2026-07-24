import { HeroContent } from "@/components/marketing/Hero/components/HeroContent";
import { HeroMedia } from "@/components/marketing/Hero/components/HeroMedia";

export const Hero = () => {
  return (
    <section className="relative text-[19.0491px] items-stretch bg-stone-50 dark:bg-[#1A1918] box-border caret-transparent flex flex-col justify-center leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
      <div className="relative text-[19.0491px] box-border caret-transparent h-[100px] leading-[30.4786px] md:text-[19.8571px] md:h-[120px] md:leading-[31.7714px]"></div>
      <div className="text-[19.0491px] box-border caret-transparent basis-[0%] grow leading-[30.4786px] max-w-[1440px] w-[calc(100%_-_67.1429px)] z-[1] mx-auto md:text-[19.8571px] md:leading-[31.7714px] md:w-[calc(100%_-_118.857px)]">
        <div className="text-[19.0491px] box-border caret-transparent gap-x-8 flex flex-col auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(12,minmax(0px,1fr))] grid-rows-[auto] leading-[30.4786px] -order-1 gap-y-8 md:text-[19.8571px] md:grid md:leading-[31.7714px] md:order-none">
          <HeroContent />
          {/* <HeroMedia /> */}
        </div>
      </div>
      <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
    </section>
  );
};
