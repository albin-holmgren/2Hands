import { TabNavigation } from "@/components/marketing/TabNavigation";
import { ContentGrid } from "@/components/marketing/ContentGrid";

export type SectionContentProps = {
  variant:
    | "detailed-card"
    | "pricing-team-enterprise"
    | "use-cases"
    | "security"
    | "faq"
    | "how-it-works";
  containerClassName?: string;

  // Tab Navigation props (for detailed-card and pricing-team-enterprise)
  tabButtons?: Array<{
    icon: string;
    label: string;
    isActive?: boolean;
    className?: string;
  }>;
  tabNavigationClassName?: string;
  tabListClassName?: string;

  // ContentGrid props
  contentGridVariant?: string;

  // For detailed-card variant
  cardVariant?: string;
  cardPromptTitle?: string;
  cardPromptContent?: React.ReactNode;
  cardWorkingFolderTitle?: string;
  cardWorkingFolderPath?: string;
  cardCodeBlockContent?: React.ReactNode;
  cardIconUrls?: string[];
  contentTitle?: string;
  contentDescription?: string;

  // For pricing-team-enterprise variant
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

  // For use-cases variant
  useCaseCards?: Array<{
    icon: string;
    category: string;
    title: string;
    description: string;
    buttonText: string;
    buttonUrl: string;
  }>;

  // For security variant
  securityItems?: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
  navigationIcons?: string[];

  // For how-it-works variant
  howItWorksSteps?: Array<{
    number: string;
    title: string;
    body: string;
    bullets: Array<{ title: string; text: string }>;
  }>;

  // For faq variant
  faqItems?: Array<{
    question: string;
    answer: React.ReactNode;
  }>;
  showSideArticle?: boolean;
  sideArticleTitle?: string;
  sideArticleDescription?: string;
  sideArticleButtonText?: string;
  sideArticleButtonUrl?: string;
};

