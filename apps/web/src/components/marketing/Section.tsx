import { SectionHeader } from "@/components/marketing/SectionHeader";
import { SectionContent } from "@/components/marketing/SectionContent";

export type SectionProps = {
  variant: string;
  sectionHeader?: {
    lottieUrl: string;
    iconUrl: string;
    title?: React.ReactNode;
    description?: string;
    showTabs?: boolean;
    tabs?: Array<{
      tabIcon: React.ReactNode;
      label: string;
      isActive?: boolean;
    }>;
    tabPanels?: Array<{
      promptTitle?: string;
      promptText?: string;
      workingFolder?: string;
      codeContent?: string;
      bottomIcons?: string[];
      cardTitle?: string;
      cardDescription?: string;
      videoUrl?: string;
      panelContent?: React.ReactNode;
    }>;
    showSteps?: boolean;
    steps?: Array<{
      number: string;
      title: string;
      body: string;
      bullets: Array<{ title: string; text: string }>;
      panel: React.ReactNode;
    }>;
  };
  sectionContent?: {
    variant: string;
    containerClassName?: string;
    tabButtons?: Array<{
      icon: string;
      label: string;
      isActive: boolean;
      className: string;
    }>;
    tabNavigationClassName?: string;
    tabListClassName?: string;
    contentGridVariant?: string;
    cardVariant?: string;
    cardPlanIcon?: string;
    cardPlanTitle?: string;
    cardPlanDescription?: string;
    cardPlanPrice?: string;
    cardPlanPriceDetails?: string;
    cardPlanButtonText?: string;
    cardPlanButtonUrl?: string;
    teamPlanIcon?: string;
    teamPlanTitle?: string;
    teamPlanDescription?: string;
    teamPlanPrice?: string;
    teamPlanPriceDetails?: string;
    teamPlanButtonText?: string;
    teamPlanButtonUrl?: string;
    enterprisePlanIcon?: string;
    enterprisePlanTitle?: string;
    enterprisePlanDescription?: string;
    enterprisePlanButtonText?: string;
    enterprisePlanButtonUrl?: string;
    tabPanelRole?: string;
    tabPanelClassName?: string;
    useCaseCards?: Array<{
      icon: string;
      category: string;
      title: string;
      description: string;
      buttonText: string;
      buttonUrl: string;
    }>;
    securityItems?: Array<{
      icon: string;
      iconName?: "shield" | "check" | "building" | "lock" | "users" | "fileCheck";
      title: string;
      description: string;
    }>;
    navigationIcons?: string[];
    faqItems?: Array<{
      question: string;
      answer: React.ReactNode;
    }>;
    showSideArticle?: boolean;
    sideArticleTitle?: string;
    sideArticleDescription?: string;
    sideArticleButtonText?: string;
    sideArticleButtonUrl?: string;
    howItWorksSteps?: Array<{
      number: string;
      title: string;
      body: string;
      bullets: Array<{ title: string; text: string }>;
    }>;
  };
  showHeaderWrapper?: boolean;
  headerWrapperClassName?: string;
  showPricingDisclaimer?: boolean;
  showFaqCta?: boolean;
  faqCtaTitle?: string;
  faqCtaButtons?: Array<{
    text: string;
    url: string;
    variant: string;
  }>;
};

