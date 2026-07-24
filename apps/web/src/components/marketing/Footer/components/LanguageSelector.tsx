export const LanguageSelector = () => {
  return (
    <div className="relative text-[19.0491px] box-border caret-transparent leading-[30.4786px] z-10 md:text-[19.8571px] md:leading-[31.7714px]">
      <div className="text-[19.0491px] box-border caret-transparent leading-[30.4786px] md:text-[19.8571px] md:leading-[31.7714px]">
        <div className="relative text-xs box-border caret-transparent inline-flex leading-[19.2px] text-left z-[900] mx-auto">
          <div
            role="button"
            className="relative text-stone-400 items-center bg-neutral-900 box-border caret-transparent gap-x-1.5 flex justify-start outline-offset-4 gap-y-1.5 text-nowrap align-top border border-zinc-800 mx-auto px-[16.8px] py-[9.6px] rounded-xl border-solid"
          >
            <div className="box-border caret-transparent text-nowrap w-[20.4px]">
              <div className="box-border caret-transparent contents text-nowrap">
                <img
                  src="https://c.animaapp.com/mmaathg2cJ7hC9/assets/icon-84.svg"
                  alt="Icon"
                  className="box-border caret-transparent h-full text-nowrap w-full"
                />
              </div>
            </div>
            <div className="box-border caret-transparent text-nowrap">
              English (US)
            </div>
            <img
              src="https://c.animaapp.com/mmaathg2cJ7hC9/assets/icon-85.svg"
              alt="Icon"
              className="box-border caret-transparent text-nowrap w-[14.4px] -mr-1.5"
            />
          </div>
          <nav className="absolute bg-neutral-900 box-border caret-transparent hidden min-w-full border border-zinc-800 -mb-px p-1.5 rounded-t-xl border-solid bottom-full inset-x-[0%]">
            <div role="list" className="box-border caret-transparent">
              <div role="listitem" className="box-border caret-transparent">
                <a
                  href="/"
                  className="text-stone-400 box-border caret-transparent gap-x-[3.6px] block outline-offset-4 gap-y-[3.6px] px-[14.4px] py-[8.4px] rounded-lg"
                >
                  English (US)
                </a>
              </div>
              <div role="listitem" className="box-border caret-transparent">
                <a
                  href="/ja-jp"
                  className="text-stone-400 box-border caret-transparent gap-x-[3.6px] block outline-offset-4 gap-y-[3.6px] px-[14.4px] py-[8.4px] rounded-lg"
                >
                  日本語 (Japan)
                </a>
              </div>
              <div role="listitem" className="box-border caret-transparent">
                <a
                  href="/de-de"
                  className="text-stone-400 box-border caret-transparent gap-x-[3.6px] block outline-offset-4 gap-y-[3.6px] px-[14.4px] py-[8.4px] rounded-lg"
                >
                  Deutsch (Germany)
                </a>
              </div>
              <div role="listitem" className="box-border caret-transparent">
                <a
                  href="/fr-fr"
                  className="text-stone-400 box-border caret-transparent gap-x-[3.6px] block outline-offset-4 gap-y-[3.6px] px-[14.4px] py-[8.4px] rounded-lg"
                >
                  Français (France)
                </a>
              </div>
              <div role="listitem" className="box-border caret-transparent">
                <a
                  href="/ko-kr"
                  className="text-stone-400 box-border caret-transparent gap-x-[3.6px] block outline-offset-4 gap-y-[3.6px] px-[14.4px] py-[8.4px] rounded-lg"
                >
                  한국어 (South Korea)
                </a>
              </div>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
};
