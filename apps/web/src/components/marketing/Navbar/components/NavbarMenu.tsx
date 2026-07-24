import Link from "next/link";
import { NavbarDropdown } from "@/components/marketing/Navbar/components/NavbarDropdown";

export const NavbarMenu = () => {
  return (
    <nav
      role="navigation"
      className="text-[19.0491px] box-border caret-transparent flex leading-[30.4786px] min-h-0 min-w-0 z-[1] py-3 md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]"
    >
      <div className="text-[19.0491px] items-stretch box-border caret-transparent gap-x-4 flex justify-start leading-[30.4786px] min-h-0 min-w-0 w-full md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
        <ul
          role="list"
          className="text-[19.0491px] items-stretch box-border caret-transparent flex basis-[0%] grow justify-center leading-[30.4786px] list-none min-h-0 min-w-0 pl-0 md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]"
        >
          <li className="text-[19.0491px] box-border caret-transparent flex leading-[30.4786px] min-h-0 min-w-0 md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
            <NavbarDropdown 
              label="Platform" 
              items={[
                { label: "Overview", href: "/overview", description: "See everything 2Hands can do for your team" },
                { label: "Features", href: "/features", description: "Agents, missions, workflows and more" },
                { label: "Security", href: "/security", description: "Enterprise-grade privacy and data controls" },
                { label: "Integrations", href: "/integrations", description: "Connect your existing tools and stack" },
              ]}
            />
          </li>
          <li className="text-[19.0491px] box-border caret-transparent flex leading-[30.4786px] min-h-0 min-w-0 md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
            <NavbarDropdown 
              label="Solutions" 
              items={[
                { label: "For Startups", href: "/startups", description: "Move fast with an autonomous AI workforce" },
                { label: "For Enterprises", href: "/enterprises", description: "Scale AI operations across your organisation" },
                { label: "By Use Case", href: "/use-cases", description: "Find the right workflow for your goals" },
              ]}
            />
          </li>
          <li className="text-[19.0491px] box-border caret-transparent flex leading-[30.4786px] min-h-0 min-w-0 md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto] items-center">
            <Link 
              href="/pricing" 
              className="text-[14px] font-medium tracking-wide text-zinc-800 dark:text-[#C8C6C3] hover:text-zinc-500 dark:hover:text-[#F5F3F0] px-3 py-2 transition-colors duration-150"
            >
              Pricing
            </Link>
          </li>
          <li className="text-[19.0491px] box-border caret-transparent flex leading-[30.4786px] min-h-0 min-w-0 md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
            <NavbarDropdown 
              label="Resources" 
              items={[
                { label: "Blog", href: "/", description: "Insights on AI, automation and the future of work", comingSoon: true },
                { label: "Help Center", href: "/", description: "Guides and answers for every feature", comingSoon: true },
                { label: "Community", href: "/", description: "Join builders using 2Hands in the wild", comingSoon: true },
                { label: "API Documentation", href: "/", description: "Integrate and extend the 2Hands platform", comingSoon: true },
              ]}
            />
          </li>
        </ul>
        <ul
          role="list"
          className="text-[19.0491px] box-border caret-transparent gap-x-3 flex shrink-0 leading-[30.4786px] list-none min-h-0 min-w-0 gap-y-3 z-0 pl-0 md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]"
        >
          <li className="relative text-[19.0491px] items-start box-border caret-transparent flex flex-col justify-center leading-[30.4786px] min-h-0 min-w-0 text-center z-[2] md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
            <div className="relative text-zinc-800 dark:text-[#C8C6C3] text-[15px] items-center bg-stone-50 dark:bg-[#2C2B27] hover:text-zinc-500 dark:hover:text-[#F5F3F0] shadow-[rgb(250,249,245)_0px_0px_0px_0px,rgb(209,207,197)_0px_0px_0px_1px] dark:shadow-[rgb(26,25,24)_0px_0px_0px_0px,rgb(58,56,51)_0px_0px_0px_1px] box-border caret-transparent flex shrink-0 justify-center leading-[15px] min-h-9 min-w-0 align-middle px-3 py-2 rounded-[7.5px] transition-colors duration-150 cursor-pointer md:min-w-[auto]">
              <div className="box-border caret-transparent hidden"></div>
              <div className="relative font-medium box-border caret-transparent flow-root min-h-0 min-w-0 z-[1] px-1 md:min-h-[auto] md:min-w-[auto] before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-[15px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[15px] before:list-outside before:list-none before:mb-[-1.65px] before:pointer-events-auto before:text-center before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-[15px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[15px] after:list-outside after:list-none after:mb-[-1.8px] after:pointer-events-auto after:text-center after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                Sign in
              </div>
              <div className="absolute box-border caret-transparent h-full w-full z-[3] rounded-[7.5px] inset-[0%]">
                <a
                  href="/sign-in"
                  className="absolute box-border caret-transparent block h-full max-w-full outline-offset-4 w-full rounded-[7.5px] inset-[0%]"
                ></a>
                <button
                  type="button"
                  className="absolute bg-transparent caret-transparent hidden h-full outline-offset-4 w-full p-0 rounded-[7.5px] inset-[0%]"
                ></button>
              </div>
            </div>
          </li>
          <li className="relative text-[19.0491px] items-start box-border caret-transparent flex flex-col justify-center leading-[30.4786px] min-h-0 min-w-0 text-center z-[2] md:text-[19.8571px] md:leading-[31.7714px] md:min-h-[auto] md:min-w-[auto]">
            <div className="relative text-stone-50 dark:text-neutral-900 dark:bg-white text-[15px] items-center bg-neutral-900 hover:opacity-75 dark:hover:opacity-90 shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px] dark:shadow-[rgb(200,200,200)_0px_0px_0px_0px,rgb(150,150,150)_0px_0px_0px_1px] box-border caret-transparent flex shrink-0 justify-center leading-[15px] min-h-9 min-w-0 align-middle px-3 py-2 rounded-[7.5px] transition-opacity duration-150 cursor-pointer md:min-w-[auto]">
              <div className="box-border caret-transparent hidden"></div>
              <div className="relative font-medium box-border caret-transparent flow-root min-h-0 min-w-0 z-[1] px-1 md:min-h-[auto] md:min-w-[auto] before:accent-auto before:box-border before:caret-transparent before:text-stone-50 before:table before:text-[15px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[15px] before:list-outside before:list-none before:mb-[-1.65px] before:pointer-events-auto before:text-center before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-stone-50 after:table after:text-[15px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[15px] after:list-outside after:list-none after:mb-[-1.8px] after:pointer-events-auto after:text-center after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                Try 2Hands
              </div>
              <div className="absolute box-border caret-transparent h-full w-full z-[3] rounded-[7.5px] inset-[0%]">
                <a
                  href="/signup"
                  className="absolute box-border caret-transparent block h-full max-w-full outline-offset-4 w-full rounded-[7.5px] inset-[0%]"
                ></a>
                <button
                  type="button"
                  className="absolute bg-transparent caret-transparent hidden h-full outline-offset-4 w-full p-0 rounded-[7.5px] inset-[0%]"
                ></button>
              </div>
            </div>
          </li>
          <li className="relative text-[19.0491px] items-start box-border caret-transparent hidden flex-col justify-center leading-[30.4786px] text-center z-[2] md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="relative text-zinc-600 text-[17px] items-center bg-stone-50 hover:bg-stone-100 hover:text-zinc-800 shadow-[rgb(250,249,245)_0px_0px_0px_0px,rgb(209,207,197)_0px_0px_0px_1px] box-border caret-transparent inline-flex justify-center leading-[17px] min-h-10 min-w-max align-middle w-full px-4 py-2 rounded-[8.5px] transition-colors duration-150 cursor-pointer">
              <div className="box-border caret-transparent hidden"></div>
              <div className="relative font-medium box-border caret-transparent flow-root z-[1] px-2 before:accent-auto before:box-border before:caret-transparent before:text-zinc-600 before:table before:text-[17px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[17px] before:list-outside before:list-none before:mb-[-1.87px] before:pointer-events-auto before:text-center before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-zinc-600 after:table after:text-[17px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[17px] after:list-outside after:list-none after:mb-[-2.04px] after:pointer-events-auto after:text-center after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                Sign in
              </div>
              <div className="absolute box-border caret-transparent h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                <a
                  href="/sign-in"
                  className="absolute box-border caret-transparent block h-full max-w-full outline-offset-4 w-full rounded-[8.5px] inset-[0%]"
                ></a>
                <button
                  type="button"
                  className="absolute bg-transparent caret-transparent hidden h-full outline-offset-4 w-full p-0 rounded-[8.5px] inset-[0%]"
                ></button>
              </div>
            </div>
          </li>
          <li className="relative text-[19.0491px] items-start box-border caret-transparent hidden flex-col justify-center leading-[30.4786px] text-center z-[2] md:text-[19.8571px] md:leading-[31.7714px]">
            <div className="relative text-stone-50 dark:text-neutral-900 dark:bg-white text-[17px] items-center bg-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-100 shadow-[rgb(20,20,19)_0px_0px_0px_0px,rgb(48,48,46)_0px_0px_0px_1px] dark:shadow-[rgb(200,200,200)_0px_0px_0px_0px,rgb(150,150,150)_0px_0px_0px_1px] box-border caret-transparent inline-flex justify-center leading-[17px] min-h-10 min-w-max align-middle w-full px-4 py-2 rounded-[8.5px] transition-colors duration-150 cursor-pointer">
              <div className="box-border caret-transparent hidden"></div>
              <div className="relative font-medium box-border caret-transparent flow-root z-[1] px-2 before:accent-auto before:box-border before:caret-transparent before:text-stone-50 before:table before:text-[17px] before:not-italic before:normal-nums before:font-medium before:tracking-[normal] before:leading-[17px] before:list-outside before:list-none before:mb-[-1.87px] before:pointer-events-auto before:text-center before:indent-[0px] before:normal-case before:visible before:border-separate before:font-sans after:accent-auto after:box-border after:caret-transparent after:text-stone-50 after:table after:text-[17px] after:not-italic after:normal-nums after:font-medium after:tracking-[normal] after:leading-[17px] after:list-outside after:list-none after:mb-[-2.04px] after:pointer-events-auto after:text-center after:indent-[0px] after:normal-case after:visible after:border-separate after:font-sans">
                Try 2Hands
              </div>
              <div className="absolute box-border caret-transparent h-full w-full z-[3] rounded-[8.5px] inset-[0%]">
                <a
                  href="/signup"
                  className="absolute box-border caret-transparent block h-full max-w-full outline-offset-4 w-full rounded-[8.5px] inset-[0%]"
                ></a>
                <button
                  type="button"
                  className="absolute bg-transparent caret-transparent hidden h-full outline-offset-4 w-full p-0 rounded-[8.5px] inset-[0%]"
                ></button>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </nav>
  );
};
