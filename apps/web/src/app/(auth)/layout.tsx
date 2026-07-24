// Force dynamic rendering - auth pages need runtime Supabase client
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

const features = [
  { label: 'Autonomous missions that run 24/7' },
  { label: 'Browser-native agents with real execution' },
  { label: 'Full visibility and control, always' },
]

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex bg-stone-50 dark:bg-[#0F0E0D] font-sans">

      {/* ── Left panel: branding (desktop only) ──────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[440px] xl:w-[500px] shrink-0 bg-[#1A1918] p-10 relative overflow-hidden select-none">
        {/* Subtle radial glow */}
        <div className="absolute top-0 left-0 w-[480px] h-[480px] rounded-full bg-[#D97757]/[0.06] blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[320px] h-[320px] rounded-full bg-[#D97757]/[0.04] blur-[80px] pointer-events-none" />

        {/* Logo — real wordmark, light variant for dark bg */}
        <Link href="/" className="relative flex items-center w-fit" aria-label="2Hands Home">
          <Logo variant="light" />
        </Link>

        {/* Main copy */}
        <div className="relative flex-1 flex flex-col justify-center">
          <h2 className="text-white text-[32px] font-bold leading-[1.25] tracking-tight mb-4">
            Your AI team,<br />always on.
          </h2>
          <p className="text-stone-400 text-[15px] leading-relaxed mb-10 max-w-[300px]">
            Agents that research, outreach, and execute — freeing you to lead the things that matter.
          </p>

          <ul className="space-y-3.5">
            {features.map((f) => (
              <li key={f.label} className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97757] shrink-0" />
                <span className="text-stone-300 text-[14px]">{f.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom quote */}
        <div className="relative border-t border-white/[0.08] pt-6">
          <p className="text-stone-400 text-[13px] leading-relaxed italic mb-1">
            &ldquo;2Hands has become our first employee.&rdquo;
          </p>
          <p className="text-stone-600 text-[12px]">— Early adopter</p>
        </div>
      </aside>

      {/* ── Right panel: form ────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-[400px]">
          {children}
        </div>
      </main>

    </div>
  )
}
