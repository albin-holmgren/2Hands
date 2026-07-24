export type CTABannerProps = {
  title: string;
  description?: string;
  buttonText: string;
  buttonUrl: string;
};

export const CTABanner = ({ title, description, buttonText, buttonUrl }: CTABannerProps) => {
  return (
    <section className="relative items-stretch bg-white dark:bg-[#2C2B27] flex flex-col justify-center">
      <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
      <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
      <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <div className="max-w-[520px]">
            <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[24px] leading-[1.2] md:text-[30px]">
              {title}
            </h2>
            {description && (
              <p className="mt-3 text-zinc-500 dark:text-[#9E9C99] text-[15px] leading-[1.65]">
                {description}
              </p>
            )}
          </div>
          <div className="shrink-0">
            <div className="relative inline-flex text-stone-50 bg-neutral-900 dark:text-neutral-900 dark:bg-white text-[17px] items-center caret-transparent justify-center leading-[17px] min-h-10 text-center align-middle px-6 py-2.5 rounded-[8.5px] shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px] dark:shadow-[rgb(200,200,200)_0px_0px_0px_0px,rgb(150,150,150)_0px_0px_0px_1px]">
              <div className="relative font-medium z-[1] px-2">{buttonText}</div>
              <div className="absolute h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                <a href={buttonUrl} className="absolute block h-full max-w-full outline-offset-4 w-full rounded-[8.5px] inset-[0%]"></a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
    </section>
  );
};
