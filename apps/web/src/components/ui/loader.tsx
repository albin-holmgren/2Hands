'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface TwoHandsLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeConfig = {
  sm: 20,
  md: 28,
  lg: 40,
  xl: 56,
}

// Snake-like tapered ring loader
export function TwoHandsLoader({ 
  size = 'md', 
  className,
}: TwoHandsLoaderProps) {
  const s = sizeConfig[size]

  return (
    <div 
      className={cn("relative flex items-center justify-center animate-spin", className)} 
      style={{ width: s, height: s }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'conic-gradient(from 0deg, transparent 0%, transparent 40%, currentColor 70%, currentColor 100%)',
          WebkitMask: 'radial-gradient(transparent 62%, black 63%, black 68%, transparent 69%)',
          mask: 'radial-gradient(transparent 62%, black 63%, black 68%, transparent 69%)',
        }}
      />
    </div>
  )
}

// Full page loader with branding
export function PageLoader({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
      <TwoHandsLoader size="lg" />
      {message && (
        <motion.p 
          className="text-sm text-muted-foreground font-medium tracking-wide"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          {message}
        </motion.p>
      )}
    </div>
  )
}

// Button loader - minimal inline
export function ButtonLoader({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-[3px]", className)}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1 h-1 rounded-full bg-current"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.12,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  )
}

// Base skeleton line
function SkeletonLine({ 
  width = '100%', 
  height = '1rem',
  className 
}: { 
  width?: string | number
  height?: string | number
  className?: string 
}) {
  return (
    <div
      className={cn("bg-foreground/5 rounded-lg animate-pulse", className)}
      style={{ width, height }}
    />
  )
}

// Content skeleton - text lines
export function ContentLoader({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine 
          key={i} 
          width={i === rows - 1 ? '75%' : '100%'} 
        />
      ))}
    </div>
  )
}

// Card skeleton
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 space-y-4", className)}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-foreground/10 animate-pulse" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="60%" height="0.875rem" />
          <SkeletonLine width="40%" height="0.75rem" />
        </div>
      </div>
      <ContentLoader rows={2} />
    </div>
  )
}

// List item skeleton
export function ListItemSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 py-3", className)}>
      <div className="w-10 h-10 rounded-lg bg-foreground/10 animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonLine width="70%" height="0.875rem" />
        <SkeletonLine width="50%" height="0.75rem" />
      </div>
    </div>
  )
}

// Agent list skeleton
export function AgentListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2.5 py-1.5 rounded-xl">
          <div className="w-6 h-6 rounded-full bg-foreground/10 animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <SkeletonLine width="80%" height="0.8125rem" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Settings section skeleton
export function SettingsSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-foreground/10 animate-pulse" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="40%" height="1.25rem" />
          <SkeletonLine width="60%" height="0.875rem" />
        </div>
      </div>
      
      {/* Sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-4 py-6 border-b border-border last:border-0">
          <SkeletonLine width="30%" height="0.8125rem" />
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8">
            <div className="space-y-2">
              <SkeletonLine width="80%" height="0.875rem" />
              <SkeletonLine width="60%" height="0.75rem" />
            </div>
            <SkeletonLine width="100%" height="2.5rem" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Table skeleton
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number, cols?: number }) {
  return (
    <div className="w-full space-y-3">
      {/* Header */}
      <div className="flex gap-4 pb-3 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="flex-1">
            <SkeletonLine width={i === 0 ? "70%" : "50%"} height="0.875rem" />
          </div>
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4 py-3">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <div key={colIdx} className="flex-1">
              <SkeletonLine 
                width={colIdx === 0 ? "80%" : colIdx === cols - 1 ? "40%" : "60%"} 
                height="0.75rem" 
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// Integration/Connector card skeleton
export function IntegrationCardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-foreground/10 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <SkeletonLine width="70%" height="0.875rem" />
              <SkeletonLine width="40%" height="0.75rem" />
            </div>
          </div>
          <SkeletonLine width="100%" height="3rem" />
        </div>
      ))}
    </div>
  )
}

// Page layout skeleton with sidebar
export function PageLayoutSkeleton() {
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex w-[260px] flex-col border-r border-border bg-sidebar p-4">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-lg bg-foreground/10 animate-pulse" />
          <div className="h-5 w-20 bg-foreground/10 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-foreground/5 animate-pulse" />
          ))}
        </div>
        <div className="mt-auto pt-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-foreground/10 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-24 bg-foreground/10 rounded animate-pulse" />
              <div className="h-3 w-16 bg-foreground/5 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-border flex items-center justify-between px-6">
          <div className="h-6 w-32 bg-foreground/10 rounded animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-foreground/5 animate-pulse" />
            <div className="h-9 w-9 rounded-full bg-foreground/10 animate-pulse" />
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <SkeletonLine width="40%" height="1.5rem" />
            <ContentLoader rows={4} />
            <div className="grid grid-cols-2 gap-4 pt-4">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Chat message skeleton
export function ChatMessageSkeleton({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={cn("flex gap-4 py-4", isUser ? "flex-row-reverse" : "")}>
      <div className={cn(
        "w-8 h-8 rounded-full shrink-0 animate-pulse",
        isUser ? "bg-primary/20" : "bg-foreground/10"
      )} />
      <div className={cn("flex-1 space-y-2 max-w-[80%]", isUser ? "items-end" : "")}>
        <SkeletonLine width={isUser ? "60%" : "85%"} height="0.875rem" />
        {!isUser && <SkeletonLine width="70%" height="0.875rem" />}
        <SkeletonLine width={isUser ? "40%" : "50%"} height="0.875rem" />
      </div>
    </div>
  )
}

// Full chat skeleton
export function ChatSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-4 space-y-2">
        <ChatMessageSkeleton />
        <ChatMessageSkeleton isUser />
        <ChatMessageSkeleton />
        <ChatMessageSkeleton isUser />
      </div>
      <div className="p-4 border-t border-border">
        <SkeletonLine width="100%" height="3rem" />
      </div>
    </div>
  )
}

// Stats/overview card skeleton
export function StatsCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-foreground/10 animate-pulse" />
            <SkeletonLine width="60%" height="0.75rem" />
          </div>
          <SkeletonLine width="40%" height="1.5rem" />
          <SkeletonLine width="80%" height="0.75rem" />
        </div>
      ))}
    </div>
  )
}

// Form field skeleton
export function FormFieldSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <SkeletonLine width="30%" height="0.875rem" />
          <SkeletonLine width="100%" height="2.5rem" />
        </div>
      ))}
    </div>
  )
}
