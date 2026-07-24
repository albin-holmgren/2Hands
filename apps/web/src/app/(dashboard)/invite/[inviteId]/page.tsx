'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Loader2, Check, X } from 'lucide-react'
import { toast } from 'sonner'

export default function InviteAcceptPage() {
  const router = useRouter()
  const params = useParams()
  const inviteId = params.inviteId as string
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function accept() {
      try {
        const res = await fetch('/api/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'accept_invite', inviteId }),
        })
        if (res.ok) {
          setStatus('success')
          toast.success('Invitation accepted!')
          setTimeout(() => router.push('/app'), 1500)
        } else {
          const data = await res.json()
          setStatus('error')
          setErrorMsg(data.error || 'Failed to accept invitation')
        }
      } catch {
        setStatus('error')
        setErrorMsg('Something went wrong')
      }
    }
    accept()
  }, [inviteId, router])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
            <p className="text-[14px] text-muted-foreground">Accepting invitation...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-green-500" />
            </div>
            <p className="text-[15px] font-medium text-foreground">Invitation accepted!</p>
            <p className="text-[13px] text-muted-foreground">Redirecting to your workspace...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
              <X className="w-6 h-6 text-red-500" />
            </div>
            <p className="text-[15px] font-medium text-foreground">Could not accept invitation</p>
            <p className="text-[13px] text-muted-foreground">{errorMsg}</p>
            <button
              onClick={() => router.push('/app')}
              className="mt-4 px-5 py-2 rounded-xl bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              Go to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  )
}
