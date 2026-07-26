'use client'

/**
 * In-app sign-in.
 *
 * The app is browsable signed out, so sending someone to a full-page login the
 * moment they type a goal throws away what they were doing and the context they
 * were in. This keeps them on the surface: the shell stays visible behind the
 * overlay, and closing the dialog returns them to exactly where they were.
 *
 * The form is the same one the /sign-in page renders — see
 * components/auth/auth-form.tsx.
 */

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { AuthForm, AuthLegal } from '@/components/auth/auth-form'
import { Logo } from '@/components/ui/logo'
import { APP_HOME } from '@/lib/auth/redirect-paths'

export interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Why the dialog opened, shown under the heading — "Sign in to send your
   * first task" reads better than generic copy when the visitor just tried to
   * do something.
   */
  reason?: string
  /** Where a provider round-trip should return to. Defaults to the app. */
  nextPath?: string
  /**
   * Fired on a successful sign-in, before the dialog closes, so the caller can
   * tell "signed in" apart from "dismissed" — the two arrive as the same
   * onOpenChange(false) otherwise, and the auth store may not have caught up
   * yet at that moment.
   */
  onSignedIn?: () => void
}

export function AuthDialog({
  open,
  onOpenChange,
  reason,
  nextPath = APP_HOME,
  onSignedIn,
}: AuthDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="auth-dialog"
        className="sm:max-w-[420px] rounded-3xl p-8"
      >
        <div className="flex flex-col items-start">
          <Logo className="mb-6" />
          {/* DialogTitle is what screen readers announce, and Radix warns if it
              is missing — so it carries the heading rather than a bare h2. */}
          <DialogTitle className="text-2xl font-bold text-foreground leading-[1.3] mb-2">
            Welcome to 2Hands
          </DialogTitle>
        </div>

        <div className="text-left">
          <AuthForm
            nextPath={nextPath}
            subheading={reason}
            onSignedIn={() => {
              onSignedIn?.()
              onOpenChange(false)
            }}
          />
        </div>

        <AuthLegal className="mt-6 text-[11px] text-muted-foreground/60 leading-[1.6] text-left" />
      </DialogContent>
    </Dialog>
  )
}
