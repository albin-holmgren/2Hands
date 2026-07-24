import React from "react";
import { Card } from "@/components/marketing/Card";
import { AnimatedFAQ } from "@/components/marketing/AnimatedFAQ";
import { Shield, CheckCircle, Building2, Lock, Users, FileCheck } from "lucide-react";

export type ContentGridProps = {
  variant?: string;
  tabPanelRole?: string;
  tabPanelClassName?: string;
  cardVariant?: string;
  cardPromptTitle?: string;
  cardPromptContent?: React.ReactNode;
  cardWorkingFolderTitle?: string;
  cardWorkingFolderPath?: string;
  cardCodeBlockContent?: React.ReactNode;
  cardIconUrls?: string[];
  cardPlanIcon?: string;
  cardPlanTitle?: string;
  cardPlanDescription?: string;
  cardPlanPrice?: string;
  cardPlanPriceDetails?: string;
  cardPlanButtonText?: string;
  cardPlanButtonUrl?: string;
  cardUseCaseIcon?: string;
  cardUseCaseCategory?: string;
  cardUseCaseTitle?: string;
  cardUseCaseDescription?: string;
  cardUseCaseButtonText?: string;
  cardUseCaseButtonUrl?: string;
  videoSrc?: string;
  contentTitle?: string;
  contentDescription?: string;
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
  documentTitle?: string;
  documentSubtitle?: string;
  documentContent?: React.ReactNode;
  documentIconUrls?: string[];
  securityTitle?: string;
  securityItems?: Array<{
    icon: string;
    iconName?: "shield" | "check" | "building" | "lock" | "users" | "fileCheck";
    title: string;
    description: string;
  }>;
  navigationIcons?: string[];
  useCaseCards?: Array<{
    icon: string;
    category: string;
    title: string;
    description: string;
    buttonText: string;
    buttonUrl: string;
  }>;
  faqItems?: Array<{
    question: string;
    answer: React.ReactNode;
  }>;
};

