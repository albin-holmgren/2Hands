import type { Metadata } from 'next'
import type { ReactNode } from 'react'

/**
 * Demo Account Provider — standalone layout.
 * Deliberately plain, neutral styling (system fonts, grays) so the demo site
 * reads as an external third-party service, NOT the 2Hands product brand.
 */
export const metadata: Metadata = {
  title: 'Demo Account Provider',
  description: 'First-party deterministic test site for 2Hands dev/CI. Not a real service.',
  robots: { index: false, follow: false },
}

export default function DemoProviderLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col bg-[#f4f4f5] text-[#18181b]"
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <div
        id="demo-provider-banner"
        data-testid="demo-provider-banner"
        className="border-b border-[#d4d4d8] bg-[#fef3c7] px-4 py-2 text-center text-[13px] font-bold text-[#78350f]"
      >
        Demo Account Provider — first-party test site. Not a real service. Fixture data only.
      </div>
      <header className="border-b border-[#d4d4d8] bg-white px-6 py-4">
        <a href="/demo-provider" className="text-lg font-bold tracking-wide text-[#18181b] no-underline">
          Demo Account Provider
        </a>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">{children}</main>
      <footer className="border-t border-[#d4d4d8] px-4 py-6 text-center text-xs text-[#71717a]">
        Deterministic browser-auth target for 2Hands development and CI. No real accounts, payments,
        or personal data are involved.
      </footer>
    </div>
  )
}
