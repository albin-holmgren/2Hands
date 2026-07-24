"use client";

import { useState } from "react";

interface FAQItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onClick: () => void;
  index: number;
}

const FAQItem = ({ question, answer, isOpen, onClick, index }: FAQItemProps) => {
  return (
    <div
      role="listitem"
      className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] text-start md:text-[19.8571px] md:leading-[31.7714px]"
    >
      <div className="text-[19.0491px] border-b-neutral-900 border-l-neutral-900 border-r-neutral-900 border-t-stone-200 box-border caret-transparent leading-[30.4786px] border-t md:text-[19.8571px] md:leading-[31.7714px]">
        <h3 className="text-[19.0491px] box-border caret-transparent flow-root leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
          <button
            onClick={onClick}
            className="text-[19.0491px] items-center bg-transparent caret-transparent gap-x-3 flex justify-between leading-[30.4786px] outline-offset-4 gap-y-3 w-full px-0 py-[28.1964px] md:text-[19.8571px] md:leading-[31.7714px] md:py-[31.4286px] group"
            aria-expanded={isOpen}
          >
            <span className="text-[16.1473px] font-medium box-border caret-transparent flow-root leading-[19.3768px] font-display text-left md:text-[18.5714px] md:leading-[22.2857px]">
              {question}
            </span>
            <span 
              className="text-lg font-light transition-colors duration-300"
              style={{ color: isOpen ? '#D97757' : '#52525b' }}
            >
              {isOpen ? '×' : '+'}
            </span>
          </button>
        </h3>
        <div 
          className="relative text-[19.0491px] box-border caret-transparent leading-[30.4786px] w-full overflow-hidden transition-all duration-300 ease-out md:text-[19.8571px] md:leading-[31.7714px]"
          style={{
            maxHeight: isOpen ? '500px' : '0px',
            opacity: isOpen ? 1 : 0,
          }}
        >
          <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] pr-[28.1964px] pb-[28.1964px] md:text-[19.8571px] md:leading-[31.7714px] md:pr-[31.4286px] md:pb-[31.4286px]">
            <div className="text-[color(srgb_0.0784314_0.0784314_0.0745098_/_0.7)] text-[17px] box-border caret-transparent flow-root leading-[27.2px]">
              {answer}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface AnimatedFAQProps {
  faqItems: Array<{
    question: string;
    answer: string;
  }>;
}

export const AnimatedFAQ = ({ faqItems }: AnimatedFAQProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const handleClick = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div
      role="list"
      className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]"
    >
      {faqItems?.map((item, index) => (
        <FAQItem
          key={index}
          question={item.question}
          answer={item.answer}
          isOpen={openIndex === index}
          onClick={() => handleClick(index)}
          index={index}
        />
      ))}
    </div>
  );
};
