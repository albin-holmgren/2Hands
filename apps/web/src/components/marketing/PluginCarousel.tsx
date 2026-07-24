export type PluginCarouselProps = {
  variant: string;
  title?: string;
  imageUrl?: string;
  description?: string;
  linkUrl?: string;
  linkText?: string;
  slides?: Array<{
    iconUrl: string;
    iconAlt: string;
    category: string;
    title: string;
    description: React.ReactNode;
    linkUrl: string;
    linkText: string;
  }>;
  currentSlide?: number;
  totalSlides?: number;
  onPrevious?: () => void;
  onNext?: () => void;
  onSlideSelect?: (index: number) => void;
};

export const PluginCarousel = (props: PluginCarouselProps) => {
  if (props.variant === "single") {
    return (
      <div className="absolute text-[19.0491px] box-border caret-transparent gap-x-[28.1964px] hidden flex-col leading-[30.4786px] gap-y-[28.1964px] w-[216px] md:text-[19.8571px] md:gap-x-[31.4286px] md:flex md:leading-[31.7714px] md:gap-y-[31.4286px] left-[0%] bottom-[10%]">
        <article className="relative text-[19.0491px] box-border caret-transparent gap-x-4 flex-col shrink-0 justify-between leading-[30.4786px] max-w-full gap-y-4 text-left w-[216px] px-2 md:text-[19.8571px] md:leading-[31.7714px] md:px-0">
          <div className="static text-base bg-transparent shadow-none box-content caret-black gap-x-[normal] block flex-row h-auto justify-normal leading-[normal] gap-y-[normal] w-auto rounded-none md:relative md:text-[19.8571px] md:aspect-auto md:bg-white md:shadow-[rgba(0,0,0,0.05)_0px_4px_24px_0px] md:box-border md:caret-transparent md:gap-x-4 md:flex md:flex-col md:h-full md:justify-between md:leading-[31.7714px] md:overscroll-x-auto md:overscroll-y-auto md:gap-y-4 md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:border md:border-stone-200 md:[mask-position:0%] md:bg-left-top md:p-4 md:scroll-m-0 md:scroll-p-[auto] md:rounded-2xl md:border-solid">
            <div className="[align-items:normal] box-content caret-black gap-x-[normal] block flex-nowrap justify-normal min-h-0 min-w-0 gap-y-[normal] mt-0 md:items-center md:aspect-auto md:box-border md:caret-transparent md:gap-x-2 md:flex md:flex-wrap md:justify-start md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:gap-y-2 md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:mt-1 md:scroll-m-0 md:scroll-p-[auto]">
              <div className="text-base font-normal box-content caret-black block tracking-[normal] leading-[normal] min-h-0 min-w-0 md:text-xs md:font-semibold md:aspect-auto md:box-border md:caret-transparent md:flow-root md:tracking-[0.12px] md:leading-[19.2px] md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] before:md:accent-auto before:md:box-border before:md:caret-transparent before:md:text-neutral-900 before:md:table before:md:text-xs before:md:not-italic before:md:normal-nums before:md:font-semibold before:md:tracking-[0.12px] before:md:leading-[19.2px] before:md:list-outside before:md:list-disc before:md:mb-[-4.91375px] before:md:pointer-events-auto before:md:text-left before:md:no-underline before:md:indent-[0px] before:md:normal-case before:md:visible before:md:border-separate before:md:font-sans after:md:accent-auto after:md:box-border after:md:caret-transparent after:md:text-neutral-900 after:md:table after:md:text-xs after:md:not-italic after:md:normal-nums after:md:font-semibold after:md:tracking-[0.12px] after:md:leading-[19.2px] after:md:list-outside after:md:list-disc after:md:mb-[-5.03375px] after:md:pointer-events-auto after:md:text-left after:md:no-underline after:md:indent-[0px] after:md:normal-case after:md:visible after:md:border-separate after:md:font-sans">
                {props.title}
              </div>
            </div>
            <div className="box-content caret-black gap-x-[normal] block basis-auto flex-row grow-0 justify-normal min-h-0 min-w-0 gap-y-[normal] w-auto md:aspect-auto md:box-border md:caret-transparent md:gap-x-4 md:flex md:basis-[0%] md:flex-col md:grow md:justify-between md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:gap-y-4 md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
              <div className="static box-content caret-black min-h-0 min-w-0 w-auto rounded-none md:relative md:aspect-video md:box-border md:caret-transparent md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:overflow-hidden md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] md:rounded-bl md:rounded-br md:rounded-tl md:rounded-tr">
                <img
                  src={props.imageUrl}
                  alt=""
                  sizes="100vw"
                  className="box-content caret-black block max-w-none object-fill w-auto md:aspect-video md:box-border md:caret-transparent md:inline-block md:max-w-full md:object-cover md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]"
                />
              </div>
              <p className="text-black text-base box-content caret-black block tracking-[normal] leading-[normal] min-h-0 min-w-0 md:text-zinc-600 md:text-xs md:aspect-auto md:box-border md:caret-transparent md:flow-root md:tracking-[0.12px] md:leading-[19.2px] md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] before:md:accent-auto before:md:box-border before:md:caret-transparent before:md:text-zinc-600 before:md:table before:md:text-xs before:md:not-italic before:md:normal-nums before:md:font-normal before:md:tracking-[0.12px] before:md:leading-[19.2px] before:md:list-outside before:md:list-disc before:md:mb-[-4.91375px] before:md:pointer-events-auto before:md:text-left before:md:no-underline before:md:indent-[0px] before:md:normal-case before:md:visible before:md:border-separate before:md:font-sans after:md:accent-auto after:md:box-border after:md:caret-transparent after:md:text-zinc-600 after:md:table after:md:text-xs after:md:not-italic after:md:normal-nums after:md:font-normal after:md:tracking-[0.12px] after:md:leading-[19.2px] after:md:list-outside after:md:list-disc after:md:mb-[-5.03375px] after:md:pointer-events-auto after:md:text-left after:md:no-underline after:md:indent-[0px] after:md:normal-case after:md:visible after:md:border-separate after:md:font-sans">
                {props.description}
              </p>
              <div className="box-content caret-black min-h-0 min-w-0 md:aspect-auto md:box-border md:caret-transparent md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
                <div className="static text-black text-base [align-items:normal] bg-transparent shadow-none box-content caret-black block justify-normal leading-[normal] min-h-0 text-start align-baseline rounded-none md:relative md:text-neutral-600 md:text-xs md:items-center md:aspect-auto md:bg-white md:shadow-[rgb(255,255,255)_0px_0px_0px_0px,rgb(222,220,209)_0px_0px_0px_1px] md:box-border md:caret-transparent md:inline-flex md:justify-center md:leading-3 md:min-h-7 md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:text-center md:decoration-auto md:underline-offset-auto md:align-middle md:[mask-position:0%] md:bg-left-top md:p-2 md:scroll-m-0 md:scroll-p-[auto] md:rounded-md">
                  <div className="box-content caret-black block md:aspect-auto md:box-border md:caret-transparent md:hidden md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]"></div>
                  <div className="font-normal box-content caret-black block tracking-[normal] leading-[normal] min-h-0 min-w-0 px-0 md:font-medium md:aspect-auto md:box-border md:caret-transparent md:flow-root md:tracking-[0.12px] md:leading-[19.2px] md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:px-1 md:scroll-m-0 md:scroll-p-[auto] before:md:accent-auto before:md:box-border before:md:caret-transparent before:md:text-neutral-600 before:md:table before:md:text-xs before:md:not-italic before:md:normal-nums before:md:font-medium before:md:tracking-[0.12px] before:md:leading-[19.2px] before:md:list-outside before:md:list-disc before:md:mb-[-4.91375px] before:md:pointer-events-auto before:md:text-center before:md:no-underline before:md:indent-[0px] before:md:normal-case before:md:visible before:md:border-separate before:md:font-sans after:md:accent-auto after:md:box-border after:md:caret-transparent after:md:text-neutral-600 after:md:table after:md:text-xs after:md:not-italic after:md:normal-nums after:md:font-medium after:md:tracking-[0.12px] after:md:leading-[19.2px] after:md:list-outside after:md:list-disc after:md:mb-[-5.03375px] after:md:pointer-events-auto after:md:text-center after:md:no-underline after:md:indent-[0px] after:md:normal-case after:md:visible after:md:border-separate after:md:font-sans">
                    {props.linkText}
                  </div>
                  <div className="static box-content caret-black h-auto w-auto z-auto rounded-none inset-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:h-full md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:z-[3] md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] md:rounded-md md:inset-[0%]">
                    <a
                      href={props.linkUrl}
                      className="static box-content caret-black inline h-auto max-w-none outline-offset-0 w-auto rounded-none inset-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:block md:h-full md:max-w-full md:outline-offset-4 md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] md:rounded-md md:inset-[0%]"
                    >
                      <span className="static box-content caret-black inline h-auto text-wrap w-auto mx-0 top-auto inset-x-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:block md:h-px md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:text-nowrap md:w-px md:overflow-hidden md:[mask-position:0%] md:bg-left-top md:mx-auto md:scroll-m-0 md:scroll-p-[auto] md:top-[0%] md:inset-x-[0%]">
                        {props.linkText}
                      </span>
                    </a>
                    <button
                      type="button"
                      className="static bg-zinc-100 caret-black inline-block h-auto outline-offset-0 w-auto rounded-none inset-auto md:absolute md:aspect-auto md:bg-transparent md:caret-transparent md:hidden md:h-full md:outline-offset-4 md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:[mask-position:0%] md:bg-left-top md:p-0 md:scroll-m-0 md:scroll-p-[auto] md:rounded-md md:inset-[0%]"
                    >
                      <span className="static box-content caret-black inline h-auto text-wrap w-auto mx-0 top-auto inset-x-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:block md:h-px md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:text-nowrap md:w-px md:overflow-hidden md:[mask-position:0%] md:bg-left-top md:mx-auto md:scroll-m-0 md:scroll-p-[auto] md:top-[0%] md:inset-x-[0%]">
                        {props.linkText}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="absolute text-[19.0491px] box-border caret-transparent gap-x-[28.1964px] hidden flex-col leading-[30.4786px] gap-y-[28.1964px] w-[216px] md:text-[19.8571px] md:gap-x-[31.4286px] md:flex md:leading-[31.7714px] md:gap-y-[31.4286px] right-[0%] top-[0%]">
      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] min-h-0 min-w-0 w-[216px] md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
        <div className="text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
        <div className="text-[19.0491px] box-border caret-transparent hidden leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
        <div className="relative text-[19.0491px] box-border caret-transparent leading-[30.4786px] list-none w-full z-[1] mx-auto md:text-[19.8571px] md:leading-[31.7714px]">
          <div className="relative text-[19.0491px] caret-transparent flex h-full leading-[30.4786px] w-full z-[1] md:text-[19.8571px] md:leading-[31.7714px]">
            {props.slides?.map((slide, index) => (
              <div
                key={index}
                role="group"
                aria-label={`${index + 1} / ${props.totalSlides || props.slides?.length}`}
                className={
                  index === 0
                    ? "relative text-[19.0491px] box-border caret-transparent flex flex-col shrink-0 h-0 leading-[30.4786px] min-h-0 min-w-0 origin-[50%_100%] w-[216px] z-[3] overflow-hidden md:text-[19.8571px] md:h-auto md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]"
                    : index === 1
                      ? "relative text-[19.0491px] box-border caret-transparent flex flex-col shrink-0 h-0 leading-[30.4786px] min-h-0 min-w-0 transform-none origin-[50%_100%] w-[216px] z-[2] overflow-hidden md:text-[19.8571px] md:h-[233px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]"
                      : "relative text-[19.0491px] box-border caret-transparent flex flex-col shrink-0 h-0 leading-[30.4786px] min-h-0 min-w-0 transform-none origin-[50%_100%] w-[216px] z-[1] overflow-hidden md:text-[19.8571px] md:h-[233px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]"
                }
              >
   <div className="text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] min-h-0 min-w-0 w-full md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
                  <article className="relative text-[19.0491px] box-border caret-transparent gap-x-4 flex-col shrink-0 h-auto justify-between leading-[30.4786px] list-disc max-w-full min-h-[auto] min-w-[auto] gap-y-4 text-left w-[216px] px-2 md:text-[19.8571px] md:h-full md:leading-[31.7714px] md:list-none md:min-h-0 md:min-w-0 md:px-0">
                    <div className="static text-base bg-transparent shadow-none box-content caret-black gap-x-[normal] block flex-row h-auto justify-normal leading-[normal] gap-y-[normal] w-auto rounded-none md:relative md:text-[19.8571px] md:aspect-auto md:bg-white md:shadow-[rgb(20,20,19)_0px_0px_0px_0px] md:box-border md:caret-transparent md:gap-x-4 md:flex md:flex-col md:h-full md:justify-between md:leading-[31.7714px] md:overscroll-x-auto md:overscroll-y-auto md:gap-y-4 md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:border md:border-stone-200 md:[mask-position:0%] md:bg-left-top md:p-4 md:scroll-m-0 md:scroll-p-[auto] md:rounded-2xl md:border-solid">
                      <div className="[align-items:normal] box-content caret-black gap-x-[normal] block min-h-0 min-w-0 gap-y-[normal] md:items-center md:aspect-auto md:box-border md:caret-transparent md:gap-x-2 md:flex md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:gap-y-2 md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
                        <div className="text-black box-content caret-black min-h-0 min-w-0 w-auto md:text-zinc-600 md:aspect-auto md:box-border md:caret-transparent md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-5 md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
                          <div className="box-content caret-black block md:aspect-auto md:box-border md:caret-transparent md:contents md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
                            <img
                              src={slide.iconUrl}
                              alt={slide.iconAlt}
                              className="box-content caret-black h-auto align-middle w-auto md:aspect-auto md:box-border md:caret-transparent md:h-full md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:align-baseline md:w-full md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]"
                            />
                          </div>
                        </div>
                        <div className="text-black text-base box-content caret-black block tracking-[normal] leading-[normal] min-h-0 min-w-0 md:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] md:text-xs md:aspect-auto md:box-border md:caret-transparent md:flow-root md:tracking-[0.12px] md:leading-[19.2px] md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] before:md:accent-auto before:md:box-border before:md:caret-transparent before:md:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] before:md:table before:md:text-xs before:md:not-italic before:md:normal-nums before:md:font-normal before:md:tracking-[0.12px] before:md:leading-[19.2px] before:md:list-outside before:md:list-none before:md:mb-[-4.91375px] before:md:pointer-events-auto before:md:text-left before:md:no-underline before:md:indent-[0px] before:md:normal-case before:md:visible before:md:border-separate before:md:font-sans after:md:accent-auto after:md:box-border after:md:caret-transparent after:md:text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] after:md:table after:md:text-xs after:md:not-italic after:md:normal-nums after:md:font-normal after:md:tracking-[0.12px] after:md:leading-[19.2px] after:md:list-outside after:md:list-none after:md:mb-[-5.03375px] after:md:pointer-events-auto after:md:text-left after:md:no-underline after:md:indent-[0px] after:md:normal-case after:md:visible after:md:border-separate after:md:font-sans">
                          {slide.category}
                        </div>
                      </div>
                      <div className="[align-items:normal] box-content caret-black gap-x-[normal] block flex-nowrap justify-normal min-h-0 min-w-0 gap-y-[normal] mt-0 md:items-center md:aspect-auto md:box-border md:caret-transparent md:gap-x-2 md:flex md:flex-wrap md:justify-start md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:gap-y-2 md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:mt-1 md:scroll-m-0 md:scroll-p-[auto]">
                        <div className="text-base font-normal box-content caret-black block tracking-[normal] leading-[normal] min-h-0 min-w-0 md:text-xs md:font-semibold md:aspect-auto md:box-border md:caret-transparent md:flow-root md:tracking-[0.12px] md:leading-[19.2px] md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] before:md:accent-auto before:md:box-border before:md:caret-transparent before:md:text-neutral-900 before:md:table before:md:text-xs before:md:not-italic before:md:normal-nums before:md:font-semibold before:md:tracking-[0.12px] before:md:leading-[19.2px] before:md:list-outside before:md:list-none before:md:mb-[-4.91375px] before:md:pointer-events-auto before:md:text-left before:md:no-underline before:md:indent-[0px] before:md:normal-case before:md:visible before:md:border-separate before:md:font-sans after:md:accent-auto after:md:box-border after:md:caret-transparent after:md:text-neutral-900 after:md:table after:md:text-xs after:md:not-italic after:md:normal-nums after:md:font-semibold after:md:tracking-[0.12px] after:md:leading-[19.2px] after:md:list-outside after:md:list-none after:md:mb-[-5.03375px] after:md:pointer-events-auto after:md:text-left after:md:no-underline after:md:indent-[0px] after:md:normal-case after:md:visible after:md:border-separate after:md:font-sans">
                          {slide.title}
                        </div>
                      </div>
                      <div className="box-content caret-black gap-x-[normal] block basis-auto flex-row grow-0 justify-normal min-h-0 min-w-0 gap-y-[normal] w-auto md:aspect-auto md:box-border md:caret-transparent md:gap-x-4 md:flex md:basis-[0%] md:flex-col md:grow md:justify-between md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:gap-y-4 md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
                        <p className="text-black text-base box-content caret-black block tracking-[normal] leading-[normal] min-h-0 min-w-0 md:text-zinc-600 md:text-xs md:aspect-auto md:box-border md:caret-transparent md:flow-root md:tracking-[0.12px] md:leading-[19.2px] md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] before:md:accent-auto before:md:box-border before:md:caret-transparent before:md:text-zinc-600 before:md:table before:md:text-xs before:md:not-italic before:md:normal-nums before:md:font-normal before:md:tracking-[0.12px] before:md:leading-[19.2px] before:md:list-outside before:md:list-none before:md:mb-[-4.91375px] before:md:pointer-events-auto before:md:text-left before:md:no-underline before:md:indent-[0px] before:md:normal-case before:md:visible before:md:border-separate before:md:font-sans after:md:accent-auto after:md:box-border after:md:caret-transparent after:md:text-zinc-600 after:md:table after:md:text-xs after:md:not-italic after:md:normal-nums after:md:font-normal after:md:tracking-[0.12px] after:md:leading-[19.2px] after:md:list-outside after:md:list-none after:md:mb-[-5.03375px] after:md:pointer-events-auto after:md:text-left after:md:no-underline after:md:indent-[0px] after:md:normal-case after:md:visible after:md:border-separate after:md:font-sans">
                          {slide.description}
                        </p>
                        <div className="box-content caret-black min-h-0 min-w-0 md:aspect-auto md:box-border md:caret-transparent md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
                          <div className="static text-black text-base [align-items:normal] bg-transparent shadow-none box-content caret-black block justify-normal leading-[normal] min-h-0 text-start align-baseline rounded-none md:relative md:text-neutral-600 md:text-xs md:items-center md:aspect-auto md:bg-white md:shadow-[rgb(255,255,255)_0px_0px_0px_0px,rgb(222,220,209)_0px_0px_0px_1px] md:box-border md:caret-transparent md:inline-flex md:justify-center md:leading-3 md:min-h-7 md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:text-center md:decoration-auto md:underline-offset-auto md:align-middle md:[mask-position:0%] md:bg-left-top md:p-2 md:scroll-m-0 md:scroll-p-[auto] md:rounded-md">
                            <div className="box-content caret-black block md:aspect-auto md:box-border md:caret-transparent md:hidden md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]"></div>
                            <div className="font-normal box-content caret-black block tracking-[normal] leading-[normal] min-h-0 min-w-0 px-0 md:font-medium md:aspect-auto md:box-border md:caret-transparent md:flow-root md:tracking-[0.12px] md:leading-[19.2px] md:min-h-[auto] md:min-w-[auto] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:px-1 md:scroll-m-0 md:scroll-p-[auto] before:md:accent-auto before:md:box-border before:md:caret-transparent before:md:text-neutral-600 before:md:table before:md:text-xs before:md:not-italic before:md:normal-nums before:md:font-medium before:md:tracking-[0.12px] before:md:leading-[19.2px] before:md:list-outside before:md:list-none before:md:mb-[-4.91375px] before:md:pointer-events-auto before:md:text-center before:md:no-underline before:md:indent-[0px] before:md:normal-case before:md:visible before:md:border-separate before:md:font-sans after:md:accent-auto after:md:box-border after:md:caret-transparent after:md:text-neutral-600 after:md:table after:md:text-xs after:md:not-italic after:md:normal-nums after:md:font-medium after:md:tracking-[0.12px] after:md:leading-[19.2px] after:md:list-outside after:md:list-none after:md:mb-[-5.03375px] after:md:pointer-events-auto after:md:text-center after:md:no-underline after:md:indent-[0px] after:md:normal-case after:md:visible after:md:border-separate after:md:font-sans">
                              {slide.linkText}
                            </div>
                            <div className="static box-content caret-black h-auto w-auto z-auto rounded-none inset-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:h-full md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:z-[3] md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] md:rounded-md md:inset-[0%]">
                              <a
                                href={slide.linkUrl}
                                className="static box-content caret-black inline h-auto max-w-none outline-offset-0 w-auto rounded-none inset-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:block md:h-full md:max-w-full md:outline-offset-4 md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] md:rounded-md md:inset-[0%]"
                              >
                                <span className="static box-content caret-black inline h-auto text-wrap w-auto mx-0 top-auto inset-x-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:block md:h-px md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:text-nowrap md:w-px md:overflow-hidden md:[mask-position:0%] md:bg-left-top md:mx-auto md:scroll-m-0 md:scroll-p-[auto] md:top-[0%] md:inset-x-[0%]">
                                  {slide.linkText}
                                </span>
                              </a>
                              <button
                                type="button"
                                className="static bg-zinc-100 caret-black inline-block h-auto outline-offset-0 w-auto rounded-none inset-auto md:absolute md:aspect-auto md:bg-transparent md:caret-transparent md:hidden md:h-full md:outline-offset-4 md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:[mask-position:0%] md:bg-left-top md:p-0 md:scroll-m-0 md:scroll-p-[auto] md:rounded-md md:inset-[0%]"
                              >
                                <span className="static box-content caret-black inline h-auto text-wrap w-auto mx-0 top-auto inset-x-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:block md:h-px md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:text-nowrap md:w-px md:overflow-hidden md:[mask-position:0%] md:bg-left-top md:mx-auto md:scroll-m-0 md:scroll-p-[auto] md:top-[0%] md:inset-x-[0%]">
                                  {slide.linkText}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            ))}
          </div>
        </div>
         <div className="text-[19.0491px] box-border caret-transparent gap-x-4 flex justify-between leading-[30.4786px] gap-y-4 w-full mt-6 md:text-[19.8571px] md:leading-[31.7714px]">
          <div
            role="button"
            aria-label="Previous slide"
            className="relative text-neutral-600 text-[19.0491px] items-center aspect-square bg-white shadow-[rgb(255,255,255)_0px_0px_0px_0px,rgb(222,220,209)_0px_0px_0px_1px] box-border caret-transparent flex shrink-0 justify-center leading-[30.4786px] min-h-0 min-w-0 opacity-30 outline-offset-4 pointer-events-none align-middle w-10 rounded-xl md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]"
            onClick={props.onPrevious}
          >
            <div className="relative text-[19.0491px] aspect-square box-border caret-transparent leading-[30.4786px] min-h-0 min-w-0 w-4 md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
              <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                <img
                  src="https://c.animaapp.com/mmaathg2cJ7hC9/assets/icon-49.svg"
                  alt="Icon"
                  className="text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]"
                />
              </div>
            </div>
            <div className="absolute text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] w-full z-[3] rounded-xl inset-[0%] md:text-[19.8571px] md:leading-[31.7714px]">
              <a
                href="#"
                className="absolute text-[19.0491px] box-border caret-transparent hidden h-full leading-[30.4786px] max-w-full outline-offset-4 w-full rounded-xl inset-[0%] md:text-[19.8571px] md:leading-[31.7714px]"
              ></a>
              <button
                type="button"
                className="absolute text-[19.0491px] bg-transparent caret-transparent block h-full leading-[30.4786px] outline-offset-4 w-full p-0 rounded-xl inset-[0%] md:text-[19.8571px] md:leading-[31.7714px]"
              ></button>
            </div>
          </div>
          <div className="text-[19.0491px] items-center box-border caret-transparent gap-x-3 flex basis-[0%] grow flex-wrap justify-center leading-[30.4786px] min-h-0 min-w-0 gap-y-3 w-full left-0 bottom-2 md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
            {props.slides?.map((_, index) => (
              <span
                key={index}
                role="button"
                aria-label={`Go to slide ${index + 1}`}
                className={
                  index === (props.currentSlide || 0)
                    ? "text-[19.0491px] bg-neutral-900 box-border caret-transparent block h-[5px] leading-[30.4786px] min-h-0 min-w-0 outline-offset-4 w-[5px] mx-1 rounded-[50%] md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]"
                    : "text-[19.0491px] bg-stone-300 box-border caret-transparent block h-[5px] leading-[30.4786px] min-h-0 min-w-0 outline-offset-4 w-[5px] mx-1 rounded-[50%] md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]"
                }
                onClick={() => props.onSlideSelect?.(index)}
              ></span>
            ))}
          </div>
          <div
            role="button"
            aria-label="Next slide"
            className="relative text-neutral-600 text-[19.0491px] items-center aspect-square bg-white shadow-[rgb(255,255,255)_0px_0px_0px_0px,rgb(222,220,209)_0px_0px_0px_1px] box-border caret-transparent flex shrink-0 justify-center leading-[30.4786px] min-h-0 min-w-0 outline-offset-4 align-middle w-10 rounded-xl md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]"
            onClick={props.onNext}
          >
            <div className="relative text-[19.0491px] aspect-square box-border caret-transparent leading-[30.4786px] min-h-0 min-w-0 w-4 md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
              <div className="text-[19.0491px] box-border caret-transparent contents leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                <img
                  src="https://c.animaapp.com/mmaathg2cJ7hC9/assets/icon-50.svg"
                  alt="Icon"
                  className="text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] w-full md:text-[19.8571px] md:leading-[31.7714px]"
                />
              </div>
            </div>
            <div className="absolute text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] w-full z-[3] rounded-xl inset-[0%] md:text-[19.8571px] md:leading-[31.7714px]">
              <a
                href="#"
                className="absolute text-[19.0491px] box-border caret-transparent hidden h-full leading-[30.4786px] max-w-full outline-offset-4 w-full rounded-xl inset-[0%] md:text-[19.8571px] md:leading-[31.7714px]"
              ></a>
              <button
                type="button"
                className="absolute text-[19.0491px] bg-transparent caret-transparent block h-full leading-[30.4786px] outline-offset-4 w-full p-0 rounded-xl inset-[0%] md:text-[19.8571px] md:leading-[31.7714px]"
              ></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
