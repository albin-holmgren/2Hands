"use client";

import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { 
  BrainIcon, 
  ChevronDownIcon, 
  ClockIcon, 
  CheckCircle2Icon, 
  SearchIcon, 
  GlobeIcon,
  LightbulbIcon,
  WrenchIcon,
  ImageIcon,
  SparklesIcon
} from "lucide-react";
import { createContext, memo, useContext, useMemo } from "react";

interface ChainOfThoughtContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
  null
);

const useChainOfThought = () => {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error(
      "ChainOfThought components must be used within ChainOfThought"
    );
  }
  return context;
};

export type ChainOfThoughtProps = ComponentProps<"div"> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const ChainOfThought = memo(
  ({
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    children,
    ...props
  }: ChainOfThoughtProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      defaultProp: defaultOpen,
      onChange: onOpenChange,
      prop: open,
    });

    const chainOfThoughtContext = useMemo(
      () => ({ isOpen, setIsOpen }),
      [isOpen, setIsOpen]
    );

    return (
      <ChainOfThoughtContext.Provider value={chainOfThoughtContext}>
        <div className={cn("not-prose w-full", className)} {...props}>
          {children}
        </div>
      </ChainOfThoughtContext.Provider>
    );
  }
);

export type ChainOfThoughtHeaderProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  title?: string;
  isThinking?: boolean;
};

export const ChainOfThoughtHeader = memo(
  ({ className, children, title, isThinking = false, ...props }: ChainOfThoughtHeaderProps) => {
    const { isOpen, setIsOpen } = useChainOfThought();

    return (
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center gap-2 text-sm transition-colors cursor-pointer group",
            isThinking ? "text-foreground/90" : "text-muted-foreground hover:text-foreground",
            className
          )}
          {...props}
        >
          {isThinking ? (
            <SparklesIcon className="size-4 text-primary animate-pulse" />
          ) : (
            <BrainIcon className="size-4" />
          )}
          <span className="flex-1 text-left font-medium truncate">
            {children ?? title ?? "Chain of Thought"}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-3 transition-transform duration-200 shrink-0",
              isOpen ? "rotate-180" : "rotate-0"
            )}
          />
        </CollapsibleTrigger>
      </Collapsible>
    );
  }
);

// Step icons mapping
export const stepIcons = {
  thinking: ClockIcon,
  search: SearchIcon,
  browse: GlobeIcon,
  tool: WrenchIcon,
  work: WrenchIcon,
  image: ImageIcon,
  idea: LightbulbIcon,
  complete: CheckCircle2Icon,
};

export type StepKind = keyof typeof stepIcons;

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  icon?: LucideIcon | StepKind;
  label?: ReactNode;
  description?: ReactNode;
  status?: "complete" | "active" | "pending";
  isLast?: boolean;
  children?: ReactNode;
};

const stepStatusStyles = {
  active: "text-foreground",
  complete: "text-muted-foreground",
  pending: "text-muted-foreground/40",
};

export const ChainOfThoughtStep = memo(
  ({
    className,
    icon: IconProp = "thinking",
    label,
    description,
    status = "complete",
    isLast = false,
    children,
    ...props
  }: ChainOfThoughtStepProps) => {
    // Resolve icon from string or component
    const Icon = typeof IconProp === "string" ? stepIcons[IconProp] || LightbulbIcon : IconProp;
    
    return (
      <div
        className={cn(
          "flex text-sm",
          stepStatusStyles[status],
          className
        )}
        {...props}
      >
        {/* Timeline column - 20px width like the reference */}
        <div className="flex flex-col items-center w-5 shrink-0">
          {/* Icon container */}
          <div className={cn(
            "flex items-center justify-center pt-1",
            status === "active" && "animate-pulse"
          )}>
            <Icon className="size-4" />
          </div>
          {/* Vertical line */}
          {!isLast && (
            <div className="w-px flex-1 bg-border/60 mt-1" />
          )}
        </div>
        
        {/* Content column */}
        <div className="flex-1 min-w-0 pl-2">
          {label && (
            <div className={cn(
              "font-medium leading-relaxed",
              status === "active" && "text-foreground"
            )}>
              {label}
            </div>
          )}
          {description && (
            <div className="text-muted-foreground text-sm mt-1 leading-relaxed">
              {description}
            </div>
          )}
          {children && (
            <div className="mt-2">
              {children}
            </div>
          )}
        </div>
      </div>
    );
  }
);

// Search result item with favicon/domain - compact style like reference
export type ChainOfThoughtSearchResultItem = {
  title: string;
  url?: string;
  favicon?: string;
  source?: string;
};

export type ChainOfThoughtSearchResultsProps = {
  results?: ChainOfThoughtSearchResultItem[];
  query?: string;
  className?: string;
};

// Get favicon URL for a domain
function getFaviconUrl(_url?: string): string | null {
  // Returns null — avoids CSP violations; caller falls back to GlobeIcon
  return null;
}

// Get source domain from URL
function getSourceFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return null;
  }
}

