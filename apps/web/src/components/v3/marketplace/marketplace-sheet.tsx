"use client"

/**
 * v3 marketplace sheet (UX.md §5).
 *
 * Compact, searchable contextual sheet opened from the top-left circular
 * marketplace control (never a hamburger). All data arrives via props —
 * no fetching in this primitive. Demo rows are visibly labeled "Demo";
 * coming-soon rows are disabled.
 */

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  SideSheet,
  SideSheetBody,
  SideSheetContent,
  SideSheetDescription,
  SideSheetHeader,
  SideSheetTitle,
} from "@/components/v3/sheet/side-sheet"

type ProviderRowStatus = "connected" | "needs_attention" | "coming_soon" | "demo"

interface ProviderRow {
  id: string
  name: string
  /** One-line capability description. */
  description?: string
  /** 32 px provider icon; falls back to an initial glyph. */
  icon?: React.ReactNode
  status: ProviderRowStatus
  /** Optional owner label, e.g. "Workspace" or an account email. */
  ownerLabel?: string
}

const MARKETPLACE_SECTION_TITLES = [
  "Connected apps",
  "Specialist agents",
  "Computers",
  "MCP servers & connectors",
  "Subscriptions & privacy",
] as const

type MarketplaceSectionTitle = (typeof MARKETPLACE_SECTION_TITLES)[number]

interface MarketplaceSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectedApps?: ProviderRow[]
  specialistAgents?: ProviderRow[]
  computers?: ProviderRow[]
  mcpServers?: ProviderRow[]
  subscriptions?: ProviderRow[]
  /** Fired for enabled rows only; coming-soon rows never fire. */
  onRowSelect?: (row: ProviderRow, section: MarketplaceSectionTitle) => void
  className?: string
}

const statusPillVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap",
  {
    variants: {
      status: {
        connected:
          "border-transparent bg-[#10B981]/10 text-[#10B981] dark:bg-[#10B981]/15",
        needs_attention:
          "border-transparent bg-[#F59E0B]/10 text-[#B45309] dark:bg-[#F59E0B]/15 dark:text-[#F59E0B]",
        coming_soon: "border-border bg-transparent text-muted-foreground",
        demo: "border-dashed border-[var(--border-medium)] bg-secondary text-muted-foreground",
      },
    },
  }
)

const STATUS_LABELS: Record<ProviderRowStatus, string> = {
  connected: "Connected",
  needs_attention: "Needs attention",
  coming_soon: "Coming soon",
  demo: "Demo",
}

function ProviderStatusPill({
  status,
  className,
}: { status: ProviderRowStatus; className?: string } & VariantProps<typeof statusPillVariants>) {
  return (
    <span data-slot="provider-status-pill" className={cn(statusPillVariants({ status }), className)}>
      {status === "connected" && (
        <span aria-hidden className="size-1.5 rounded-full bg-[#10B981]" />
      )}
      {status === "needs_attention" && (
        <span aria-hidden className="size-1.5 rounded-full bg-[#F59E0B]" />
      )}
      {STATUS_LABELS[status]}
    </span>
  )
}

function MarketplaceRow({
  row,
  onSelect,
}: {
  row: ProviderRow
  onSelect?: (row: ProviderRow) => void
}) {
  const disabled = row.status === "coming_soon"
  return (
    <button
      type="button"
      data-slot="marketplace-row"
      data-status={row.status}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onSelect?.(row)
      }}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-2 text-left",
        "transition-colors duration-150",
        disabled
          ? "cursor-default opacity-55"
          : "hover:bg-accent active:bg-[var(--surface-active)]",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
      )}
    >
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary text-sm font-medium text-muted-foreground [&_svg]:size-4"
      >
        {row.icon ?? row.name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm leading-5 font-medium text-foreground">
            {row.name}
          </span>
        </span>
        {(row.description || row.ownerLabel) && (
          <span className="block truncate text-[13px] leading-[18px] text-muted-foreground">
            {[row.description, row.ownerLabel].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      <ProviderStatusPill status={row.status} />
    </button>
  )
}

function MarketplaceSection({
  title,
  rows,
  onRowSelect,
}: {
  title: MarketplaceSectionTitle
  rows: ProviderRow[]
  onRowSelect?: (row: ProviderRow, section: MarketplaceSectionTitle) => void
}) {
  if (rows.length === 0) return null
  return (
    <section data-slot="marketplace-section" aria-label={title} className="flex flex-col gap-1">
      <h3 className="px-4 pt-4 pb-1 text-[11px] leading-4 font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="flex flex-col">
        {rows.map((row) => (
          <MarketplaceRow key={row.id} row={row} onSelect={(r) => onRowSelect?.(r, title)} />
        ))}
      </div>
    </section>
  )
}

function matchesQuery(row: ProviderRow, query: string): boolean {
  if (!query) return true
  const haystack = `${row.name} ${row.description ?? ""}`.toLowerCase()
  return haystack.includes(query.toLowerCase().trim())
}

function MarketplaceSheet({
  open,
  onOpenChange,
  connectedApps = [],
  specialistAgents = [],
  computers = [],
  mcpServers = [],
  subscriptions = [],
  onRowSelect,
  className,
}: MarketplaceSheetProps) {
  const [query, setQuery] = React.useState("")

  const sections: Array<{ title: MarketplaceSectionTitle; rows: ProviderRow[] }> = [
    { title: "Connected apps", rows: connectedApps },
    { title: "Specialist agents", rows: specialistAgents },
    { title: "Computers", rows: computers },
    { title: "MCP servers & connectors", rows: mcpServers },
    { title: "Subscriptions & privacy", rows: subscriptions },
  ].map(({ title, rows }) => ({
    title: title as MarketplaceSectionTitle,
    rows: rows.filter((row) => matchesQuery(row, query)),
  }))

  const isEmpty = sections.every((section) => section.rows.length === 0)

  return (
    <SideSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("")
        onOpenChange(next)
      }}
    >
      <SideSheetContent size="auth" className={className} aria-describedby={undefined}>
        <SideSheetHeader>
          <SideSheetTitle className="font-display text-2xl">Marketplace</SideSheetTitle>
          <SideSheetDescription>
            Connected apps, agents, and computers for this workspace.
          </SideSheetDescription>
          <div className="relative mt-2">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search marketplace"
              className={cn(
                "h-11 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] pr-3 pl-9",
                "text-base text-foreground placeholder:text-[var(--text-placeholder)]",
                "transition-colors duration-150 hover:border-[var(--input-border-hover)]",
                "focus:border-[var(--input-border-focus)] focus:bg-[var(--input-bg-focus)] focus:outline-none",
                "focus-visible:ring-ring/30 focus-visible:ring-[3px]"
              )}
            />
          </div>
        </SideSheetHeader>
        <SideSheetBody className="px-2 pb-4">
          {isEmpty ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {query ? `Nothing matches “${query}”.` : "Nothing connected yet."}
            </p>
          ) : (
            sections.map((section) => (
              <MarketplaceSection
                key={section.title}
                title={section.title}
                rows={section.rows}
                onRowSelect={onRowSelect}
              />
            ))
          )}
        </SideSheetBody>
      </SideSheetContent>
    </SideSheet>
  )
}

export {
  MarketplaceRow,
  MarketplaceSheet,
  ProviderStatusPill,
  MARKETPLACE_SECTION_TITLES,
}
export type {
  MarketplaceSectionTitle,
  MarketplaceSheetProps,
  ProviderRow,
  ProviderRowStatus,
}