export const ContentGrid = (props: ContentGridProps) => {
  if (props.variant === "detailed-card") {
    return (
      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] relative col-end-[-1] col-start-1 w-full z-[1]">
        <div
          role={props.tabPanelRole || "tabpanel"}
          className={
            props.tabPanelClassName ||
            "text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] relative w-full z-[1]"
          }
        >
          <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="relative text-[19.0491px] items-center box-border caret-transparent flex flex-col justify-center leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]">
              <div className="box-border caret-transparent text-[19.0491px] hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
              <div className="text-[19.0491px] box-border caret-transparent gap-x-8 flex flex-col auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(12,minmax(0px,1fr))] grid-rows-[auto] leading-[30.4786px] gap-y-[40.3929px] w-full md:text-[19.8571px] md:grid md:leading-[31.7714px] md:gap-y-[46.8571px]">
                <Card
                  variant={(props.cardVariant || "empty") as any}
                  promptTitle={props.cardPromptTitle}
                  promptContent={props.cardPromptContent}
                  workingFolderTitle={props.cardWorkingFolderTitle}
                  workingFolderPath={props.cardWorkingFolderPath}
                  codeBlockContent={props.cardCodeBlockContent}
                  iconUrls={props.cardIconUrls}
                />
                <div className="text-[19.0491px] box-border caret-transparent gap-x-6 grid auto-cols-[minmax(0px,1fr)] col-end-[-3] col-start-3 grid-cols-[repeat(auto-fill,minmax(min(max(128px,100%_+_0px),100%),1fr))] grid-rows-[auto] leading-[30.4786px] gap-y-6 md:text-[19.8571px] md:gap-x-8 md:grid-cols-[repeat(auto-fill,minmax(min(max(128px,50%_-_16px),100%),1fr))] md:leading-[31.7714px] md:gap-y-8">
                  <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                    <div className="text-[20.2455px] font-medium box-border caret-transparent leading-[24.2946px] max-w-none mb-4 font-serif md:text-[24.2857px] md:leading-[29.1429px] md:max-w-[391.589px]">
                      <h3 className="text-[20.2455px] box-border caret-transparent flow-root leading-[24.2946px] md:text-[24.2857px] md:leading-[29.1429px] before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-[20.2455px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[24.2946px] before:list-outside before:list-disc before:mb-[-4.24487px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-serif before:md:text-[24.2857px] before:md:leading-[29.1429px] before:md:mb-[-5.09107px] after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-[20.2455px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[24.2946px] after:list-outside after:list-disc after:mb-[-4.44732px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-serif after:md:text-[24.2857px] after:md:leading-[29.1429px] after:md:mb-[-5.33393px]">
                        {props.contentTitle}
                      </h3>
                    </div>
                  </div>
                  <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                    <div className="text-zinc-600 text-[15px] box-border caret-transparent leading-6">
                      <p className="box-border caret-transparent flow-root before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-[15px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-6 before:list-outside before:list-disc before:mb-[-6.15px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-[15px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-6 after:list-outside after:list-disc after:mb-[-6.3px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                        {props.contentDescription}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (props.variant === "video") {
    return (
      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] relative col-end-[-1] col-start-1 w-full z-[1]">
        <div
          role={props.tabPanelRole || "tabpanel"}
          className={
            props.tabPanelClassName ||
            "relative text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] w-full z-[1] md:text-[19.8571px] md:leading-[31.7714px]"
          }
        >
          <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="relative text-[19.0491px] items-center box-border caret-transparent flex flex-col justify-center leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]">
              <div className="box-border caret-transparent text-[19.0491px] hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
              <div className="text-[19.0491px] box-border caret-transparent gap-x-8 flex flex-col auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(12,minmax(0px,1fr))] grid-rows-[auto] leading-[30.4786px] gap-y-[40.3929px] w-full md:text-[19.8571px] md:grid md:leading-[31.7714px] md:gap-y-[46.8571px]">
                <div className="relative text-[4.5px] aspect-video box-border caret-transparent col-end-[-2] col-start-2 leading-[7.2px] w-full overflow-hidden rounded-2xl md:text-base md:leading-[25.6px] md:rounded-[29.7143px]">
                  <div className="text-[4.5px] box-border caret-transparent leading-[7.2px] md:text-base md:leading-[25.6px]">
                    <video
                      src={props.videoSrc}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="text-[4.5px] bg-[lab(6.29227_-0.162095_0.605655_/_0.1)] box-border caret-transparent inline-block h-full leading-[7.2px] object-cover w-full md:text-base md:leading-[25.6px]"
                    ></video>
                  </div>
                  <div className="absolute text-[4.5px] shadow-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.15)_0px_0px_0px_1px_inset] box-border caret-transparent h-full leading-[7.2px] pointer-events-none w-full z-[3] rounded-[16.7857px] inset-[0%] md:text-base md:leading-[25.6px] md:rounded-[29.7143px]"></div>
                </div>
                <div className="text-[19.0491px] box-border caret-transparent gap-x-6 grid auto-cols-[minmax(0px,1fr)] col-end-[-3] col-start-3 grid-cols-[repeat(auto-fill,minmax(min(max(128px,100%_+_0px),100%),1fr))] grid-rows-[auto] leading-[30.4786px] gap-y-6 md:text-[19.8571px] md:gap-x-8 md:grid-cols-[repeat(auto-fill,minmax(min(max(128px,50%_-_16px),100%),1fr))] md:leading-[31.7714px] md:gap-y-8">
                  <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                    <div className="text-[20.2455px] font-medium box-border caret-transparent leading-[24.2946px] max-w-none mb-4 font-serif md:text-[24.2857px] md:leading-[29.1429px] md:max-w-[391.589px]">
                      <h3 className="text-[20.2455px] box-border caret-transparent flow-root leading-[24.2946px] md:text-[24.2857px] md:leading-[29.1429px] before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-[20.2455px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[24.2946px] before:list-outside before:list-disc before:mb-[-4.24487px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-serif before:md:text-[24.2857px] before:md:leading-[29.1429px] before:md:mb-[-5.09107px] after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-[20.2455px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[24.2946px] after:list-outside after:list-disc after:mb-[-4.44732px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-serif after:md:text-[24.2857px] after:md:leading-[29.1429px] after:md:mb-[-5.33393px]">
                        {props.contentTitle}
                      </h3>
                    </div>
                  </div>
                  <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                    <div className="text-zinc-600 text-[15px] box-border caret-transparent leading-6">
                      <p className="box-border caret-transparent flow-root before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-[15px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-6 before:list-outside before:list-disc before:mb-[-6.15px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-[15px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-6 after:list-outside after:list-disc after:mb-[-6.3px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                        {props.contentDescription}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (props.variant === "document") {
    return (
      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] relative col-end-[-1] col-start-1 w-full z-[1]">
        <div
          role={props.tabPanelRole || "tabpanel"}
          className={
            props.tabPanelClassName ||
            "relative text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] w-full z-[1] md:text-[19.8571px] md:leading-[31.7714px]"
          }
        >
          <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="relative text-[19.0491px] items-center box-border caret-transparent flex flex-col justify-center leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]">
              <div className="box-border caret-transparent text-[19.0491px] hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
              <div className="text-[19.0491px] box-border caret-transparent gap-x-8 flex flex-col auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(12,minmax(0px,1fr))] grid-rows-[auto] leading-[30.4786px] gap-y-[40.3929px] w-full md:text-[19.8571px] md:grid md:leading-[31.7714px] md:gap-y-[46.8571px]">
                <div className="relative text-[4.5px] aspect-video box-border caret-transparent col-end-[-2] col-start-2 leading-[7.2px] w-full overflow-hidden rounded-2xl md:text-base md:leading-[25.6px] md:rounded-[29.7143px]">
                  <div className="text-[4.5px] box-border caret-transparent leading-[7.2px] md:text-base md:leading-[25.6px]">
                    <div className="text-[4.5px] box-border caret-transparent leading-[7.2px] md:text-base md:leading-[25.6px]">
                      <div className="relative text-[4.5px] aspect-video box-border caret-transparent leading-[7.2px] w-full overflow-hidden rounded-2xl md:text-base md:leading-[25.6px] md:rounded-[29.7143px]">
                        <div className="relative text-[4.5px] box-border caret-transparent grid flex-col auto-cols-[1fr] grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] grid-rows-[auto] h-full leading-[7.2px] w-full z-[9999] md:text-base md:flex-row md:leading-[25.6px]">
                          <div className="text-[4.5px] items-start box-border caret-transparent gap-x-[2.25px] flex flex-col col-end-5 col-start-1 row-end-2 row-start-1 h-full justify-center leading-[7.2px] gap-y-[2.25px] w-full pl-[18px] py-[9px] md:text-base md:gap-x-2 md:leading-[25.6px] md:gap-y-2 md:pl-16 md:py-8"></div>
                          <div className="text-[4.5px] box-border caret-transparent col-end-13 col-start-5 row-end-2 row-start-1 h-full leading-[7.2px] overflow-x-hidden overflow-y-scroll w-full p-[18px] md:text-base md:leading-[25.6px] md:p-16">
                            <div className="text-[4.5px] box-border caret-transparent h-full leading-[7.2px] md:text-base md:leading-[25.6px]">
                              <div className="text-[4.5px] box-border caret-transparent leading-[7.2px] pb-[28.1964px] md:text-base md:leading-[25.6px] md:pb-16">
                                <div className="text-[4.5px] box-border caret-transparent hidden leading-[7.2px] md:text-base md:leading-[25.6px]"></div>
                                <div className="text-[4.5px] bg-stone-50 box-border caret-transparent leading-[7.2px] p-[13.5px] rounded-lg md:text-base md:leading-[25.6px] md:p-12 md:rounded-xl">
                                  <div className="text-[4.5px] box-border caret-transparent leading-[7.2px] md:text-base md:leading-[25.6px]">
                                    <h3 className="text-[10.35px] font-medium box-border caret-transparent flow-root leading-[13.455px] mb-[8.28px] font-serif md:text-[36.8px] md:leading-[47.84px] md:mb-[29.44px] before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-[10.35px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[13.455px] before:list-outside before:list-disc before:mb-[-2.68225px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-serif before:md:text-[36.8px] before:md:leading-[47.84px] before:md:mb-[-9.56206px] after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-[10.35px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[13.455px] after:list-outside after:list-disc after:mb-[-2.78575px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-serif after:md:text-[36.8px] after:md:leading-[47.84px] after:md:mb-[-9.93006px]">
                                      {props.documentTitle}
                                    </h3>
                                    <p className="text-[4.5px] box-border caret-transparent flow-root leading-[7.2px] mb-[4.5px] md:text-base md:leading-[25.6px] md:mb-4 before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-[4.5px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-[7.2px] before:list-outside before:list-disc before:mb-[-1.83875px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans before:md:text-base before:md:leading-[25.6px] before:md:mb-[-6.55688px] after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-[4.5px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-[7.2px] after:list-outside after:list-disc after:mb-[-1.88375px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans after:md:text-base after:md:leading-[25.6px] after:md:mb-[-6.71688px]">
                                      {props.documentSubtitle}
                                    </p>
                                    {props.documentContent}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="absolute text-[4.5px] bg-stone-300 box-border caret-transparent h-full leading-[7.2px] w-full inset-[0%] md:text-base md:leading-[25.6px]"></div>
                        <div className="absolute text-[4.5px] box-border caret-transparent h-full leading-[7.2px] w-full inset-[0%] md:text-base md:leading-[25.6px]">
                          {props.documentIconUrls?.map((url, index) => (
                            <img
                              key={index}
                              src={url}
                              alt="Icon"
                              className={
                                index === (props.documentIconUrls?.length ?? 0) - 1
                                  ? "absolute text-[color(srgb_1_1_1_/_0.1)] text-[4.5px] box-border caret-transparent h-full leading-[7.2px] object-cover w-full inset-[0%] md:text-base md:leading-[25.6px]"
                                  : "absolute text-[color(srgb_1_1_1_/_0.1)] text-[4.5px] box-border caret-transparent hidden h-full leading-[7.2px] object-cover w-full inset-[0%] md:text-base md:leading-[25.6px]"
                              }
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute text-[4.5px] shadow-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.15)_0px_0px_0px_1px_inset] box-border caret-transparent hidden h-full leading-[7.2px] pointer-events-none w-full z-[3] rounded-[16.7857px] inset-[0%] md:text-base md:leading-[25.6px] md:rounded-[29.7143px]"></div>
                </div>
                <div className="text-[19.0491px] box-border caret-transparent gap-x-6 grid auto-cols-[minmax(0px,1fr)] col-end-[-3] col-start-3 grid-cols-[repeat(auto-fill,minmax(min(max(128px,100%_+_0px),100%),1fr))] grid-rows-[auto] leading-[30.4786px] gap-y-6 md:text-[19.8571px] md:gap-x-8 md:grid-cols-[repeat(auto-fill,minmax(min(max(128px,50%_-_16px),100%),1fr))] md:leading-[31.7714px] md:gap-y-8">
                  <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                    <div className="text-[20.2455px] font-medium box-border caret-transparent leading-[24.2946px] max-w-none mb-4 font-serif md:text-[24.2857px] md:leading-[29.1429px] md:max-w-[391.589px]">
                      <h3 className="text-[20.2455px] box-border caret-transparent flow-root leading-[24.2946px] md:text-[24.2857px] md:leading-[29.1429px] before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-[20.2455px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[24.2946px] before:list-outside before:list-disc before:mb-[-4.24487px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-serif before:md:text-[24.2857px] before:md:leading-[29.1429px] before:md:mb-[-5.09107px] after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-[20.2455px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[24.2946px] after:list-outside after:list-disc after:mb-[-4.44732px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-serif after:md:text-[24.2857px] after:md:leading-[29.1429px] after:md:mb-[-5.33393px]">
                        {props.contentTitle}
                      </h3>
                    </div>
                  </div>
                  <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                    <div className="text-zinc-600 text-[15px] box-border caret-transparent leading-6">
                      <p className="box-border caret-transparent flow-root before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-[15px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-6 before:list-outside before:list-disc before:mb-[-6.15px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-[15px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-6 after:list-outside after:list-disc after:mb-[-6.3px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                        {props.contentDescription}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

if (props.variant === "pricing-pro") {
    return (
      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] relative col-end-[-1] col-start-1 w-full z-[1]">
        <div
          role={props.tabPanelRole || "tabpanel"}
          className={
            props.tabPanelClassName ||
            "text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] relative w-full z-[1]"
          }
        >
          <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] max-w-[1192px] mx-auto">
              <div className="box-border caret-transparent text-[19.0491px] hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
              <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] contents">
                <div className="text-[19.0491px] box-border caret-transparent grid auto-cols-[minmax(0px,1fr)] grid-rows-[auto] leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] relative gap-x-8 grid-cols-[repeat(auto-fit,minmax(min(max(288px,33.3333%_-_21.3333px),100%),1fr))] gap-y-8">
                  <Card
                    variant={(props.cardVariant || "empty") as any}
                    planIcon={props.cardPlanIcon}
                    planTitle={props.cardPlanTitle}
                    planDescription={props.cardPlanDescription}
                    planPrice={props.cardPlanPrice}
                    planPriceDetails={props.cardPlanPriceDetails}
                    planButtonText={props.cardPlanButtonText}
                    planButtonUrl={props.cardPlanButtonUrl}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (props.variant === "pricing-team-enterprise") {
    return (
      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] relative col-end-[-1] col-start-1 w-full z-[1]">
        <div
          role={props.tabPanelRole || "tabpanel"}
          className={
            props.tabPanelClassName ||
            "relative text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] w-full z-[1] md:text-[19.8571px] md:leading-[31.7714px]"
          }
        >
          <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] max-w-[960px] mx-auto">
              <div className="box-border caret-transparent text-[19.0491px] hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
              <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] contents">
                <div className="box-border caret-transparent relative text-[19.0491px] gap-x-8 grid auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(auto-fit,minmax(min(max(288px,50%_-_16px),100%),1fr))] grid-rows-[auto] leading-[30.4786px] gap-y-8 md:text-[19.8571px] md:leading-[31.7714px]">
                  <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] contents">
                    <div className="relative text-[19.0491px] items-start bg-white dark:bg-[#2C2B27] box-border caret-transparent gap-x-6 grid auto-cols-[1fr] row-start-[span_5] grid-cols-[1fr] grid-rows-subgrid justify-start leading-[30.4786px] ml-[-16.7857px] mr-[-16.7857px] min-w-full gap-y-6 text-left border border-stone-200 dark:border-[#3A3833] p-6 rounded-[16.3929px] border-solid md:text-[19.8571px] md:leading-[31.7714px] md:mx-0 md:p-[31.4286px] md:rounded-[22.8571px]">
                      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] max-w-16 md:text-[19.8571px] md:leading-[31.7714px]">
                        <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] contents">
                          <img
                            src={props.teamPlanIcon}
                            alt="Icon"
                            className="text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]"
                          />
                        </div>
                      </div>
                      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                        <h3 className="text-[23.442px] font-medium box-border caret-transparent flow-root leading-[25.7862px] font-serif md:text-[30.7143px] md:leading-[33.7857px] before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-[23.442px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[25.7862px] before:list-outside before:list-disc before:mb-[-3.74826px] before:pointer-events-auto before:text-left before:indent-[0px] before:normal-case before:visible before:border-separate before:font-serif before:md:text-[30.7143px] before:md:leading-[33.7857px] before:md:mb-[-4.90424px] after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-[23.442px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[25.7862px] after:list-outside after:list-disc after:mb-[-3.98268px] after:pointer-events-auto after:text-left after:indent-[0px] after:normal-case after:visible after:border-separate after:font-serif after:md:text-[30.7143px] after:md:leading-[33.7857px] after:md:mb-[-5.21138px]">
                          {props.teamPlanTitle}
                        </h3>
                      </div>
                      <div className="text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] text-[15px] box-border caret-transparent leading-6">
                        <p className="box-border caret-transparent flow-root before:accent-auto before:box-border before:caret-transparent before:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] before:table before:text-[15px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-6 before:list-outside before:list-disc before:mb-[-6.15px] before:pointer-events-auto before:text-left before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] after:table after:text-[15px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-6 after:list-outside after:list-disc after:mb-[-6.3px] after:pointer-events-auto after:text-left after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                          {props.teamPlanDescription}
                        </p>
                      </div>
                      <div className="text-[19.0491px] items-start box-border caret-transparent flex flex-col justify-center leading-[30.4786px] gap-y-4 text-start mb-2 md:text-[19.8571px] md:leading-[31.7714px]">
                        <div className="text-[22.0982px] font-semibold box-border caret-transparent flow-root leading-[35.3571px] md:text-[23.7143px] md:leading-[37.9429px] before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-[22.0982px] before:not-italic before:normal-nums before:font-semibold before:tracking-[normal] before:leading-[35.3571px] before:list-outside before:list-disc before:mb-[-9.05357px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans before:md:text-[23.7143px] before:md:leading-[37.9429px] before:md:mb-[-9.71237px] after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-[22.0982px] after:not-italic after:normal-nums after:font-semibold after:tracking-[normal] after:leading-[35.3571px] after:list-outside after:list-disc after:mb-[-9.27455px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans after:md:text-[23.7143px] after:md:leading-[37.9429px] after:md:mb-[-9.94951px]">
                          {props.teamPlanPrice}
                        </div>
                        <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                          <div className="text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] text-xs box-border caret-transparent tracking-[0.12px] leading-[19.2px]">
                            <p className="box-border caret-transparent flow-root before:accent-auto before:box-border before:caret-transparent before:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] before:table before:text-xs before:not-italic before:normal-nums before:font-normal before:tracking-[0.12px] before:leading-[19.2px] before:list-outside before:list-disc before:mb-[-4.91375px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] after:table after:text-xs after:not-italic after:normal-nums after:font-normal after:tracking-[0.12px] after:leading-[19.2px] after:list-outside after:list-disc after:mb-[-5.03375px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                              {props.teamPlanPriceDetails}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] contents">
                        <div className="text-[19.0491px] content-center items-stretch self-end box-border caret-transparent gap-x-3 flex flex-col justify-center leading-[30.4786px] gap-y-3 text-start md:text-[19.8571px] md:leading-[31.7714px]">
                          <div className="relative text-stone-50 dark:text-neutral-900 dark:bg-white text-[17px] items-center bg-neutral-900 shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px] dark:shadow-[rgb(200,200,200)_0px_0px_0px_0px,rgb(150,150,150)_0px_0px_0px_1px] box-border caret-transparent flex justify-center leading-[17px] min-h-10 text-center align-middle px-4 py-2 rounded-[8.5px]">
                            <div className="box-border caret-transparent hidden"></div>
                            <div className="relative font-medium box-border caret-transparent flow-root z-[1] px-2 before:accent-auto before:box-border before:caret-transparent before:text-stone-50 before:table before:text-[17px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[17px] before:list-outside before:list-disc before:mb-[-1.87px] before:pointer-events-auto before:text-center before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-stone-50 after:table after:text-[17px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[17px] after:list-outside after:list-disc after:mb-[-2.04px] after:pointer-events-auto after:text-center after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                              {props.teamPlanButtonText}
                            </div>
                            <div className="absolute box-border caret-transparent h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                              <a
                                href={props.teamPlanButtonUrl}
                                className="absolute box-border caret-transparent block h-full max-w-full outline-offset-4 w-full rounded-[8.5px] inset-[0%]"
                              ></a>
                              <button
                                type="button"
                                className="absolute bg-transparent caret-transparent hidden h-full outline-offset-4 w-full p-0 rounded-[8.5px] inset-[0%]"
                              ></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="relative text-[19.0491px] items-start bg-white dark:bg-[#2C2B27] box-border caret-transparent gap-x-6 grid auto-cols-[1fr] row-start-[span_5] grid-cols-[1fr] grid-rows-subgrid justify-start leading-[30.4786px] ml-[-16.7857px] mr-[-16.7857px] min-w-full gap-y-6 text-left border border-stone-200 dark:border-[#3A3833] p-6 rounded-[16.3929px] border-solid md:text-[19.8571px] md:leading-[31.7714px] md:mx-0 md:p-[31.4286px] md:rounded-[22.8571px]">
                      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] max-w-16 md:text-[19.8571px] md:leading-[31.7714px]">
                        <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] contents">
                          <img
                            src={props.enterprisePlanIcon}
                            alt="Icon"
                            className="text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]"
                          />
                        </div>
                      </div>
                      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                        <h3 className="text-[23.442px] font-medium box-border caret-transparent flow-root leading-[25.7862px] font-serif md:text-[30.7143px] md:leading-[33.7857px] before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-[23.442px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[25.7862px] before:list-outside before:list-disc before:mb-[-3.74826px] before:pointer-events-auto before:text-left before:indent-[0px] before:normal-case before:visible before:border-separate before:font-serif before:md:text-[30.7143px] before:md:leading-[33.7857px] before:md:mb-[-4.90424px] after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-[23.442px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[25.7862px] after:list-outside after:list-disc after:mb-[-3.98268px] after:pointer-events-auto after:text-left after:indent-[0px] after:normal-case after:visible after:border-separate after:font-serif after:md:text-[30.7143px] after:md:leading-[33.7857px] after:md:mb-[-5.21138px]">
                          {props.enterprisePlanTitle}
                        </h3>
                      </div>
                      <div className="text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] text-[15px] box-border caret-transparent leading-6">
                        <p className="box-border caret-transparent flow-root before:accent-auto before:box-border before:caret-transparent before:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] before:table before:text-[15px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-6 before:list-outside before:list-disc before:mb-[-6.15px] before:pointer-events-auto before:text-left before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] after:table after:text-[15px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-6 after:list-outside after:list-disc after:mb-[-6.3px] after:pointer-events-auto after:text-left after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                          {props.enterprisePlanDescription}
                        </p>
                      </div>
                      <div className="text-[19.0491px] items-start box-border caret-transparent flex flex-col justify-center leading-[30.4786px] gap-y-4 text-start mb-2 md:text-[19.8571px] md:leading-[31.7714px]">
                        <div className="text-[22.0982px] font-semibold box-border caret-transparent flow-root leading-[35.3571px] md:text-[23.7143px] md:leading-[37.9429px] before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-[22.0982px] before:not-italic before:normal-nums before:font-semibold before:tracking-[normal] before:leading-[35.3571px] before:list-outside before:list-disc before:mb-[-9.05357px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans before:md:text-[23.7143px] before:md:leading-[37.9429px] before:md:mb-[-9.71237px] after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-[22.0982px] after:not-italic after:normal-nums after:font-semibold after:tracking-[normal] after:leading-[35.3571px] after:list-outside after:list-disc after:mb-[-9.27455px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans after:md:text-[23.7143px] after:md:leading-[37.9429px] after:md:mb-[-9.94951px]"></div>
                        <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                          <div className="text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] text-xs box-border caret-transparent tracking-[0.12px] leading-[19.2px]">
                            <p className="box-border caret-transparent flow-root before:accent-auto before:box-border before:caret-transparent before:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] before:table before:text-xs before:not-italic before:normal-nums before:font-normal before:tracking-[0.12px] before:leading-[19.2px] before:list-outside before:list-disc before:mb-[-4.91375px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] after:table after:text-xs after:not-italic after:normal-nums after:font-normal after:tracking-[0.12px] after:leading-[19.2px] after:list-outside after:list-disc after:mb-[-5.03375px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                              ‍
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] contents">
                        <div className="text-[19.0491px] content-center items-stretch self-end box-border caret-transparent gap-x-3 flex flex-col justify-center leading-[30.4786px] gap-y-3 text-start md:text-[19.8571px] md:leading-[31.7714px]">
                          <div className="relative text-stone-50 dark:text-neutral-900 dark:bg-white text-[17px] items-center bg-neutral-900 shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px] dark:shadow-[rgb(200,200,200)_0px_0px_0px_0px,rgb(150,150,150)_0px_0px_0px_1px] box-border caret-transparent flex justify-center leading-[17px] min-h-10 text-center align-middle px-4 py-2 rounded-[8.5px]">
                            <div className="box-border caret-transparent hidden"></div>
                            <div className="relative font-medium box-border caret-transparent flow-root z-[1] px-2 before:accent-auto before:box-border before:caret-transparent before:text-stone-50 before:table before:text-[17px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[17px] before:list-outside before:list-disc before:mb-[-1.87px] before:pointer-events-auto before:text-center before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-stone-50 after:table after:text-[17px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[17px] after:list-outside after:list-disc after:mb-[-2.04px] after:pointer-events-auto after:text-center after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                              {props.enterprisePlanButtonText}
                            </div>
                            <div className="absolute box-border caret-transparent h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                              <a
                                href={props.enterprisePlanButtonUrl}
                                className="absolute box-border caret-transparent block h-full max-w-full outline-offset-4 w-full rounded-[8.5px] inset-[0%]"
                              ></a>
                              <button
                                type="button"
                                className="absolute bg-transparent caret-transparent hidden h-full outline-offset-4 w-full p-0 rounded-[8.5px] inset-[0%]"
                              ></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (props.variant === "use-cases") {
    return (
      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] gap-x-8 grid auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(auto-fit,minmax(min(max(288px,8.33333%_-_29.3333px),100%),1fr))] grid-rows-[auto] gap-y-8 bg-neutral-50 dark:bg-[#2C2B27] p-6 md:p-12 rounded-2xl">
        {props.useCaseCards?.map((card, index) => (
          <React.Fragment key={index}>
            {index === 0 || index === 3 ? (
              <Card
                variant="use-case"
                useCaseIcon=""
                useCaseCategory={card.category}
                useCaseTitle={card.title}
                useCaseDescription={card.description}
                useCaseButtonText={card.buttonText}
                useCaseButtonUrl={card.buttonUrl}
              />
            ) : (
              <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]">
                <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] items-start border-b-neutral-900 border-l-stone-200 border-r-neutral-900 border-t-stone-200 gap-x-[28.1964px] flex flex-col h-full justify-start gap-y-[28.1964px] px-0 py-[28.1964px] border-l-0 border-t md:border-t-neutral-900 md:gap-x-6 md:gap-y-6 md:pl-[31.4286px] md:pr-4 md:pt-3 md:pb-6 md:border-t-0 md:border-l">
                  <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] items-center gap-x-3 justify-start gap-y-3">
                    <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] items-center gap-x-2 flex justify-start gap-y-2 mb-6">
                      <div className="box-border caret-transparent text-zinc-600 text-[15px] flow-root leading-6 before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-[15px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-6 before:list-outside before:list-disc before:mb-[-6.15px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-[15px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-6 after:list-outside after:list-disc after:mb-[-6.3px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                        {card.category}
                      </div>
                    </div>
                    <h3 className="text-zinc-800 text-[20.2455px] font-medium box-border caret-transparent flow-root leading-[24.2946px] max-w-[326.283px] font-serif md:text-[18.5714px] md:leading-[22.2857px] md:max-w-[299.318px] before:accent-auto before:box-border before:caret-transparent before:text-zinc-800 before:table before:text-[20.2455px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[24.2946px] before:list-outside before:list-disc before:mb-[-4.24487px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-serif before:md:text-[18.5714px] before:md:leading-[22.2857px] before:md:mb-[-3.88996px] after:accent-auto after:box-border after:caret-transparent after:text-zinc-800 after:table after:text-[20.2455px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[24.2946px] after:list-outside after:list-disc after:mb-[-4.44732px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-serif after:md:text-[18.5714px] after:md:leading-[22.2857px] after:md:mb-[-4.07567px]">
                      {card.title}
                    </h3>
                  </div>
                  <p className="text-zinc-600 text-[17px] box-border caret-transparent flow-root leading-[27.2px] max-w-none md:text-[15px] md:leading-6 md:max-w-[362.397px] before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-[17px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-[27.2px] before:list-outside before:list-disc before:mb-[-6.96375px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans before:md:text-[15px] before:md:leading-6 before:md:mb-[-6.15px] after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-[17px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-[27.2px] after:list-outside after:list-disc after:mb-[-7.13375px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans after:md:text-[15px] after:md:leading-6 after:md:mb-[-6.3px]">
                    {card.description}
                  </p>
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }
  
  if (props.variant === "security") {
    return (
      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] self-center text-center w-full">
        <div className="relative text-[19.0491px] box-border caret-transparent leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]">
          <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] relative gap-x-8 flex flex-col auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(12,minmax(0px,1fr))] grid-rows-[auto] gap-y-8 w-full md:grid">
            <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] gap-x-[52.5893px] flex flex-col col-end-10 col-start-4 gap-y-[52.5893px] md:gap-x-[62.2857px] md:gap-y-[62.2857px]">
              {props.securityItems?.map((item, index) => (
                <div
                  key={index}
                  className="text-[19.0491px] box-border caret-transparent gap-x-8 flex flex-col auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(auto-fill,minmax(min(max(128px,50%_-_16px),100%),1fr))] grid-rows-[auto] leading-[30.4786px] gap-y-8 text-start md:text-[19.8571px] md:grid md:flex-row md:leading-[31.7714px]"
                >
                  <div className="text-[19.0491px] items-start box-border caret-transparent gap-x-3 flex flex-col justify-start leading-[30.4786px] gap-y-4 md:text-[19.8571px] md:flex-row md:leading-[31.7714px]">
                    <h3 className="text-zinc-800 text-[16.1473px] font-medium box-border caret-transparent flow-root leading-[19.3768px] max-w-[187.069px] mt-[4.03683px] font-serif md:text-[18.5714px] md:leading-[22.2857px] md:max-w-[215.509px] md:mt-[4.64286px] before:accent-auto before:box-border before:caret-transparent before:text-zinc-800 before:table before:text-[16.1473px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[19.3768px] before:list-outside before:list-disc before:mb-[-3.38223px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-serif before:md:text-[18.5714px] before:md:leading-[22.2857px] before:md:mb-[-3.88996px] after:accent-auto after:box-border after:caret-transparent after:text-zinc-800 after:table after:text-[16.1473px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[19.3768px] after:list-outside after:list-disc after:mb-[-3.54371px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-serif after:md:text-[18.5714px] after:md:leading-[22.2857px] after:md:mb-[-4.07567px]">
                      {item.title}
                    </h3>
                  </div>
                  <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] max-w-[402.982px] md:text-[19.8571px] md:leading-[31.7714px] md:max-w-[420.535px]">
                    <div className="text-zinc-600 text-[17px] box-border caret-transparent leading-[27.2px]">
                      <p className="box-border caret-transparent flow-root before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-[17px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-[27.2px] before:list-outside before:list-disc before:mb-[-6.96375px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-[17px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-[27.2px] after:list-outside after:list-disc after:mb-[-7.13375px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
 <div className="absolute text-[19.0491px] box-border caret-transparent gap-x-[28.1964px] hidden flex-col leading-[30.4786px] gap-y-[28.1964px] w-[216px] left-[0%] bottom-[10%] md:text-[19.8571px] md:gap-x-[31.4286px] md:flex md:leading-[31.7714px] md:gap-y-[31.4286px]"></div>
          <div className="absolute text-[19.0491px] box-border caret-transparent gap-x-[28.1964px] hidden flex-col leading-[30.4786px] gap-y-[28.1964px] w-[216px] right-[0%] top-[0%] md:text-[19.8571px] md:gap-x-[31.4286px] md:flex md:leading-[31.7714px] md:gap-y-[31.4286px]"></div>
          <div className="text-[19.0491px] box-border caret-transparent block h-0 leading-[30.4786px] outline-offset-4 invisible w-full overflow-hidden mt-0 md:text-[19.8571px] md:hidden md:h-auto md:leading-[31.7714px] md:visible md:overflow-visible md:mt-[62.2857px]">
            <div className="text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] invisible md:text-[19.8571px] md:leading-[31.7714px] md:visible"></div>
            <div className="text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] invisible md:text-[19.8571px] md:leading-[31.7714px] md:visible"></div>
            <div className="[mask-image:linear-gradient(90deg,rgba(0,0,0,0)_0%,rgb(0,0,0)_3%,rgb(0,0,0)_97%,rgba(0,0,0,0)_100%)] text-[19.0491px] items-center box-border caret-transparent flex-col justify-center leading-[30.4786px] invisible -mx-8 px-4 py-2 md:text-[19.8571px] md:leading-[31.7714px] md:visible">
              <div className="text-[19.0491px] items-center box-border caret-transparent flex justify-start leading-[30.4786px] invisible w-full md:text-[19.8571px] md:leading-[31.7714px] md:visible"></div>
            </div>
            <div className="text-[19.0491px] box-border caret-transparent gap-x-6 flex justify-between leading-[30.4786px] gap-y-6 invisible w-full mt-[28.1964px] md:text-[19.8571px] md:leading-[31.7714px] md:visible md:mt-[31.4286px]">
              {props.navigationIcons?.map((icon, index) => (
                <React.Fragment key={index}>
                  <div className="relative text-neutral-600 text-[19.0491px] items-center aspect-square bg-white shadow-[rgb(255,255,255)_0px_0px_0px_0px,rgb(222,220,209)_0px_0px_0px_1px] box-border caret-transparent flex shrink-0 justify-center leading-[30.4786px] min-h-[auto] min-w-[auto] align-middle invisible w-10 rounded-xl md:text-[19.8571px] md:leading-[31.7714px] md:min-h-0 md:min-w-0 md:visible">
                    <div className="relative text-[19.0491px] aspect-square box-border caret-transparent leading-[30.4786px] min-h-[auto] min-w-[auto] invisible w-4 md:text-[19.8571px] md:leading-[31.7714px] md:min-h-0 md:min-w-0 md:visible">
                      <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] invisible md:text-[19.8571px] md:leading-[31.7714px] md:visible">
                        <img
                          src={icon}
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
                  {index === 0 && (
                    <div className="text-[19.0491px] items-center box-border caret-transparent gap-x-3 flex basis-[0%] grow flex-wrap justify-center leading-[30.4786px] min-h-[auto] min-w-[auto] gap-y-3 invisible md:text-[19.8571px] md:leading-[31.7714px] md:min-h-0 md:min-w-0 md:visible"></div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (props.variant === "faq") {
    return (
      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] relative gap-x-8 flex flex-col auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(12,minmax(0px,1fr))] grid-rows-[auto] gap-y-8 w-full md:grid">
        <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] gap-x-[52.5893px] flex flex-col col-end-10 col-start-4 gap-y-[52.5893px] md:gap-x-[62.2857px] md:gap-y-[62.2857px]">
          <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <Card variant="empty" />
            <AnimatedFAQ 
              faqItems={props.faqItems?.map(item => ({
                question: item.question,
                answer: typeof item.answer === 'string' ? item.answer : ''
              })) || []} 
            />
            <div className="box-border caret-transparent text-[19.0491px] hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