export const Section = (props: SectionProps) => {
  return (
    <section
      className={`relative text-[19.0491px] items-stretch box-border caret-transparent flex flex-col justify-center leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] ${props.variant === "pricing" || props.variant === "how-it-works" || props.variant === "security" ? "bg-stone-50 dark:bg-[#1A1918]" : "bg-white dark:bg-[#2C2B27]"}`}
    >
      <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
      <div className="text-[19.0491px] box-border caret-transparent basis-[0%] grow leading-[30.4786px] max-w-[1440px] w-[calc(100%_-_67.1429px)] z-[1] mx-auto md:text-[19.8571px] md:leading-[31.7714px] md:w-[calc(100%_-_118.857px)]">

        {/* Power through tasks variant */}
        {props.variant === "power-through-tasks" && (
          <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <SectionHeader
              lottieUrl={props.sectionHeader?.lottieUrl ?? ""}
              iconUrl={props.sectionHeader?.iconUrl ?? ""}
              title={props.sectionHeader?.title}
              description={props.sectionHeader?.description}
              showTabs={props.sectionHeader?.showTabs}
              tabs={props.sectionHeader?.tabs}
              tabPanels={props.sectionHeader?.tabPanels}
            />
          </div>
        )}

        {/* Pricing variant */}
        {props.variant === "pricing" && (
          <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
              <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] text-center md:text-[19.8571px] md:leading-[31.7714px]">
                <SectionHeader
                  lottieUrl={props.sectionHeader?.lottieUrl ?? ""}
                  iconUrl={props.sectionHeader?.iconUrl ?? ""}
                />
                <div className="text-[34.8839px] font-medium items-center box-border caret-transparent flex flex-col justify-center leading-[41.8607px] min-w-full mb-[32.3929px] font-playfair md:text-[49.4286px] md:leading-[59.3143px] md:mb-[38.8571px] max-w-[676.922px] md:max-w-[961.936px]">
                  <h2 aria-label="Simple, transparent pricing" className="text-[34.8839px] box-border caret-transparent flow-root leading-[41.8607px] w-full md:text-[49.4286px] md:leading-[59.3143px]"></h2>
                </div>
                <div className="relative text-[19.0491px] box-border caret-transparent h-[33.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[59.4286px] md:leading-[31.7714px]"></div>
              </div>
              <SectionContent
                variant={props.sectionContent?.variant as any}
                containerClassName={props.sectionContent?.containerClassName}
                tabButtons={props.sectionContent?.tabButtons}
                tabNavigationClassName={props.sectionContent?.tabNavigationClassName}
                tabListClassName={props.sectionContent?.tabListClassName}
                contentGridVariant={props.sectionContent?.contentGridVariant}
                cardVariant={props.sectionContent?.cardVariant}
                cardPlanIcon={props.sectionContent?.cardPlanIcon}
                cardPlanTitle={props.sectionContent?.cardPlanTitle}
                cardPlanDescription={props.sectionContent?.cardPlanDescription}
                cardPlanPrice={props.sectionContent?.cardPlanPrice}
                cardPlanPriceDetails={props.sectionContent?.cardPlanPriceDetails}
                cardPlanButtonText={props.sectionContent?.cardPlanButtonText}
                cardPlanButtonUrl={props.sectionContent?.cardPlanButtonUrl}
                teamPlanIcon={props.sectionContent?.teamPlanIcon}
                teamPlanTitle={props.sectionContent?.teamPlanTitle}
                teamPlanDescription={props.sectionContent?.teamPlanDescription}
                teamPlanPrice={props.sectionContent?.teamPlanPrice}
                teamPlanPriceDetails={props.sectionContent?.teamPlanPriceDetails}
                teamPlanButtonText={props.sectionContent?.teamPlanButtonText}
                teamPlanButtonUrl={props.sectionContent?.teamPlanButtonUrl}
                enterprisePlanIcon={props.sectionContent?.enterprisePlanIcon}
                enterprisePlanTitle={props.sectionContent?.enterprisePlanTitle}
                enterprisePlanDescription={props.sectionContent?.enterprisePlanDescription}
                enterprisePlanButtonText={props.sectionContent?.enterprisePlanButtonText}
                enterprisePlanButtonUrl={props.sectionContent?.enterprisePlanButtonUrl}
                tabPanelRole={props.sectionContent?.tabPanelRole}
                tabPanelClassName={props.sectionContent?.tabPanelClassName}
              />
              {props.showPricingDisclaimer && (
                <div className="text-zinc-600 text-[15px] box-border caret-transparent leading-6 text-center mt-[40.3929px] md:mt-[46.8571px]">
                  <p className="box-border caret-transparent flow-root">
                    Extra{" "}
                    <a href="/support/usage-limits" className="relative box-border caret-transparent outline-offset-4 decoration-stone-400 underline underline-offset-[3px] z-[4]">
                      usage limits
                    </a>{" "}
                    apply. Prices shown don&apos;t include applicable tax.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Use cases variant */}
        {props.variant === "use-cases" && (
          <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
              <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] text-center md:text-[19.8571px] md:leading-[31.7714px]">
                <SectionHeader
                  lottieUrl={props.sectionHeader?.lottieUrl ?? ""}
                  iconUrl={props.sectionHeader?.iconUrl ?? ""}
                />
                <div className="relative text-[19.0491px] box-border caret-transparent h-[33.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[59.4286px] md:leading-[31.7714px]"></div>
              </div>
              
              {/* Title and description above gray background */}
              <div className="text-center mb-12 md:mb-16">
                <h2 className="text-[34px] font-medium text-neutral-900 dark:text-[#F5F3F0] leading-[1.15] font-serif md:text-[42px] mb-6">
                  Put your work on autopilot
                </h2>
                <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65] max-w-[600px] mx-auto mb-8">
                  From morning briefings to document processing, 2Hands agents handle the repetitive work so you can focus on what matters.
                </p>
                <div className="h-4 md:h-6"></div>
              </div>
              
              <SectionContent
                variant={props.sectionContent?.variant as any}
                contentGridVariant={props.sectionContent?.contentGridVariant}
                useCaseCards={props.sectionContent?.useCaseCards}
              />
              <div className="relative text-[19.0491px] box-border caret-transparent h-[33.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[59.4286px] md:leading-[31.7714px]"></div>
            </div>
          </div>
        )}

        {/* Security variant */}
        {props.variant === "security" && (
          <SectionContent
            variant={props.sectionContent?.variant as any}
            contentGridVariant={props.sectionContent?.contentGridVariant}
            securityItems={props.sectionContent?.securityItems}
            navigationIcons={props.sectionContent?.navigationIcons}
          />
        )}

        {/* How it works variant */}
        {props.variant === "how-it-works" && (
          <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <SectionHeader
              lottieUrl={props.sectionHeader?.lottieUrl ?? ""}
              iconUrl={props.sectionHeader?.iconUrl ?? ""}
              title={props.sectionHeader?.title}
              description={props.sectionHeader?.description}
              showSteps={props.sectionHeader?.showSteps}
              steps={props.sectionHeader?.steps}
            />
          </div>
        )}

        {/* FAQ variant */}
        {props.variant === "faq" && (
          <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="text-[19.0491px] self-center box-border caret-transparent leading-[30.4786px] text-center w-full md:text-[19.8571px] md:leading-[31.7714px]">
              <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                <div className="relative text-[19.0491px] box-border caret-transparent h-[65.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[91.4286px] md:leading-[31.7714px]"></div>
                <div className="text-[34.8839px] font-medium items-center box-border caret-transparent flex flex-col justify-center leading-[41.8607px] min-w-full mb-[32.3929px] font-newsreader md:text-[49.4286px] md:leading-[59.3143px] md:mb-[38.8571px] max-w-[676.922px] md:max-w-[961.936px]">
                  <h2 className="text-[34.8839px] box-border caret-transparent flow-root leading-[41.8607px] w-full md:text-[49.4286px] md:leading-[59.3143px]">
                    FAQ
                  </h2>
                </div>
                <div className="relative text-[19.0491px] box-border caret-transparent h-[65.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[91.4286px] md:leading-[31.7714px]"></div>
              </div>
              <SectionContent
                variant={props.sectionContent?.variant as any}
                contentGridVariant={props.sectionContent?.contentGridVariant}
                faqItems={props.sectionContent?.faqItems}
                showSideArticle={props.sectionContent?.showSideArticle}
                sideArticleTitle={props.sectionContent?.sideArticleTitle}
                sideArticleDescription={props.sectionContent?.sideArticleDescription}
                sideArticleButtonText={props.sectionContent?.sideArticleButtonText}
                sideArticleButtonUrl={props.sectionContent?.sideArticleButtonUrl}
              />
              <div className="relative text-[19.0491px] box-border caret-transparent h-[65.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[91.4286px] md:leading-[31.7714px]"></div>
              {props.showFaqCta && (
                <div className="text-[19.0491px] items-center bg-stone-50 box-border caret-transparent gap-x-[32.3929px] flex flex-col justify-center leading-[30.4786px] gap-y-[32.3929px] w-full border border-stone-200 px-4 py-[40.3929px] rounded-[16.7857px] border-solid md:text-[19.8571px] md:gap-x-[46.8571px] md:flex-row md:justify-between md:leading-[31.7714px] md:gap-y-[46.8571px] md:p-[62.2857px] md:rounded-[29.7143px]">
                  <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                    <div className="text-[23.442px] font-medium box-border caret-transparent flow-root leading-[25.7862px] font-display md:text-[30.7143px] md:leading-[33.7857px]">
                      {props.faqCtaTitle}
                    </div>
                  </div>
                  <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                    <div className="text-[19.0491px] content-center items-stretch box-border caret-transparent gap-x-3 flex flex-col shrink-0 flex-nowrap justify-center leading-[30.4786px] gap-y-3 md:text-[19.8571px] md:items-center md:flex-row md:flex-wrap md:leading-[31.7714px]">
                      <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                        {props.faqCtaButtons?.filter(b => b.variant === "primary").map((button, index) => (
                          <div
                            key={index}
                            className={`relative ${button.variant === "primary" ? "text-stone-50 bg-neutral-900 shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px]" : "text-neutral-700 bg-stone-200 shadow-[rgb(240,238,230)_0px_0px_0px_0px,rgb(222,220,209)_0px_0px_0px_1px]"} text-[17px] items-center box-border caret-transparent flex justify-center leading-[17px] min-h-10 text-center align-middle px-4 py-2 rounded-[8.5px]`}
                          >
                            <div className="box-border caret-transparent hidden"></div>
                            <div className="relative font-medium box-border caret-transparent flow-root z-[1] px-2">
                              {button.text}
                            </div>
                            <div className="absolute box-border caret-transparent h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                              <a href={button.url} className="absolute box-border caret-transparent block h-full max-w-full outline-offset-4 w-full rounded-[8.5px] inset-[0%]"></a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
      <div className="relative text-[19.0491px] box-border caret-transparent h-[97.5714px] leading-[30.4786px] md:text-[19.8571px] md:h-[123.429px] md:leading-[31.7714px]"></div>
    </section>
  );
};
