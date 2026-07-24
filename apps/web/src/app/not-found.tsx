import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home, ArrowLeft } from 'lucide-react'
import { Logo } from '@/components/ui/logo'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background dark:bg-background">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FFFFFF] via-[#F5F3F0] to-[#FAFAFA] dark:from-[#1A1918] dark:via-[#24232E] dark:to-[#2C2B27] animate-gradient" />
      </div>

      <div className="w-full max-w-[480px] text-center space-y-8 relative z-10">
        {/* Logo */}
        <Link 
          href="/" 
          className="inline-flex items-center justify-center group"
          aria-label="2Hands Home"
        >
          <Logo size="lg" className="transition-transform group-hover:scale-105" />
        </Link>

        {/* 404 Display */}
        <div className="space-y-4">
          <h1 className="text-[120px] sm:text-[160px] font-bold text-card-foreground/10 dark:text-card-foreground/10 leading-none select-none">
            404
          </h1>
          <h2 className="text-2xl sm:text-3xl font-semibold text-card-foreground dark:text-card-foreground -mt-16 sm:-mt-20">
            Page not found
          </h2>
          <p className="text-base text-muted-foreground max-w-sm mx-auto">
            The page you&apos;re looking for doesn&apos;t exist or has been moved. 
            Let&apos;s get you back on track.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
          <Button
            asChild
            size="lg"
            className="h-12 px-6 rounded-xl bg-primary dark:bg-primary text-primary-foreground dark:text-primary-foreground hover:opacity-90 font-medium text-[15px] transition-all active:scale-[0.98]"
          >
            <Link href="/app">
              <Home className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 px-6 rounded-xl border border-border bg-card/50 hover:bg-card text-foreground/70 hover:text-foreground font-medium text-[15px] transition-all active:scale-[0.98]"
          >
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>

        {/* Footer hint */}
        <p className="text-sm text-muted-foreground/60 pt-8">
          Need help?{' '}
          <Link href="mailto:support@2hands.ai" className="underline hover:text-muted-foreground">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  )
}
