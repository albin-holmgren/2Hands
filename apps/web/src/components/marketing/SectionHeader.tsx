"use client";

import { useState, useEffect, useRef } from "react";

export type SectionHeaderProps = {
  lottieUrl: string;
  iconUrl: string;
  iconAlt?: string;
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
    videoUrl?: string;
    reportContent?: React.ReactNode;
    bottomIcons?: string[];
    cardTitle?: string;
    cardDescription?: string;
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
  containerVariant?: string;
};

export const SectionHeader = (props: SectionHeaderProps) => {
  const [activeTab, setActiveTab] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Intersection Observer for sticky scroll steps
  useEffect(() => {
    if (!props.showSteps || !props.steps) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = stepRefs.current.indexOf(entry.target as HTMLDivElement);
            if (index !== -1) {
              setActiveStep(index);
            }
          }
        });
      },
      {
        threshold: 0.5,
        rootMargin: "-20% 0px -20% 0px"
      }
    );

    stepRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [props.showSteps, props.steps]);

  return (
    <div
      className={`text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px] ${props.containerVariant || ""}`}
    >
      {/* Sticky scroll layout for steps variant - Clean minimal design */}
      {props.showSteps && props.steps ? (
        <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
          {/* Section title only - no icon, no description */}
          {props.title && (
            <div className="mb-[80px] md:mb-[100px]">
              <h2 className="text-[36px] font-medium text-neutral-900 dark:text-[#F5F3F0] leading-[1.1] font-display md:text-[48px]">
                {props.title}
              </h2>
            </div>
          )}

          {/* Sticky scroll container */}
          <div className="relative md:grid md:grid-cols-2 md:gap-[100px]">
            {/* Left: Scrollable steps - Ultra minimal */}
            <div className="flex flex-col">
              {props.steps.map((step, index) => (
                <div
                  key={index}
                  ref={(el) => { stepRefs.current[index] = el; }}
                  className="min-h-[80vh] flex flex-col justify-center py-16"
                >
                  {/* Step number - subtle */}
                  <div className="text-[13px] font-medium text-[#D97757] mb-8 tracking-widest uppercase">
                    Step {step.number}
                  </div>
                  
                  {/* Title - Large and bold */}
                  <h3 className="text-[28px] font-medium text-neutral-900 dark:text-[#F5F3F0] leading-[1.2] mb-6 font-display md:text-[38px]">
                    {step.title}
                  </h3>
                  
                  {/* Description - Single short sentence */}
                  <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.7] max-w-[380px]">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>

            {/* Right: Fixed/sticky panel */}
            <div className="hidden md:block">
              <div className="sticky top-[12vh] h-[76vh]">
                <div className="relative w-full h-full rounded-[24px] overflow-hidden border border-stone-200 dark:border-[#3A3833] bg-white dark:bg-[#2C2B27]">
                  {props.steps[activeStep]?.panel || (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400">
                      <span className="text-[15px]">Step {activeStep + 1}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : props.showTabs && props.tabs ? (
        <div className="flex flex-col gap-12 md:flex-row md:gap-16 md:items-start">
          {/* Left column: title + description + vertical tab list */}
          <div className="flex flex-col gap-8 md:w-[380px] md:shrink-0 md:sticky md:top-24">
            {/* Title */}
            {props.title && (
              <h2 className="text-neutral-900 dark:text-[#F5F3F0] font-serif font-medium text-[34px] leading-[1.15] md:text-[42px]">
                {props.title}
              </h2>
            )}

            {/* Description */}
            {props.description && (
              <p className="text-zinc-500 dark:text-[#9E9C99] text-[17px] leading-[1.65]">
                {props.description}
              </p>
            )}

            {/* Vertical tab list */}
            <div role="tablist" className="flex flex-col gap-1 mt-2">
              {props.tabs.map((tab, index) => (
                <button
                  key={index}
                  role="tab"
                  onClick={() => setActiveTab(index)}
                  className={`flex items-center gap-3 text-left px-4 py-3 rounded-xl transition-colors cursor-pointer ${
                    index === activeTab
                      ? "bg-stone-100 dark:bg-[#3A3833] text-neutral-900 dark:text-[#F5F3F0]"
                      : "text-zinc-500 dark:text-[#9E9C99] hover:bg-stone-50 dark:hover:bg-[#2C2B27] hover:text-neutral-700 dark:hover:text-[#F5F3F0]"
                  }`}
                >
                  <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                    {tab.tabIcon}
                  </div>
                  <span className={`text-sm font-medium tracking-wide ${index === activeTab ? "text-neutral-900 dark:text-[#F5F3F0]" : "text-zinc-500 dark:text-[#9E9C99]"}`}>
                    {tab.label}
                  </span>
                  {index === activeTab && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-neutral-900 dark:bg-[#F5F3F0] shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right column: active tab panel */}
          <div className="flex-1 min-w-0">
            {props.tabPanels &&
              props.tabPanels.map((panel, index) =>
                index !== activeTab ? null : (
                <div
                  key={`panel-${activeTab}`}
                  role="tabpanel"
                >
                  <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                    <div className="relative text-[19.0491px] items-center box-border caret-transparent flex flex-col justify-center leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]">
                      <div className="text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
                      <div className="text-[19.0491px] box-border caret-transparent gap-x-8 flex flex-col auto-cols-[minmax(0px,1fr)] grid-cols-[repeat(12,minmax(0px,1fr))] grid-rows-[auto] leading-[30.4786px] gap-y-[40.3929px] w-full md:text-[19.8571px] md:grid md:leading-[31.7714px] md:gap-y-[46.8571px]">
                        <div className="relative text-[4.5px] aspect-video box-border caret-transparent col-end-[-2] col-start-2 leading-[7.2px] w-full overflow-hidden rounded-2xl md:text-base md:leading-[25.6px] md:rounded-[29.7143px]">
                          {panel.panelContent ? (
                            panel.panelContent
                          ) : (
                          <div className="text-[4.5px] box-border caret-transparent leading-[7.2px] md:text-base md:leading-[25.6px]">
                            {panel.videoUrl ? (
                              <video
                                src={panel.videoUrl}
                                data-autoplay="true"
                                data-loop="true"
                                muted
                                data-playsinline="true"
                                className="text-[4.5px] bg-[lab(6.29227_-0.162095_0.605655_/_0.1)] box-border caret-transparent inline-block h-full leading-[7.2px] object-cover w-full md:text-base md:leading-[25.6px]"
                              ></video>
                                 ) : panel.reportContent ? (
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
                                              {panel.reportContent}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="absolute text-[4.5px] bg-stone-950 box-border caret-transparent h-full leading-[7.2px] w-full inset-[0%] md:text-base md:leading-[25.6px]"></div>
                                    {panel.bottomIcons && (
                                      <div className="absolute text-[4.5px] box-border caret-transparent h-full leading-[7.2px] w-full inset-[0%] md:text-base md:leading-[25.6px]">
                                        {panel.bottomIcons.map((icon, i) => (
                                          <img
                                            key={i}
                                            src={icon}
                                            alt="Icon"
                                            className={
                                              i ===
                                              panel.bottomIcons!.length - 1
                                                ? "absolute text-[color(srgb_1_1_1_/_0.1)] text-[4.5px] box-border caret-transparent h-full leading-[7.2px] object-cover w-full inset-[0%] md:text-base md:leading-[25.6px]"
                                                : "absolute text-[color(srgb_1_1_1_/_0.1)] text-[4.5px] box-border caret-transparent hidden h-full leading-[7.2px] object-cover w-full inset-[0%] md:text-base md:leading-[25.6px]"
                                            }
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                                 ) : (
                              <div className="text-[4.5px] box-border caret-transparent leading-[7.2px] md:text-base md:leading-[25.6px]">
                                <div className="relative text-[4.5px] aspect-video box-border caret-transparent leading-[7.2px] w-full overflow-hidden rounded-2xl md:text-base md:leading-[25.6px] md:rounded-[29.7143px]">
                                  <div className="relative text-[4.5px] box-border caret-transparent grid flex-col auto-cols-[1fr] grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] grid-rows-[auto] h-full leading-[7.2px] w-full z-[9999] md:text-base md:flex-row md:leading-[25.6px]">
                                    <div className="text-[4.5px] items-start bg-neutral-900 box-border caret-transparent gap-x-[2.25px] flex flex-col col-end-5 col-start-1 row-end-2 row-start-1 h-full justify-center leading-[7.2px] gap-y-[2.25px] w-full pl-[18px] py-[9px] md:text-base md:gap-x-2 md:leading-[25.6px] md:gap-y-2 md:pl-16 md:py-8">
                                      {panel.promptTitle && (
                                        <div className="text-stone-50 text-[4.5px] bg-neutral-900 box-border caret-transparent gap-x-[2.25px] flex flex-col leading-[7.2px] min-h-[20.25px] gap-y-[2.25px] w-full p-[4.5px] rounded-[3.375px] md:text-base md:gap-x-2 md:leading-[25.6px] md:min-h-[72px] md:gap-y-2 md:p-4 md:rounded-xl">
                                          <div className="text-[3.15px] box-border caret-transparent tracking-[0.0315px] leading-[5.04px] w-full md:text-[11.2px] md:tracking-[0.112px] md:leading-[17.92px]">
                                            {panel.promptTitle}
                                          </div>
                                          {panel.promptText && (
                                            <p className="text-stone-400 text-[3.15px] box-border caret-transparent flow-root tracking-[0.0315px] leading-[5.04px] w-full md:text-[11.2px] md:tracking-[0.112px] md:leading-[17.92px] before:accent-auto before:box-border before:caret-transparent before:text-stone-400 before:table before:text-[3.15px] before:not-italic before:normal-nums before:font-normal before:tracking-[0.0315px] before:leading-[5.04px] before:list-outside before:list-disc before:mb-[-1.27931px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans before:md:text-[11.2px] before:md:tracking-[0.112px] before:md:leading-[17.92px] before:md:mb-[-4.57731px] after:accent-auto after:box-border after:caret-transparent after:text-stone-400 after:table after:text-[3.15px] after:not-italic after:normal-nums after:font-normal after:tracking-[0.0315px] after:leading-[5.04px] after:list-outside after:list-disc after:mb-[-1.31081px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans after:md:text-[11.2px] after:md:tracking-[0.112px] after:md:leading-[17.92px] after:md:mb-[-4.68931px]">
                                              {panel.promptText}
                                            </p>
                                          )}
                                        </div>
                                      )}
                                      {panel.workingFolder && (
                                        <div className="text-stone-50 text-[4.5px] bg-neutral-900 box-border caret-transparent gap-x-[2.25px] flex flex-col leading-[7.2px] min-h-[20.25px] gap-y-[2.25px] w-full p-[4.5px] rounded-[3.375px] md:text-base md:gap-x-2 md:leading-[25.6px] md:min-h-[72px] md:gap-y-2 md:p-4 md:rounded-xl">
                                          <div className="text-[3.15px] box-border caret-transparent tracking-[0.0315px] leading-[5.04px] w-full md:text-[11.2px] md:tracking-[0.112px] md:leading-[17.92px]">
                                            Working folder
                                          </div>
                                          <p className="text-stone-400 text-[3.15px] box-border caret-transparent flow-root tracking-[0.0315px] leading-[5.04px] w-full md:text-[11.2px] md:tracking-[0.112px] md:leading-[17.92px] before:accent-auto before:box-border before:caret-transparent before:text-stone-400 before:table before:text-[3.15px] before:not-italic before:normal-nums before:font-normal before:tracking-[0.0315px] before:leading-[5.04px] before:list-outside before:list-disc before:mb-[-1.27931px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans before:md:text-[11.2px] before:md:tracking-[0.112px] before:md:leading-[17.92px] before:md:mb-[-4.57731px] after:accent-auto after:box-border after:caret-transparent after:text-stone-400 after:table after:text-[3.15px] after:not-italic after:normal-nums after:font-normal after:tracking-[0.0315px] after:leading-[5.04px] after:list-outside after:list-disc after:mb-[-1.31081px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans after:md:text-[11.2px] after:md:tracking-[0.112px] after:md:leading-[17.92px] after:md:mb-[-4.68931px]">
                                            {panel.workingFolder}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                        {panel.codeContent && (
                                      <div className="text-[4.5px] box-border caret-transparent col-end-13 col-start-5 row-end-2 row-start-1 h-full leading-[7.2px] overflow-x-hidden overflow-y-scroll w-full p-[18px] md:text-base md:leading-[25.6px] md:p-16">
                                        <div className="text-[4.5px] box-border caret-transparent h-full leading-[7.2px] md:text-base md:leading-[25.6px]">
                                          <div className="text-[4.5px] box-border caret-transparent h-full leading-[7.2px] text-left md:text-base md:leading-[25.6px]">
                                            <div className="text-[4.5px] box-border caret-transparent h-full leading-[7.2px] md:text-base md:leading-[25.6px]">
                                              <div className="relative text-[4.5px] box-border caret-transparent flex flex-col h-full tracking-[-0.09px] leading-[7.2px] z-[1] overflow-hidden rounded-[3.375px] md:text-base md:tracking-[-0.32px] md:leading-[25.6px] md:rounded-xl">
                                                <div className="text-stone-50 text-[4.5px] items-center bg-zinc-800 box-border caret-transparent flex justify-between tracking-[-0.09px] leading-[7.2px] min-h-[9.5625px] pl-[3.375px] pr-[1.6875px] py-[1.6875px] rounded-t-[3.375px] md:text-base md:tracking-[-0.32px] md:leading-[25.6px] md:min-h-[34px] md:pl-3 md:pr-1.5 md:py-1.5 md:rounded-t-xl">
                                                  <div className="text-[4.5px] items-center box-border caret-transparent gap-x-[2.25px] flex justify-start tracking-[-0.09px] leading-[7.2px] gap-y-[2.25px] md:text-base md:gap-x-2 md:tracking-[-0.32px] md:leading-[25.6px] md:gap-y-2">
                                                    <div className="text-[4.5px] bg-neutral-500 box-border caret-transparent h-[2.8125px] tracking-[-0.09px] leading-[7.2px] w-[2.8125px] rounded-[16.7857px] md:text-base md:h-2.5 md:tracking-[-0.32px] md:leading-[25.6px] md:w-2.5 md:rounded-[29.7143px]"></div>
                                                    <div className="text-[4.5px] bg-neutral-500 box-border caret-transparent h-[2.8125px] tracking-[-0.09px] leading-[7.2px] w-[2.8125px] rounded-[16.7857px] md:text-base md:h-2.5 md:tracking-[-0.32px] md:leading-[25.6px] md:w-2.5 md:rounded-[29.7143px]"></div>
                                                    <div className="text-[4.5px] bg-neutral-500 box-border caret-transparent h-[2.8125px] tracking-[-0.09px] leading-[7.2px] w-[2.8125px] rounded-[16.7857px] md:text-base md:h-2.5 md:tracking-[-0.32px] md:leading-[25.6px] md:w-2.5 md:rounded-[29.7143px]"></div>
                                                  </div>
                                                </div>
                                                <div className="text-stone-300 text-[4.5px] bg-stone-900 box-border caret-transparent basis-[0%] grow tracking-[-0.09px] leading-[7.2px] overflow-auto p-[6.75px] rounded-b-[3.375px] md:text-base md:tracking-[-0.32px] md:leading-[25.6px] md:p-6 md:rounded-b-xl">
                                                  <div className="text-[4.21898px] box-border caret-transparent tracking-[-0.09px] leading-[6.75036px] font-mono md:text-[15.0008px] md:tracking-[-0.32px] md:leading-[24.0013px]">
                                                    {panel.codeContent}
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div className="absolute text-[4.5px] bg-stone-950 box-border caret-transparent h-full leading-[7.2px] w-full inset-[0%] md:text-base md:leading-[25.6px]"></div>
                                  {panel.bottomIcons && (
                                    <div className="absolute text-[4.5px] box-border caret-transparent h-full leading-[7.2px] w-full inset-[0%] md:text-base md:leading-[25.6px]">
                                      {panel.bottomIcons.map((icon, i) => (
                                        <img
                                          key={i}
                                          src={icon}
                                          alt="Icon"
                                          className={
                                            i === panel.bottomIcons!.length - 1
                                              ? "absolute text-[color(srgb_1_1_1_/_0.1)] text-[4.5px] box-border caret-transparent h-full leading-[7.2px] object-cover w-full inset-[0%] md:text-base md:leading-[25.6px]"
                                              : "absolute text-[color(srgb_1_1_1_/_0.1)] text-[4.5px] box-border caret-transparent hidden h-full leading-[7.2px] object-cover w-full inset-[0%] md:text-base md:leading-[25.6px]"
                                          }
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          )}
                          {!panel.panelContent && panel.videoUrl && (
                            <div className="absolute text-[4.5px] shadow-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.15)_0px_0px_0px_1px_inset] box-border caret-transparent h-full leading-[7.2px] pointer-events-none w-full z-[3] rounded-[16.7857px] inset-[0%] md:text-base md:leading-[25.6px] md:rounded-[29.7143px]"></div>
                          )}
                          {!panel.panelContent && index === 0 && (
                            <div className="absolute text-[4.5px] shadow-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.15)_0px_0px_0px_1px_inset] box-border caret-transparent hidden h-full leading-[7.2px] pointer-events-none w-full z-[3] rounded-[16.7857px] inset-[0%] md:text-base md:leading-[25.6px] md:rounded-[29.7143px]"></div>
                          )}
                        </div>
                        {panel.cardTitle && (
                          <div className="text-[19.0491px] box-border caret-transparent gap-x-6 grid auto-cols-[minmax(0px,1fr)] col-end-[-3] col-start-3 grid-cols-[repeat(auto-fill,minmax(min(max(128px,100%_+_0px),100%),1fr))] grid-rows-[auto] leading-[30.4786px] gap-y-6 md:text-[19.8571px] md:gap-x-8 md:grid-cols-[repeat(auto-fill,minmax(min(max(128px,50%_-_16px),100%),1fr))] md:leading-[31.7714px] md:gap-y-8">
                            <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                              <div className="text-[20.2455px] font-medium box-border caret-transparent leading-[24.2946px] max-w-none mb-4 font-serif md:text-[24.2857px] md:leading-[29.1429px] md:max-w-[391.589px]">
                                <h3 className="text-[20.2455px] text-neutral-900 box-border caret-transparent flow-root leading-[24.2946px] md:text-[24.2857px] md:leading-[29.1429px] before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-[20.2455px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[24.2946px] before:list-outside before:list-disc before:mb-[-4.24487px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-serif before:md:text-[24.2857px] before:md:leading-[29.1429px] before:md:mb-[-5.09107px] after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-[20.2455px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[24.2946px] after:list-outside after:list-disc after:mb-[-4.44732px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-serif after:md:text-[24.2857px] after:md:leading-[29.1429px] after:md:mb-[-5.33393px]">
                                  {panel.cardTitle}
                                </h3>
                              </div>
                            </div>
                            {panel.cardDescription && (
                              <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                                <div className="text-zinc-600 text-[15px] box-border caret-transparent leading-6">
                                  <p className="box-border caret-transparent flow-root before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-[15px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-6 before:list-outside before:list-disc before:mb-[-6.15px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-[15px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-6 after:list-outside after:list-disc after:mb-[-6.3px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                                    {panel.cardDescription}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <>
          {props.iconUrl && (
            <div className="content-center items-center flex flex-wrap justify-center mb-[28.1964px] md:mb-[31.4286px]">
              <div className="aspect-square w-[65.5714px] md:w-[91.4286px]">
                <img
                  src={props.iconUrl}
                  alt={props.iconAlt || "Icon"}
                  className="h-full w-full"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
