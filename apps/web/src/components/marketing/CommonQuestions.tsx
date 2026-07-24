import { CTABanner } from "@/components/marketing/CTABanner";

export type QuestionItem = {
  q: string;
  a: string;
};

export type CommonQuestionsProps = {
  title?: string;
  items: QuestionItem[];
  ctaTitle?: string;
  ctaButtonText?: string;
  ctaButtonUrl?: string;
};

export const CommonQuestions = ({
  title = "Common\nquestions",
  items,
  ctaTitle,
  ctaButtonText,
  ctaButtonUrl = "/sign-in",
}: CommonQuestionsProps) => {
  return (
    <>
      {/* Questions section */}
      <section className="relative items-stretch bg-stone-50 dark:bg-[#1A1918] flex flex-col justify-center">
        <div className="absolute bg-stone-200 dark:bg-[#3A3935] h-px w-full top-0"></div>
        <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-16 md:gap-24">
            <div>
              <h2 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[24px] leading-[1.2] md:text-[28px] sticky top-32 whitespace-pre-line">
                {title}
              </h2>
            </div>
            <div className="flex flex-col gap-0">
              {items.map((item, i) => (
                <div key={i} className="py-8 border-b border-stone-200 dark:border-[#3A3935] last:border-0">
                  <div className="text-[16px] font-medium text-neutral-900 dark:text-[#F5F3F0] mb-3">
                    {item.q}
                  </div>
                  <p className="text-zinc-500 dark:text-[#9E9C99] text-[15px] leading-[1.7]">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
      </section>

      {ctaTitle && ctaButtonText && (
        <CTABanner
          title={ctaTitle}
          buttonText={ctaButtonText}
          buttonUrl={ctaButtonUrl}
        />
      )}
    </>
  );
};
