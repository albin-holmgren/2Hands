import { FooterLogo } from "@/components/marketing/Footer/components/FooterLogo";
import { FooterLinks } from "@/components/marketing/Footer/components/FooterLinks";

export const FooterContent = () => {
  return (
    <div className="text-[19.0491px] box-border caret-transparent gap-x-[52.5893px] flex flex-col auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(12,minmax(0px,1fr))] grid-rows-[auto] leading-[30.4786px] gap-y-[52.5893px] w-full md:text-[19.8571px] md:gap-x-8 md:grid md:leading-[31.7714px] md:gap-y-8">
      <div className="text-[19.0491px] box-border caret-transparent contents flex-col col-end-[span_4] justify-between leading-[30.4786px] min-h-0 min-w-0 md:text-[19.8571px] md:flex md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
        <FooterLogo />
        <div className="text-neutral-500 text-[19.0491px] box-border caret-transparent leading-[30.4786px] order-1 md:text-[19.8571px] md:leading-[31.7714px]">
          <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <a
              href="https://www.2hands.ai/"
              className="text-[10px] font-semibold box-border caret-transparent tracking-[0.5px] leading-4 uppercase outline-offset-4 text-neutral-500"
            >
              BY BIZLUTION AB
            </a>
          </div>
          <div className="text-[10px] box-border caret-transparent flow-root tracking-[0.5px] leading-4 uppercase mt-3 before:accent-auto before:box-border before:caret-transparent before:text-neutral-500 before:table before:text-[10px] before:not-italic before:normal-nums before:font-normal before:tracking-[0.5px] before:leading-4 before:list-outside before:list-disc before:mb-[-4.1px] before:pointer-events-auto before:text-start before:indent-[0px] before:uppercase before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-neutral-500 after:table after:text-[10px] after:not-italic after:normal-nums after:font-normal after:tracking-[0.5px] after:leading-4 after:list-outside after:list-disc after:mb-[-4.2px] after:pointer-events-auto after:text-start after:indent-[0px] after:uppercase after:visible after:border-separate after:font-sans">
            © <span className="box-border caret-transparent">2026</span> BIZLUTION AB
          </div>
        </div>
      </div>
      <FooterLinks />
    </div>
  );
};
