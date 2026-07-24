export type FooterColumnProps = {
  sections: Array<{
    title: string;
    items: Array<{
      label: string;
      href?: string;
      isPrivacyChoices?: boolean;
    }>;
  }>;
};

export const FooterColumn = (props: FooterColumnProps) => {
  return (
    <div className="text-[19.0491px] box-border caret-transparent gap-x-8 grid flex-col auto-cols-[1fr] grid-cols-[1fr_1fr] grid-rows-[auto] leading-[30.4786px] gap-y-8 md:text-[19.8571px] md:gap-x-[46.8571px] md:flex md:auto-cols-auto md:grid-cols-none md:grid-rows-none md:leading-[31.7714px] md:gap-y-[46.8571px]">
      {props.sections.map((section, sectionIndex) => (
        <div
          key={sectionIndex}
          className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"
        >
          <div className="text-neutral-500 text-xs box-border caret-transparent flow-root tracking-[0.12px] leading-[19.2px] mb-2 before:accent-auto before:box-border before:caret-transparent before:text-neutral-500 before:table before:text-xs before:not-italic before:normal-nums before:font-normal before:tracking-[0.12px] before:leading-[19.2px] before:list-outside before:list-disc before:mb-[-4.91375px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-neutral-500 after:table after:text-xs after:not-italic after:normal-nums after:font-normal after:tracking-[0.12px] after:leading-[19.2px] after:list-outside after:list-disc after:mb-[-5.03375px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
            {section.title}
          </div>
          <ul
            role="list"
            className="text-[19.0491px] items-start box-border caret-transparent flex flex-col justify-start leading-[30.4786px] list-none pl-0 md:text-[19.8571px] md:leading-[31.7714px]"
          >
            {section.items.map((item, itemIndex) => (
              <li
                key={itemIndex}
                className={
                  item.isPrivacyChoices
                    ? "relative text-[19.0491px] box-border caret-transparent leading-[30.4786px] py-2 md:text-[19.8571px] md:leading-[31.7714px] content-center items-center flex justify-start"
                    : "relative text-[19.0491px] box-border caret-transparent block leading-[30.4786px] py-2 md:text-[19.8571px] md:leading-[31.7714px]"
                }
              >
                {item.isPrivacyChoices ? (
                  <>
                    <button className="text-[19.0491px] bg-transparent caret-transparent block leading-[30.4786px] outline-offset-4 p-0 md:text-[19.8571px] md:leading-[31.7714px]">
                      <div className="text-xs box-border caret-transparent flow-root tracking-[0.12px] leading-[19.2px] before:accent-auto before:box-border before:caret-transparent before:text-stone-50 before:table before:text-xs before:not-italic before:normal-nums before:font-normal before:tracking-[0.12px] before:leading-[19.2px] before:list-outside before:list-none before:mb-[-4.91375px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-stone-50 after:table after:text-xs after:not-italic after:normal-nums after:font-normal after:tracking-[0.12px] after:leading-[19.2px] after:list-outside after:list-none after:mb-[-5.03375px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                        {item.label}
                      </div>
                    </button>
                    <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
                      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
                      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"></div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs box-border caret-transparent flow-root tracking-[0.12px] leading-[19.2px] before:accent-auto before:box-border before:caret-transparent before:text-stone-50 before:table before:text-xs before:not-italic before:normal-nums before:font-normal before:tracking-[0.12px] before:leading-[19.2px] before:list-outside before:list-none before:mb-[-4.91375px] before:pointer-events-auto before:text-start before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-stone-50 after:table after:text-xs after:not-italic after:normal-nums after:font-normal after:tracking-[0.12px] after:leading-[19.2px] after:list-outside after:list-none after:mb-[-5.03375px] after:pointer-events-auto after:text-start after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                      {item.label}
                    </div>
                    <div className="absolute text-[19.0491px] box-border caret-transparent h-full leading-[30.4786px] w-full z-[3] inset-[0%] md:text-[19.8571px] md:leading-[31.7714px]">
                      <a
                        href={item.href}
                        className="absolute text-[19.0491px] box-border caret-transparent block h-full leading-[30.4786px] max-w-full outline-offset-4 w-full inset-[0%] md:text-[19.8571px] md:leading-[31.7714px]"
                      ></a>
                      <button
                        type="button"
                        className="absolute text-[19.0491px] bg-transparent caret-transparent hidden h-full leading-[30.4786px] outline-offset-4 w-full p-0 inset-[0%] md:text-[19.8571px] md:leading-[31.7714px]"
                      ></button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
