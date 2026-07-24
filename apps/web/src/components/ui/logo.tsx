import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  /**
   * 'auto' (default) — shows dark logo in light mode, light logo in dark mode automatically.
   * 'dark' — always show the dark (terracotta) logo, e.g. on always-light backgrounds.
   * 'light' — always show the light logo, e.g. on always-dark panels like footer/auth sidebar.
   */
  variant?: 'auto' | 'dark' | 'light'
  /** sm = 22 px  |  md = 26 px (default)  |  lg = 34 px */
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_HEIGHT: Record<string, number> = {
  sm: 22,
  md: 26,
  lg: 34,
}

export function Logo({ className, variant = 'auto', size = 'md' }: LogoProps) {
  const height = SIZE_HEIGHT[size]

  if (variant === 'dark') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/logo-terracotta.svg" alt="2Hands" style={{ height, width: 'auto' }} className={cn(className)} />
    )
  }

  if (variant === 'light') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/logo-terracotta-light.svg" alt="2Hands" style={{ height, width: 'auto' }} className={cn(className)} />
    )
  }

  // auto: dark logo in light mode, light logo in dark mode
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-terracotta.svg" alt="2Hands" style={{ height, width: 'auto' }} className={cn('dark:hidden', className)} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-terracotta-light.svg" alt="" aria-hidden style={{ height, width: 'auto' }} className={cn('hidden dark:block', className)} />
    </>
  )
}
