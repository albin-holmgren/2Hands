"use client"

/**
 * v3 persistent shell controls (UX.md §2, BRAND_GUIDELINES §14).
 *
 * - MarketplaceButton: top-LEFT circular control (44 px, subtle border,
 *   grid-dots icon — explicitly not a hamburger) that opens the marketplace sheet.
 * - AccountButton: top-right compact control — avatar + work-credits pill.
 */

import * as React from "react"
import { GripIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface MarketplaceButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** True while the marketplace sheet is open — reflected as aria-expanded. */
  open?: boolean
}

const MarketplaceButton = React.forwardRef<HTMLButtonElement, MarketplaceButtonProps>(
  ({ className, open = false, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        data-slot="marketplace-button"
        aria-label="Open marketplace"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full",
          "border border-border bg-background text-muted-foreground",
          "transition-colors duration-150",
          "hover:border-[var(--border-medium)] hover:bg-accent hover:text-foreground",
          "active:bg-[var(--surface-active)]",
          "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
          "disabled:pointer-events-none disabled:opacity-50",
          "[&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0",
          className
        )}
        {...props}
      >
        <GripIcon aria-hidden />
      </button>
    )
  }
)
MarketplaceButton.displayName = "MarketplaceButton"

interface AccountButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Display name; also used for the avatar-fallback initial. */
  name?: string
  avatarUrl?: string
  /** Remaining work credits; omitted → no credits pill. */
  credits?: number
}

function formatCredits(credits: number): string {
  if (credits >= 10_000) return `${Math.floor(credits / 1000)}k`
  return new Intl.NumberFormat("en-US").format(credits)
}

const AccountButton = React.forwardRef<HTMLButtonElement, AccountButtonProps>(
  ({ className, name, avatarUrl, credits, ...props }, ref) => {
    const initial = name?.trim().charAt(0).toUpperCase() || "?"
    return (
      <button
        ref={ref}
        type="button"
        data-slot="account-button"
        aria-label={
          typeof credits === "number"
            ? `Account and usage — ${credits} work credits`
            : "Account and usage"
        }
        className={cn(
          "flex h-11 shrink-0 items-center gap-2 rounded-full py-1 pr-1 pl-1",
          "border border-border bg-background",
          "transition-colors duration-150",
          "hover:border-[var(--border-medium)] hover:bg-accent",
          "active:bg-[var(--surface-active)]",
          "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
          "disabled:pointer-events-none disabled:opacity-50",
          className
        )}
        {...props}
      >
        {typeof credits === "number" && (
          <span
            data-slot="credits-pill"
            className="ml-2 text-[13px] leading-[18px] font-medium whitespace-nowrap text-muted-foreground tabular-nums"
          >
            {formatCredits(credits)}
            <span className="sr-only"> work credits</span>
          </span>
        )}
        <Avatar className="size-9 border border-border">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback className="bg-secondary text-sm font-medium text-muted-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
      </button>
    )
  }
)
AccountButton.displayName = "AccountButton"

export { AccountButton, MarketplaceButton }
export type { AccountButtonProps, MarketplaceButtonProps }
