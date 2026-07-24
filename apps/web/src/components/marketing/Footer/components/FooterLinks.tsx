import { FooterColumn } from "@/components/marketing/Footer/components/FooterColumn";

export const FooterLinks = () => {
  return (
    <div className="text-[19.0491px] box-border caret-transparent col-end-[-1] col-start-5 leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
      <div className="text-[19.0491px] box-border caret-transparent gap-x-16 grid flex-col auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(1,minmax(0px,1fr))] grid-rows-[auto] leading-[30.4786px] gap-y-12 md:text-[19.8571px] md:grid-cols-[repeat(3,minmax(0px,1fr))] md:leading-[31.7714px] md:gap-y-8">
        <FooterColumn
          sections={[
            {
              title: "Platform",
              items: [
                { label: "Overview", href: "/overview" },
                { label: "Features", href: "/features" },
                { label: "Integrations", href: "/integrations" },
                { label: "Security", href: "/security" },
                { label: "Pricing", href: "/pricing" },
              ],
            },
          ]}
        />
        <FooterColumn
          sections={[
            {
              title: "Solutions",
              items: [
                { label: "For Startups", href: "/startups" },
                { label: "For Enterprises", href: "/enterprises" },
                { label: "Use Cases", href: "/use-cases" },
              ],
            },
          ]}
        />
        <FooterColumn
          sections={[
            {
              title: "Legal",
              items: [
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms of Service", href: "/terms" },
              ],
            },
          ]}
        />
      </div>
    </div>
  );
};
