"use client"

/**
 * v3 contextual sheet primitive (UX.md §2, BRAND_GUIDELINES §7.3/§8).
 *
 * Right-side panel on desktop, bottom sheet on mobile viewports.
 * Built on Radix Dialog: focus trap, ESC-to-close, and scroll lock come
 * from the primitive. Sheet radius 24, 200 ms enter/exit, reduced-motion safe.
 *
 * Size tokens (specs/design-tokens.json → layout):
 *   auth sheet      max-w 560
 *   computer sheet  max-w 680
 */

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function SideSheet({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="side-sheet" {...props} />
}

function SideSheetTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="side-sheet-trigger" {...props} />
}

function SideSheetClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="side-sheet-close" {...props} />
}

function SideSheetPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="side-sheet-portal" {...props} />
}

function SideSheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="side-sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-[var(--bg-overlay)]/40",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-200",
        "motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

const sideSheetContentVariants = cva(
  cn(
    "fixed z-50 flex flex-col gap-0 bg-background text-foreground shadow-[0_8px_40px_-8px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)] outline-none",
    // Mobile: bottom sheet, sheet radius 24 on top corners.
    "inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-[24px] border-t border-border",
    // Desktop: right-side panel, sheet radius 24 on left corners.
    "sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:h-full sm:max-h-full sm:rounded-t-none sm:rounded-l-[24px] sm:border-t-0 sm:border-l",
    // Motion: 200 ms enter/exit, direction-aware, reduced-motion safe.
    "duration-200 ease-out data-[state=closed]:ease-in",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
    "sm:data-[state=open]:slide-in-from-right sm:data-[state=closed]:slide-out-to-right",
    "motion-reduce:animate-none"
  ),
  {
    variants: {
      size: {
        /** Authentication sheets — 560 px max width on desktop. */
        auth: "sm:max-w-[560px]",
        /** Computer / workspace detail sheets — 680 px max width on desktop. */
        computer: "sm:max-w-[680px]",
      },
    },
    defaultVariants: {
      size: "auth",
    },
  }
)

interface SideSheetContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content>,
    VariantProps<typeof sideSheetContentVariants> {
  showCloseButton?: boolean
}

function SideSheetContent({
  className,
  children,
  size = "auth",
  showCloseButton = true,
  ...props
}: SideSheetContentProps) {
  return (
    <SideSheetPortal>
      <SideSheetOverlay />
      <DialogPrimitive.Content
        data-slot="side-sheet-content"
        className={cn(sideSheetContentVariants({ size }), className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="side-sheet-close"
            className={cn(
              "absolute top-4 right-4 flex size-11 items-center justify-center rounded-full text-muted-foreground",
              "transition-colors duration-150 hover:bg-accent hover:text-foreground",
              "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
              "disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
            )}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </SideSheetPortal>
  )
}

function SideSheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="side-sheet-header"
      className={cn("flex flex-col gap-1 px-6 pt-6 pb-4", className)}
      {...props}
    />
  )
}

function SideSheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="side-sheet-body"
      className={cn("flex-1 overflow-y-auto px-6 pb-6", className)}
      {...props}
    />
  )
}

function SideSheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="side-sheet-footer"
      className={cn(
        "flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function SideSheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="side-sheet-title"
      className={cn("text-2xl leading-[30px] font-medium text-foreground", className)}
      {...props}
    />
  )
}

function SideSheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="side-sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  SideSheet,
  SideSheetBody,
  SideSheetClose,
  SideSheetContent,
  SideSheetDescription,
  SideSheetFooter,
  SideSheetHeader,
  SideSheetOverlay,
  SideSheetPortal,
  SideSheetTitle,
  SideSheetTrigger,
  sideSheetContentVariants,
}
export type { SideSheetContentProps }
