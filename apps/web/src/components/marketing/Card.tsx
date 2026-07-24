export type CardProps = {
  variant: "detailed" | "pricing" | "use-case" | "empty";

  // Detailed variant props
  promptTitle?: string;
  promptContent?: React.ReactNode;
  workingFolderTitle?: string;
  workingFolderPath?: string;
  codeBlockContent?: React.ReactNode;
  iconUrls?: string[];

  // Pricing variant props
  planIcon?: string;
  planTitle?: string;
  planDescription?: string;
  planPrice?: string;
  planPriceDetails?: string;
  planButtonText?: string;
  planButtonUrl?: string;
  planCardVariant?: string;

  // Use case variant props
  useCaseIcon?: string;
  useCaseCategory?: string;
  useCaseTitle?: string;
  useCaseDescription?: string;
  useCaseButtonText?: string;
  useCaseButtonUrl?: string;
};

export const Card = (props: CardProps) => {
  if (props.variant === "empty") {
    return (
      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
    );
  }

  if (props.variant === "detailed") {
    return (
      <div className="box-border caret-transparent relative text-[4.5px] aspect-video col-end-[-2] col-start-2 leading-[7.2px] w-full overflow-hidden rounded-2xl md:text-base md:leading-[25.6px] md:rounded-[29.7143px]">
        <div className="box-border caret-transparent text-[4.5px] leading-[7.2px] md:text-base md:leading-[25.6px]">
          <div className="box-border caret-transparent text-[4.5px] leading-[7.2px] md:text-base md:leading-[25.6px]">
            <div className="box-border caret-transparent relative text-[4.5px] aspect-video leading-[7.2px] w-full overflow-hidden rounded-2xl md:text-base md:leading-[25.6px] md:rounded-[29.7143px]">
              <div className="box-border caret-transparent relative text-[4.5px] grid flex-col auto-cols-[1fr] grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] grid-rows-[auto] h-full leading-[7.2px] w-full z-[9999] md:text-base md:flex-row md:leading-[25.6px]">
                <div className="box-border caret-transparent text-[4.5px] items-start gap-x-[2.25px] flex flex-col col-end-5 col-start-1 row-end-2 row-start-1 h-full justify-center leading-[7.2px] gap-y-[2.25px] w-full pl-[18px] py-[9px] md:text-base md:gap-x-2 md:leading-[25.6px] md:gap-y-2 md:pl-16 md:py-8">
                  <div className="text-stone-50 text-[4.5px] bg-neutral-900 box-border caret-transparent gap-x-[2.25px] flex flex-col leading-[7.2px] min-h-[20.25px] gap-y-[2.25px] w-full p-[4.5px] rounded-[3.375px] md:text-base md:gap-x-2 md:leading-[25.6px] md:min-h-[72px] md:gap-y-2 md:p-4 md:rounded-xl">
                    <div className="text-[3.15px] box-border caret-transparent tracking-[0.0315px] leading-[5.04px] w-full md:text-[11.2px] md:tracking-[0.112px] md:leading-[17.92px]">
                      {props.promptTitle}
                    </div>
                    <p className="text-stone-400 text-[3.15px] box-border caret-transparent flow-root tracking-[0.0315px] leading-[5.04px] w-full md:text-[11.2px] md:tracking-[0.112px] md:leading-[17.92px] before:accent-auto before:box-border before:caret-transparent before:text-stone-400 before:table before:text-[3.15px] before:not-italic before:normal-nums before:font-normal before:tracking-[0.0315px] before:leading-[5.04px] before:list-outside before:list-disc before:mb-[-1.27931px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans before:md:text-[11.2px] before:md:tracking-[0.112px] before:md:leading-[17.92px] before:md:mb-[-4.57731px] after:accent-auto after:box-border after:caret-transparent after:text-stone-400 after:table after:text-[3.15px] after:not-italic after:normal-nums after:font-normal after:tracking-[0.0315px] after:leading-[5.04px] after:list-outside after:list-disc after:mb-[-1.31081px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans after:md:text-[11.2px] after:md:tracking-[0.112px] after:md:leading-[17.92px] after:md:mb-[-4.68931px]">
                      {props.promptContent}
                    </p>
                  </div>
                  <div className="text-stone-50 text-[4.5px] bg-neutral-900 box-border caret-transparent gap-x-[2.25px] flex flex-col leading-[7.2px] min-h-[20.25px] gap-y-[2.25px] w-full p-[4.5px] rounded-[3.375px] md:text-base md:gap-x-2 md:leading-[25.6px] md:min-h-[72px] md:gap-y-2 md:p-4 md:rounded-xl">
                    <div className="text-[3.15px] box-border caret-transparent tracking-[0.0315px] leading-[5.04px] w-full md:text-[11.2px] md:tracking-[0.112px] md:leading-[17.92px]">
                      {props.workingFolderTitle}
                    </div>
                    <p className="text-stone-400 text-[3.15px] box-border caret-transparent flow-root tracking-[0.0315px] leading-[5.04px] w-full md:text-[11.2px] md:tracking-[0.112px] md:leading-[17.92px] before:accent-auto before:box-border before:caret-transparent before:text-stone-400 before:table before:text-[3.15px] before:not-italic before:normal-nums before:font-normal before:tracking-[0.0315px] before:leading-[5.04px] before:list-outside before:list-disc before:mb-[-1.27931px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans before:md:text-[11.2px] before:md:tracking-[0.112px] before:md:leading-[17.92px] before:md:mb-[-4.57731px] after:accent-auto after:box-border after:caret-transparent after:text-stone-400 after:table after:text-[3.15px] after:not-italic after:normal-nums after:font-normal after:tracking-[0.0315px] after:leading-[5.04px] after:list-outside after:list-disc after:mb-[-1.31081px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans after:md:text-[11.2px] after:md:tracking-[0.112px] after:md:leading-[17.92px] after:md:mb-[-4.68931px]">
                      {props.workingFolderPath}
                    </p>
                  </div>
                </div>
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
                              {props.codeBlockContent}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="box-border caret-transparent absolute text-[4.5px] bg-neutral-300 h-full leading-[7.2px] w-full inset-[0%] md:text-base md:leading-[25.6px]"></div>
            <div className="absolute text-[4.5px] box-border caret-transparent h-full leading-[7.2px] w-full inset-[0%] md:text-base md:leading-[25.6px]">
              {props.iconUrls?.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt="Icon"
                  className={
                    index === props.iconUrls!.length - 1
                      ? "absolute text-[color(srgb_1_1_1_/_0.1)] text-[4.5px] box-border caret-transparent h-full leading-[7.2px] object-cover w-full inset-[0%] md:text-base md:leading-[25.6px]"
                      : "absolute text-[color(srgb_1_1_1_/_0.1)] text-[4.5px] box-border caret-transparent hidden h-full leading-[7.2px] object-cover w-full inset-[0%] md:text-base md:leading-[25.6px]"
                  }
                />
              ))}
            </div>
          </div>
        </div>
        <div className="box-border caret-transparent absolute text-[4.5px] shadow-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.15)_0px_0px_0px_1px_inset] hidden h-full leading-[7.2px] pointer-events-none w-full z-[3] rounded-[16.7857px] inset-[0%] md:text-base md:leading-[25.6px] md:rounded-[29.7143px]"></div>
      </div>
    );
  }

  if (props.variant === "pricing") {
    return (
      <div
        className={
          props.planCardVariant ||
          "text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"
        }
      >
        <div className="box-border caret-transparent relative text-[19.0491px] items-start bg-white dark:bg-[#2C2B27] gap-x-6 grid auto-cols-[1fr] row-start-[span_5] grid-cols-[1fr] grid-rows-subgrid justify-start leading-[30.4786px] ml-[-16.7857px] mr-[-16.7857px] min-w-full gap-y-6 text-left border border-stone-200 dark:border-[#3A3833] p-6 rounded-[16.3929px] border-solid md:text-[19.8571px] md:leading-[31.7714px] md:mx-0 md:p-[31.4286px] md:rounded-[22.8571px]">
          <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] max-w-16 md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
              <img
                src={props.planIcon}
                alt="Icon"
                className="text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]"
              />
            </div>
          </div>
          <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <h3 className="text-[23.442px] font-medium dark:text-[#F5F3F0] box-border caret-transparent flow-root leading-[25.7862px] font-serif md:text-[30.7143px] md:leading-[33.7857px] before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-[23.442px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[25.7862px] before:list-outside before:list-disc before:mb-[-3.74826px] before:pointer-events-auto before:text-left before:indent-[0px] before:normal-case before:visible before:border-separate before:font-serif before:md:text-[30.7143px] before:md:leading-[33.7857px] before:md:mb-[-4.90424px] after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-[23.442px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[25.7862px] after:list-outside after:list-disc after:mb-[-3.98268px] after:pointer-events-auto after:text-left after:indent-[0px] after:normal-case after:visible after:border-separate after:font-serif after:md:text-[30.7143px] after:md:leading-[33.7857px] after:md:mb-[-5.21138px]">
              {props.planTitle}
            </h3>
          </div>
          <div className="text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] dark:text-[#9E9C99] text-[15px] box-border caret-transparent leading-6">
            <p className="box-border caret-transparent flow-root before:accent-auto before:box-border before:caret-transparent before:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] before:table before:text-[15px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-6 before:list-outside before:list-disc before:mb-[-6.15px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] after:table after:text-[15px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-6 after:list-outside after:list-disc after:mb-[-6.3px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
              {props.planDescription}
            </p>
          </div>
          <div className="text-[19.0491px] items-start box-border caret-transparent flex flex-col justify-center leading-[30.4786px] gap-y-4 text-start mb-2 md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="text-[22.0982px] font-semibold dark:text-[#F5F3F0] box-border caret-transparent flow-root leading-[35.3571px] md:text-[23.7143px] md:leading-[37.9429px] before:accent-auto before:box-border before:caret-transparent before:text-neutral-900 before:table before:text-[22.0982px] before:not-italic before:normal-nums before:font-semibold before:tracking-[normal] before:leading-[35.3571px] before:list-outside before:list-disc before:mb-[-9.05357px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans before:md:text-[23.7143px] before:md:leading-[37.9429px] before:md:mb-[-9.71237px] after:accent-auto after:box-border after:caret-transparent after:text-neutral-900 after:table after:text-[22.0982px] after:not-italic after:normal-nums after:font-semibold after:tracking-[normal] after:leading-[35.3571px] after:list-outside after:list-disc after:mb-[-9.27455px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans after:md:text-[23.7143px] after:md:leading-[37.9429px] after:md:mb-[-9.94951px]">
              {props.planPrice}
            </div>
            <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
              <div className="text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] text-xs box-border caret-transparent tracking-[0.12px] leading-[19.2px]">
                <p className="box-border caret-transparent flow-root before:accent-auto before:box-border before:caret-transparent before:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] before:table before:text-xs before:not-italic before:normal-nums before:font-normal before:tracking-[0.12px] before:leading-[19.2px] before:list-outside before:list-disc before:mb-[-4.91375px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] after:table after:text-xs after:not-italic after:normal-nums after:font-normal after:tracking-[0.12px] after:leading-[19.2px] after:list-outside after:list-disc after:mb-[-5.03375px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                  {props.planPriceDetails}
                </p>
              </div>
            </div>
          </div>
          <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="text-[19.0491px] content-center items-stretch self-end box-border caret-transparent gap-x-3 flex flex-col justify-center leading-[30.4786px] gap-y-3 text-start md:text-[19.8571px] md:leading-[31.7714px]">
              <div className="relative text-stone-50 dark:text-neutral-900 dark:bg-white text-[17px] items-center bg-neutral-900 shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px] dark:shadow-[rgb(200,200,200)_0px_0px_0px_0px,rgb(150,150,150)_0px_0px_0px_1px] box-border caret-transparent flex justify-center leading-[17px] min-h-10 text-center align-middle px-4 py-2 rounded-[8.5px]">
                <div className="box-border caret-transparent hidden"></div>
                <div className="relative font-medium box-border caret-transparent flow-root z-[1] px-2 before:accent-auto before:box-border before:caret-transparent before:text-stone-50 before:table before:text-[17px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[17px] before:list-outside before:list-disc before:mb-[-1.87px] before:pointer-events-auto before:text-center before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-stone-50 after:table after:text-[17px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[17px] after:list-outside after:list-disc after:mb-[-2.04px] after:pointer-events-auto after:text-center after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                  {props.planButtonText}
                </div>
                <div className="absolute box-border caret-transparent h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                  <a
                    href={props.planButtonUrl}
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
    );
  }

  if (props.variant === "use-case") {
    return (
      <div className="box-border caret-transparent text-[19.0491px] leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]">
        <div className="box-border caret-transparent text-[19.0491px] items-start gap-x-[28.1964px] flex flex-col h-full justify-start leading-[30.4786px] gap-y-[28.1964px] px-0 py-[28.1964px] md:text-[19.8571px] md:gap-x-6 md:leading-[31.7714px] md:gap-y-6 md:pl-[31.4286px] md:pr-4 md:pt-3 md:pb-6">
          <div className="box-border caret-transparent text-[19.0491px] items-center gap-x-3 justify-start leading-[30.4786px] gap-y-3 md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="box-border caret-transparent text-[19.0491px] items-center gap-x-2 flex justify-start leading-[30.4786px] gap-y-2 mb-6 md:text-[19.8571px] md:leading-[31.7714px]">
              <div className="box-border caret-transparent text-zinc-600 dark:text-[#C8C6C3] text-[15px] flow-root leading-6 before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-[15px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-6 before:list-outside before:list-disc before:mb-[-6.15px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-[15px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-6 after:list-outside after:list-disc after:mb-[-6.3px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                {props.useCaseCategory}
              </div>
            </div>
            <h3 className="text-zinc-800 dark:text-[#F5F3F0] text-[20.2455px] font-medium box-border caret-transparent flow-root leading-[24.2946px] max-w-[326.283px] font-serif md:text-[18.5714px] md:leading-[22.2857px] md:max-w-[299.318px] before:accent-auto before:box-border before:caret-transparent before:text-zinc-800 before:table before:text-[20.2455px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[24.2946px] before:list-outside before:list-disc before:mb-[-4.24487px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-serif before:md:text-[18.5714px] before:md:leading-[22.2857px] before:md:mb-[-3.88996px] after:accent-auto after:box-border after:caret-transparent after:text-zinc-800 after:table after:text-[20.2455px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[24.2946px] after:list-outside after:list-disc after:mb-[-4.44732px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-serif after:md:text-[18.5714px] after:md:leading-[22.2857px] after:md:mb-[-4.07567px]">
              {props.useCaseTitle}
            </h3>     
          </div>
          <p className="text-zinc-600 dark:text-[#C8C6C3] text-[17px] box-border caret-transparent flow-root leading-[27.2px] max-w-none md:text-[15px] md:leading-6 md:max-w-[362.397px] before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-[17px] before:not-italic before:normal-nums before:font-normal before:tracking-[normal] before:leading-[27.2px] before:list-outside before:list-disc before:mb-[-6.96375px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans before:md:text-[15px] before:md:leading-6 before:md:mb-[-6.15px] after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-[17px] after:not-italic after:normal-nums after:font-normal after:tracking-[normal] after:leading-[27.2px] after:list-outside after:list-disc after:mb-[-7.13375px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans after:md:text-[15px] after:md:leading-6 after:md:mb-[-6.3px]">
            {props.useCaseDescription}
          </p>
        </div>
      </div>
    );
  }

  return null;
};
