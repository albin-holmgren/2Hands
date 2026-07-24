'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function normalizePhrase(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

interface ConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  isConfirming?: boolean
  destructive?: boolean
  verificationText?: string
  verificationPlaceholder?: string
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  isConfirming = false,
  destructive = false,
  verificationText,
  verificationPlaceholder = 'Type the phrase exactly',
}: ConfirmationDialogProps) {
  const [typedValue, setTypedValue] = useState('')

  useEffect(() => {
    if (!open) setTypedValue('')
  }, [open, verificationText])

  const requiresVerification = Boolean(verificationText)

  const verificationMatches = useMemo(() => {
    if (!verificationText) return true
    return normalizePhrase(typedValue) === normalizePhrase(verificationText)
  }, [typedValue, verificationText])

  const canConfirm = !isConfirming && verificationMatches

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isConfirming && !nextOpen) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="max-w-md rounded-2xl border-border p-0 overflow-hidden z-[200]" showCloseButton={!isConfirming}>
        <div className="p-5 sm:p-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle className="text-[16px] font-semibold">{title}</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </DialogDescription>
          </DialogHeader>

          {requiresVerification && verificationText && (
            <div className="mt-4 space-y-2">
              <p className="text-[12px] text-muted-foreground">Verification phrase</p>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[12px] text-foreground">
                {verificationText}
              </div>
              <input
                type="text"
                value={typedValue}
                onChange={(event) => setTypedValue(event.target.value)}
                placeholder={verificationPlaceholder}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/25"
              />
              {!verificationMatches && typedValue.length > 0 && (
                <p className="text-[12px] text-red-500">Phrase does not match.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isConfirming}
            className="h-10 rounded-lg border border-border px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => { void onConfirm() }}
            disabled={!canConfirm}
            className={cn(
              'h-10 rounded-lg px-4 text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50',
              destructive
                ? 'bg-red-500 text-white hover:opacity-90'
                : 'bg-foreground text-background hover:opacity-90'
            )}
          >
            {isConfirming ? 'Please wait...' : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