export const ChainOfThoughtSearchResults = memo(
  ({ className, results = [], ...props }: ChainOfThoughtSearchResultsProps) => {
    if (results.length === 0) return null;
    
    return (
      <div 
        className={cn(
          "mt-2 rounded-lg border p-1 bg-muted/20",
          className
        )}
        {...props}
      >
        <div className="flex flex-col gap-0.5">
          {results.map((result, i) => {
            const favicon = result.favicon || getFaviconUrl(result.url);
            const source = result.source || getSourceFromUrl(result.url);
            
            return (
              <a
                key={i}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-2 py-1.5 w-full rounded-md cursor-pointer transition-colors hover:bg-muted/50 group"
              >
                {/* Favicon - small 12x12 like reference */}
                <div className="flex-shrink-0 w-3 h-3 flex items-center justify-center overflow-hidden">
                  {favicon ? (
                    <img 
                      src={favicon} 
                      alt="" 
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <GlobeIcon className="size-3 text-muted-foreground" />
                  )}
                </div>
                {/* Title - truncate with flex-grow */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground/90 truncate group-hover:text-foreground transition-colors">
                    {result.title}
                  </div>
                </div>
                {/* Source domain */}
                {source && (
                  <div className="text-xs text-muted-foreground shrink-0">
                    {source}
                  </div>
                )}
              </a>
            );
          })}
        </div>
      </div>
    );
  }
);

// Legacy badge-style search results (for backward compatibility)
export type ChainOfThoughtSearchResultBadgeProps = ComponentProps<"span">;

export const ChainOfThoughtSearchResult = memo(
  ({ className, children, ...props }: ChainOfThoughtSearchResultBadgeProps) => (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs font-normal",
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
);

export type ChainOfThoughtContentProps = ComponentProps<
  typeof CollapsibleContent
>;

export const ChainOfThoughtContent = memo(
  ({ className, children, ...props }: ChainOfThoughtContentProps) => {
    const { isOpen } = useChainOfThought();

    return (
      <Collapsible open={isOpen}>
        <CollapsibleContent
          className={cn(
            "mt-2 overflow-hidden",
            "data-[state=closed]:animate-out data-[state=open]:animate-in",
            "data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2",
            "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2",
            className
          )}
          {...props}
        >
          {children}
        </CollapsibleContent>
      </Collapsible>
    );
  }
);

// Step row with search results header - for the "Lovable AI company - 10 results" style
export type ChainOfThoughtSearchStepProps = {
  query: string;
  resultsCount?: number;
  results?: ChainOfThoughtSearchResultItem[];
  status?: "complete" | "active" | "pending";
  isLast?: boolean;
};

export const ChainOfThoughtSearchStep = memo(
  ({ query, resultsCount, results, status = "complete", isLast }: ChainOfThoughtSearchStepProps) => {
    return (
      <ChainOfThoughtStep 
        icon="search" 
        status={status}
        isLast={isLast}
      >
        {/* Row with query and results count */}
        <div className="flex items-center justify-between py-1">
          <div className="text-sm text-foreground/90 truncate flex-1">{query}</div>
          {resultsCount && (
            <div className="text-xs text-muted-foreground shrink-0 pl-2">
              {resultsCount} results
            </div>
          )}
        </div>
        {/* Search results card */}
        {results && results.length > 0 && (
          <ChainOfThoughtSearchResults results={results} />
        )}
      </ChainOfThoughtStep>
    );
  }
);

// Done step component
export type ChainOfThoughtDoneProps = ComponentProps<"div"> & {
  label?: string;
};

export const ChainOfThoughtDone = memo(
  ({ className, label = "Done", ...props }: ChainOfThoughtDoneProps) => (
    <div
      className={cn(
        "flex items-center gap-3 text-sm text-muted-foreground pl-5",
        className
      )}
      {...props}
    >
      <CheckCircle2Icon className="size-4 text-green-500" />
      <span>{label}</span>
    </div>
  )
);

// Spacer component for 8px gaps like the reference
export const ChainOfThoughtSpacer = memo(
  () => <div className="h-2" />
);

export type ChainOfThoughtImageProps = ComponentProps<"div"> & {
  caption?: string;
};

export const ChainOfThoughtImage = memo(
  ({ className, children, caption, ...props }: ChainOfThoughtImageProps) => (
    <div className={cn("mt-2 space-y-2", className)} {...props}>
      <div className="relative flex max-h-[22rem] items-center justify-center overflow-hidden rounded-lg bg-muted p-3">
        {children}
      </div>
      {caption && <p className="text-muted-foreground text-xs">{caption}</p>}
    </div>
  )
);

ChainOfThought.displayName = "ChainOfThought";
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";
ChainOfThoughtSearchResults.displayName = "ChainOfThoughtSearchResults";
ChainOfThoughtSearchResult.displayName = "ChainOfThoughtSearchResult";
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";
ChainOfThoughtDone.displayName = "ChainOfThoughtDone";
ChainOfThoughtImage.displayName = "ChainOfThoughtImage";