export const SectionContent = (props: SectionContentProps) => {
  const renderTabNavigation = () => {
    if (!props.tabButtons) return null;

    return (
      <>
        <TabNavigation />
        <div className="text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
        <div className={props.tabNavigationClassName}>
          <div role="tablist" className={props.tabListClassName}>
            <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
              {props.tabButtons.map((tab, index) => (
                <button key={index} role="tab" className={tab.className}>
                  <div
                    className={
                      tab.isActive
                        ? "relative text-[19.0491px] aspect-square box-border caret-transparent leading-[30.4786px] w-5 z-[1] md:text-[19.8571px] md:leading-[31.7714px]"
                        : "relative text-[19.0491px] aspect-square box-border caret-transparent leading-[30.4786px] min-h-0 min-w-0 w-5 z-[1] md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]"
                    }
                  >
                    <div
                      className={
                        tab.isActive
                          ? "text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"
                          : "text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"
                      }
                    >
                      <img
                        src={tab.icon}
                        alt="Icon"
                        className="text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]"
                      />
                    </div>
                  </div>
                  <div
                    className={
                      tab.isActive
                        ? "relative text-xs box-border caret-transparent flow-root tracking-[0.12px] leading-[19.2px] text-nowrap z-[1] before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-xs before:not-italic before:normal-nums before:font-normal before:tracking-[0.12px] before:leading-[19.2px] before:list-outside before:list-disc before:mb-[-4.91375px] before:pointer-events-auto before:text-center before:indent-[0px] before:normal-case before:text-nowrap before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-xs after:not-italic after:normal-nums after:font-normal after:tracking-[0.12px] after:leading-[19.2px] after:list-outside after:list-disc after:mb-[-5.03375px] after:pointer-events-auto after:text-center after:indent-[0px] after:normal-case after:text-nowrap after:visible after:border-separate after:font-sans"
                        : "relative text-xs box-border caret-transparent flow-root tracking-[0.12px] leading-[19.2px] min-h-0 min-w-0 text-nowrap z-[1] md:min-h-[auto] md:min-w-[auto] before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-xs before:not-italic before:normal-nums before:font-normal before:tracking-[0.12px] before:leading-[19.2px] before:list-outside before:list-disc before:mb-[-4.91375px] before:pointer-events-auto before:text-center before:indent-[0px] before:normal-case before:text-nowrap before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-xs after:not-italic after:normal-nums after:font-normal after:tracking-[0.12px] after:leading-[19.2px] after:list-outside after:list-disc after:mb-[-5.03375px] after:pointer-events-auto after:text-center after:indent-[0px] after:normal-case after:text-nowrap after:visible after:border-separate after:font-sans"
                    }
                  >
                    {tab.label}
                  </div>
                </button>
              ))}
            </div>
            <div
              className={
                props.variant === "detailed-card"
                  ? "relative text-[19.0491px] box-border caret-transparent leading-[30.4786px] z-[2] ml-1 md:text-[19.8571px] md:leading-[31.7714px] block min-h-[auto] min-w-[auto] md:hidden md:min-h-0 md:min-w-0"
                  : "relative text-[19.0491px] box-border caret-transparent leading-[30.4786px] z-[2] ml-1 md:text-[19.8571px] md:leading-[31.7714px] hidden"
              }
            >
              <button className="text-zinc-600 text-[19.0491px] items-center bg-white caret-transparent gap-x-2 flex h-10 justify-center leading-[30.4786px] min-w-10 outline-offset-4 gap-y-2 border border-stone-200 px-2 py-0 rounded-xl border-solid md:text-[19.8571px] md:leading-[31.7714px]">
                <div className="relative text-xs box-border caret-transparent hidden tracking-[0.12px] leading-[19.2px] text-nowrap z-[1] before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-xs before:not-italic before:normal-nums before:font-normal before:tracking-[0.12px] before:leading-[19.2px] before:list-outside before:list-disc before:mb-[-4.91375px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:text-nowrap before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-xs after:not-italic after:normal-nums after:font-normal after:tracking-[0.12px] after:leading-[19.2px] after:list-outside after:list-disc after:mb-[-5.03375px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:text-nowrap after:visible after:border-separate after:font-sans"></div>
                <div
                  className={
                    props.variant === "detailed-card"
                      ? "text-[19.0491px] box-border caret-transparent leading-[30.4786px] w-5 md:text-[19.8571px] md:leading-[31.7714px] min-h-[auto] min-w-[auto] md:min-h-0 md:min-w-0"
                      : "text-[19.0491px] box-border caret-transparent leading-[30.4786px] w-5 md:text-[19.8571px] md:leading-[31.7714px]"
                  }
                >
                  <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                    <img
                      src="https://c.animaapp.com/mmaathg2cJ7hC9/assets/icon-23.svg"
                      alt="Icon"
                      className="text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]"
                    />
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  if (props.variant === "detailed-card") {
    return (
      <div
        className={
          props.containerClassName ||
          "text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] items-start gap-x-0 flex flex-col auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(12,minmax(0px,1fr))] grid-rows-[auto] justify-center gap-y-0 md:grid"
        }
      >
        {renderTabNavigation()}
        <ContentGrid
          variant={props.contentGridVariant}
          cardVariant={props.cardVariant}
          cardPromptTitle={props.cardPromptTitle}
          cardPromptContent={props.cardPromptContent}
          cardWorkingFolderTitle={props.cardWorkingFolderTitle}
          cardWorkingFolderPath={props.cardWorkingFolderPath}
          cardCodeBlockContent={props.cardCodeBlockContent}
          cardIconUrls={props.cardIconUrls}
          contentTitle={props.contentTitle}
          contentDescription={props.contentDescription}
        />
      </div>
    );
  }

  if (props.variant === "pricing-team-enterprise") {
    return (
      <div
        className={
          props.containerClassName ||
          "text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] items-center gap-x-0 flex flex-col auto-cols-[minmax(0px,1fr)] col-end-[-2] col-start-2 grid-cols-[repeat(12,minmax(0px,1fr))] grid-rows-[auto] justify-center gap-y-0"
        }
      >
        {renderTabNavigation()}
        <ContentGrid
          variant={props.contentGridVariant}
          cardVariant={props.cardVariant}
          cardPlanIcon={props.cardPlanIcon}
          cardPlanTitle={props.cardPlanTitle}
          cardPlanDescription={props.cardPlanDescription}
          cardPlanPrice={props.cardPlanPrice}
          cardPlanPriceDetails={props.cardPlanPriceDetails}
          cardPlanButtonText={props.cardPlanButtonText}
          cardPlanButtonUrl={props.cardPlanButtonUrl}
          teamPlanIcon={props.teamPlanIcon}
          teamPlanTitle={props.teamPlanTitle}
          teamPlanDescription={props.teamPlanDescription}
          teamPlanPrice={props.teamPlanPrice}
          teamPlanPriceDetails={props.teamPlanPriceDetails}
          teamPlanButtonText={props.teamPlanButtonText}
          teamPlanButtonUrl={props.teamPlanButtonUrl}
          enterprisePlanIcon={props.enterprisePlanIcon}
          enterprisePlanTitle={props.enterprisePlanTitle}
          enterprisePlanDescription={props.enterprisePlanDescription}
          enterprisePlanButtonText={props.enterprisePlanButtonText}
          enterprisePlanButtonUrl={props.enterprisePlanButtonUrl}
  tabPanelRole={props.tabPanelRole}
          tabPanelClassName={props.tabPanelClassName}
        />
      </div>
    );
  }

  if (props.variant === "use-cases") {
    return (
      <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
        <ContentGrid
          variant={props.contentGridVariant}
          useCaseCards={props.useCaseCards}
        />
      </div>
    );
  }

  if (props.variant === "security") {
    return (
      <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
        <ContentGrid
          variant={props.contentGridVariant}
          securityItems={props.securityItems}
          navigationIcons={props.navigationIcons}
        />
      </div>
    );
  }
  if (props.variant === "how-it-works") {
    const steps = props.howItWorksSteps ?? [];
    return (
      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
        <div className="text-[19.0491px] box-border caret-transparent flex flex-col leading-[30.4786px] gap-y-[40.3929px] md:text-[19.8571px] md:leading-[31.7714px] md:gap-y-[62.2857px]">
          {steps.map((step, i) => (
            <div
              key={i}
              className="text-[19.0491px] box-border caret-transparent flex flex-col leading-[30.4786px] gap-y-[24px] md:text-[19.8571px] md:leading-[31.7714px] md:flex-row md:items-start md:gap-x-[62.2857px] md:gap-y-0"
            >
              {/* Step number */}
              <div className="text-zinc-400 text-[12px] box-border caret-transparent font-semibold leading-[30.4786px] tracking-[0.12em] uppercase shrink-0 md:text-[19.8571px] md:leading-[31.7714px] md:w-[65.5714px] md:pt-[6px]">
                {step.number}
              </div>
              {/* Text */}
              <div className="text-[19.0491px] box-border caret-transparent flex flex-col leading-[30.4786px] gap-y-[16.1964px] md:text-[19.8571px] md:leading-[31.7714px] md:gap-y-[20.2143px]">
                <div className="text-[23.442px] font-medium box-border caret-transparent flow-root leading-[25.7862px] font-playfair md:text-[30.7143px] md:leading-[33.7857px]">
                  <h3 className="text-neutral-900 text-[23.442px] box-border caret-transparent flow-root leading-[25.7862px] font-playfair font-medium md:text-[30.7143px] md:leading-[33.7857px]">
                    {step.title}
                  </h3>
                </div>
                <div className="text-zinc-600 text-[15px] box-border caret-transparent leading-6">
                  <p className="box-border caret-transparent flow-root">{step.body}</p>
                </div>
                {step.bullets.length > 0 && (
                  <ul className="text-[19.0491px] box-border caret-transparent flex flex-col leading-[30.4786px] gap-y-[12px] md:text-[19.8571px] md:leading-[31.7714px] md:gap-y-[14px]">
                    {step.bullets.map((b, j) => (
                      <li key={j} className="text-[15px] box-border caret-transparent flex items-start leading-6 gap-x-3">
                        <span className="text-[19.0491px] box-border caret-transparent shrink-0 leading-[30.4786px] mt-[9px] w-[6px] h-[6px] rounded-full bg-stone-300 md:text-[19.8571px] md:leading-[31.7714px]" />
                        <span className="text-zinc-600">
                          <strong className="text-neutral-800 font-semibold">{b.title}</strong>{" "}{b.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

 if (props.variant === "faq") {
    return (
      <div className="relative text-[19.0491px] box-border caret-transparent leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]">
        <ContentGrid
          variant={props.contentGridVariant}
          faqItems={props.faqItems}
        />
        {props.showSideArticle && (
          <>
            <div className="absolute text-[19.0491px] box-border caret-transparent gap-x-[28.1964px] hidden flex-col leading-[30.4786px] gap-y-[28.1964px] w-[216px] left-[0%] bottom-[10%] md:text-[19.8571px] md:gap-x-[31.4286px] md:flex md:leading-[31.7714px] md:gap-y-[31.4286px]">
              <article className="static text-base box-content caret-black gap-x-[normal] flex-row shrink justify-normal leading-[normal] max-w-none min-h-0 min-w-0 opacity-100 gap-y-[normal] text-start visible w-auto md:relative md:text-[19.8571px] md:aspect-auto md:box-border md:caret-transparent md:gap-x-4 md:flex-col md:shrink-0 md:justify-between md:leading-[31.7714px] md:max-w-full md:min-h-[auto] md:min-w-[auto] md:opacity-0 md:overscroll-x-auto md:overscroll-y-auto md:gap-y-4 md:snap-align-none md:snap-normal md:snap-none md:text-left md:decoration-auto md:underline-offset-auto md:invisible md:w-[216px] md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
                <div className="static bg-transparent shadow-none box-content caret-black gap-x-[normal] block flex-row h-auto justify-normal gap-y-[normal] w-auto rounded-none md:relative md:aspect-auto md:bg-white md:shadow-[rgba(0,0,0,0.05)_0px_4px_24px_0px] md:box-border md:caret-transparent md:gap-x-4 md:flex md:flex-col md:h-full md:justify-between md:overscroll-x-auto md:overscroll-y-auto md:gap-y-4 md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:border md:border-stone-200 md:[mask-position:0%] md:bg-left-top md:p-4 md:scroll-m-0 md:scroll-p-[auto] md:rounded-2xl md:border-solid">
                  <div className="[align-items:normal] box-content caret-black gap-x-[normal] block flex-nowrap justify-normal min-h-0 min-w-0 gap-y-[normal] mt-0 md:items-center md:aspect-auto md:box-border md:caret-transparent md:gap-x-2 md:flex md:flex-wrap md:justify-start md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:gap-y-2 md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:mt-1 md:scroll-m-0 md:scroll-p-[auto]">
                    <div className="text-base font-normal box-content caret-black block tracking-[normal] leading-[normal] min-h-0 min-w-0 md:text-xs md:font-semibold md:aspect-auto md:box-border md:caret-transparent md:flow-root md:tracking-[0.12px] md:leading-[19.2px] md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] before:md:accent-auto before:md:box-border before:md:caret-transparent before:md:text-neutral-900 before:md:table before:md:text-xs before:md:not-italic before:md:normal-nums before:md:font-semibold before:md:tracking-[0.12px] before:md:leading-[19.2px] before:md:list-outside before:md:list-disc before:md:mb-[-4.91375px] before:md:pointer-events-auto before:md:text-left before:md:no-underline before:md:indent-[0px] before:md:normal-case before:md:invisible before:md:border-separate before:md:font-sans after:md:accent-auto after:md:box-border after:md:caret-transparent after:md:text-neutral-900 after:md:table after:md:text-xs after:md:not-italic after:md:normal-nums after:md:font-semibold after:md:tracking-[0.12px] after:md:leading-[19.2px] after:md:list-outside after:md:list-disc after:md:mb-[-5.03375px] after:md:pointer-events-auto after:md:text-left after:md:no-underline after:md:indent-[0px] after:md:normal-case after:md:invisible after:md:border-separate after:md:font-sans">
                      {props.sideArticleTitle || "Getting Started with 2Hands"}
                    </div>
                  </div>
                  <div className="box-content caret-black gap-x-[normal] block basis-auto flex-row grow-0 justify-normal min-h-0 min-w-0 gap-y-[normal] w-auto md:aspect-auto md:box-border md:caret-transparent md:gap-x-4 md:flex md:basis-[0%] md:flex-col md:grow md:justify-between md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:gap-y-4 md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
                    <p className="text-black text-base box-content caret-black block tracking-[normal] leading-[normal] min-h-0 min-w-0 md:text-zinc-600 md:text-xs md:aspect-auto md:box-border md:caret-transparent md:flow-root md:tracking-[0.12px] md:leading-[19.2px] md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] before:md:accent-auto before:md:box-border before:md:caret-transparent before:md:text-zinc-600 before:md:table before:md:text-xs before:md:not-italic before:md:normal-nums before:md:font-normal before:md:tracking-[0.12px] before:md:leading-[19.2px] before:md:list-outside before:md:list-disc before:md:mb-[-4.91375px] before:md:pointer-events-auto before:md:text-left before:md:no-underline before:md:indent-[0px] before:md:normal-case before:md:invisible before:md:border-separate before:md:font-sans after:md:accent-auto after:md:box-border after:md:caret-transparent after:md:text-zinc-600 after:md:table after:md:text-xs after:md:not-italic after:md:normal-nums after:md:font-normal after:md:tracking-[0.12px] after:md:leading-[19.2px] after:md:list-outside after:md:list-disc after:md:mb-[-5.03375px] after:md:pointer-events-auto after:md:text-left after:md:no-underline after:md:indent-[0px] after:md:normal-case after:md:invisible after:md:border-separate after:md:font-sans">
                      {props.sideArticleDescription ||
                        "This article explains how to get started with 2Hands, deploy your first AI agent, and automate work across your tools."}
                    </p>
                    <div className="box-content caret-black min-h-0 min-w-0 md:aspect-auto md:box-border md:caret-transparent md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
                      <div className="static text-black text-base [align-items:normal] bg-transparent shadow-none box-content caret-black block justify-normal leading-[normal] min-h-0 text-start align-baseline rounded-none md:relative md:text-neutral-600 md:text-xs md:items-center md:aspect-auto md:bg-white md:shadow-[rgb(255,255,255)_0px_0px_0px_0px,rgb(222,220,209)_0px_0px_0px_1px] md:box-border md:caret-transparent md:inline-flex md:justify-center md:leading-3 md:min-h-7 md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:text-center md:decoration-auto md:underline-offset-auto md:align-middle md:[mask-position:0%] md:bg-left-top md:p-2 md:scroll-m-0 md:scroll-p-[auto] md:rounded-md">
                        <div className="box-content caret-black block md:aspect-auto md:box-border md:caret-transparent md:hidden md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]"></div>
                        <div className="font-normal box-content caret-black block tracking-[normal] leading-[normal] min-h-0 min-w-0 px-0 md:font-medium md:aspect-auto md:box-border md:caret-transparent md:flow-root md:tracking-[0.12px] md:leading-[19.2px] md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:px-1 md:scroll-m-0 md:scroll-p-[auto] before:md:accent-auto before:md:box-border before:md:caret-transparent before:md:text-neutral-600 before:md:table before:md:text-xs before:md:not-italic before:md:normal-nums before:md:font-medium before:md:tracking-[0.12px] before:md:leading-[19.2px] before:md:list-outside before:md:list-disc before:md:mb-[-4.91375px] before:md:pointer-events-auto before:md:text-center before:md:no-underline before:md:indent-[0px] before:md:normal-case before:md:invisible before:md:border-separate before:md:font-sans after:md:accent-auto after:md:box-border after:md:caret-transparent after:md:text-neutral-600 after:md:table after:md:text-xs after:md:not-italic after:md:normal-nums after:md:font-medium after:md:tracking-[0.12px] after:md:leading-[19.2px] after:md:list-outside after:md:list-disc after:md:mb-[-5.03375px] after:md:pointer-events-auto after:md:text-center after:md:no-underline after:md:indent-[0px] after:md:normal-case after:md:invisible after:md:border-separate after:md:font-sans">
                          {props.sideArticleButtonText || "Read more"}
                        </div>
                        <div className="static box-content caret-black h-auto w-auto z-auto rounded-none inset-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:h-full md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:z-[3] md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] md:rounded-md md:inset-[0%]">
                          <a
                            href={
                              props.sideArticleButtonUrl ||
                              "/docs/getting-started"
                            }
                            className="static box-content caret-black inline h-auto max-w-none outline-offset-0 w-auto rounded-none inset-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:block md:h-full md:max-w-full md:outline-offset-4 md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] md:rounded-md md:inset-[0%]"
                          >
                            <span className="static box-content caret-black inline h-auto text-wrap w-auto mx-0 top-auto inset-x-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:block md:h-px md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:text-nowrap md:w-px md:overflow-hidden md:[mask-position:0%] md:bg-left-top md:mx-auto md:scroll-m-0 md:scroll-p-[auto] md:top-[0%] md:inset-x-[0%]">
                              Read more
                            </span>
                          </a>
                          <button
                            type="button"
                            className="static bg-zinc-100 caret-black inline-block h-auto outline-offset-0 w-auto rounded-none inset-auto md:absolute md:aspect-auto md:bg-transparent md:caret-transparent md:hidden md:h-full md:outline-offset-4 md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:[mask-position:0%] md:bg-left-top md:p-0 md:scroll-m-0 md:scroll-p-[auto] md:rounded-md md:inset-[0%]"
                          >
                            <span className="static box-content caret-black inline h-auto text-wrap w-auto mx-0 top-auto inset-x-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:block md:h-px md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:text-nowrap md:w-px md:overflow-hidden md:[mask-position:0%] md:bg-left-top md:mx-auto md:scroll-m-0 md:scroll-p-[auto] md:top-[0%] md:inset-x-[0%]">
                              Read more
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </div>
             <div className="absolute text-[19.0491px] box-border caret-transparent gap-x-[28.1964px] hidden flex-col leading-[30.4786px] gap-y-[28.1964px] w-[216px] right-[0%] top-[0%] md:text-[19.8571px] md:gap-x-[31.4286px] md:flex md:leading-[31.7714px] md:gap-y-[31.4286px]"></div>
            <div className="text-[19.0491px] box-border caret-transparent block leading-[30.4786px] outline-offset-4 w-full mt-[52.5893px] md:text-[19.8571px] md:hidden md:leading-[31.7714px] md:mt-[62.2857px]">
              <div className="text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] invisible md:text-[19.8571px] md:leading-[31.7714px] md:visible"></div>
              <div className="text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] invisible md:text-[19.8571px] md:leading-[31.7714px] md:visible"></div>
              <div className="[mask-image:linear-gradient(90deg,rgba(0,0,0,0)_0%,rgb(0,0,0)_3%,rgb(0,0,0)_97%,rgba(0,0,0,0)_100%)] text-[19.0491px] items-center box-border caret-transparent flex-col justify-center leading-[30.4786px] invisible -mx-8 px-4 py-2 md:text-[19.8571px] md:leading-[31.7714px] md:visible">
                <div className="text-[19.0491px] items-center box-border caret-transparent flex justify-start leading-[30.4786px] invisible w-full md:text-[19.8571px] md:leading-[31.7714px] md:visible"></div>
              </div>
              <div className="text-[19.0491px] box-border caret-transparent gap-x-6 hidden justify-between leading-[30.4786px] gap-y-6 invisible w-full mt-[28.1964px] md:text-[19.8571px] md:leading-[31.7714px] md:visible md:mt-[31.4286px]">
                <div className="relative text-neutral-600 text-[19.0491px] items-center aspect-square bg-white shadow-[rgb(255,255,255)_0px_0px_0px_0px,rgb(222,220,209)_0px_0px_0px_1px] box-border caret-transparent inline-flex shrink-0 justify-center leading-[30.4786px] opacity-30 pointer-events-none align-middle invisible w-10 rounded-xl md:text-[19.8571px] md:leading-[31.7714px] md:visible">
                  <div className="relative text-[19.0491px] aspect-square box-border caret-transparent leading-[30.4786px] invisible w-4 md:text-[19.8571px] md:leading-[31.7714px] md:visible">
                    <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] invisible md:text-[19.8571px] md:leading-[31.7714px] md:visible">
                      <img
                        src="https://c.animaapp.com/mmaathg2cJ7hC9/assets/icon-49.svg"
                        alt="Icon"
                        className="text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] invisible w-full md:text-[19.8571px] md:leading-[31.7714px] md:visible"
                      />
                    </div>
                  </div>
                  <div className="absolute text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] invisible w-full z-[3] rounded-xl inset-[0%] md:text-[19.8571px] md:leading-[31.7714px] md:visible">
                    <a
                      href="#"
                      className="absolute text-[19.0491px] box-border caret-transparent hidden h-full leading-[30.4786px] max-w-full outline-offset-4 invisible w-full rounded-xl inset-[0%] md:text-[19.8571px] md:leading-[31.7714px] md:visible"
                    ></a>
                    <button
                      type="button"
                      className="absolute text-[19.0491px] bg-transparent caret-transparent block h-full leading-[30.4786px] outline-offset-4 invisible w-full p-0 rounded-xl inset-[0%] md:text-[19.8571px] md:leading-[31.7714px] md:visible"
                    ></button>
                  </div>
                </div>
                <div className="text-[19.0491px] items-center box-border caret-transparent gap-x-3 inline-flex basis-[0%] grow flex-wrap justify-center leading-[30.4786px] gap-y-3 invisible md:text-[19.8571px] md:leading-[31.7714px] md:visible"></div>
                <div className="relative text-neutral-600 text-[19.0491px] items-center aspect-square bg-white shadow-[rgb(255,255,255)_0px_0px_0px_0px,rgb(222,220,209)_0px_0px_0px_1px] box-border caret-transparent inline-flex shrink-0 justify-center leading-[30.4786px] opacity-30 pointer-events-none align-middle invisible w-10 rounded-xl md:text-[19.8571px] md:leading-[31.7714px] md:visible">
                  <div className="relative text-[19.0491px] aspect-square box-border caret-transparent leading-[30.4786px] invisible w-4 md:text-[19.8571px] md:leading-[31.7714px] md:visible">
                    <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] invisible md:text-[19.8571px] md:leading-[31.7714px] md:visible">
                      <img
                        src="https://c.animaapp.com/mmaathg2cJ7hC9/assets/icon-50.svg"
                        alt="Icon"
                        className="text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] invisible w-full md:text-[19.8571px] md:leading-[31.7714px] md:visible"
                      />
                    </div>
                  </div>
                  <div className="absolute text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] invisible w-full z-[3] rounded-xl inset-[0%] md:text-[19.8571px] md:leading-[31.7714px] md:visible">
                    <a
                      href="#"
                      className="absolute text-[19.0491px] box-border caret-transparent hidden h-full leading-[30.4786px] max-w-full outline-offset-4 invisible w-full rounded-xl inset-[0%] md:text-[19.8571px] md:leading-[31.7714px] md:visible"
                    ></a>
                    <button
                      type="button"
                      className="absolute text-[19.0491px] bg-transparent caret-transparent block h-full leading-[30.4786px] outline-offset-4 invisible w-full p-0 rounded-xl inset-[0%] md:text-[19.8571px] md:leading-[31.7714px] md:visible"
                    ></button>
                  </div>
                </div>
              </div>  </div>
          </>
        )}
      </div>
    );
  }

  return null;
};
