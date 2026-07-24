'use client'

import { useState, useEffect } from 'react'
import { Eye, EyeOff, Check, AlertCircle, ChevronDown, ChevronUp, ExternalLink, ShieldCheck, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ConnectorField } from '@/lib/integrations/connector-fields'
import { TwoHandsLoader } from '@/components/ui/loader'

interface IntegrationSetupCardProps {
  connectorId: string
  connectorName: string
  fields: ConnectorField[]
  logoUrl?: string
  workspaceId?: string
  onComplete?: (success: boolean) => void
}

function ConnectorIcon({ connectorName, logoUrl }: { connectorId: string; connectorName: string; logoUrl?: string }) {
  const [imgFailed, setImgFailed] = useState(false)
  const initials = connectorName.slice(0, 2).toUpperCase()

  return (
    <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-border/60 shrink-0">
      {logoUrl && !imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={connectorName}
          width={16}
          height={16}
          className="object-contain"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="text-[10px] font-bold text-muted-foreground leading-none">{initials}</span>
      )}
    </div>
  )
}

export function IntegrationSetupCard({
  connectorId,
  connectorName,
  fields,
  logoUrl,
  workspaceId,
  onComplete,
}: IntegrationSetupCardProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    fields.forEach(f => { init[f.key] = '' })
    return init
  })
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    fields.forEach(f => { init[f.key] = f.type === 'text' })
    return init
  })
  const [status, setStatus] = useState<'idle' | 'submitting' | 'verifying' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)
  const [guideExpanded, setGuideExpanded] = useState(false)
  const [setupGuide, setSetupGuide] = useState<string | null>(null)
  const [docsUrl, setDocsUrl] = useState<string | null>(null)

  useEffect(() => {
    import('@/lib/integrations/connector-fields').then(mod => {
      const config = mod.getConnectorConfig(connectorId)
      if (config) {
        setSetupGuide(config.setupGuide || null)
        setDocsUrl(config.docsUrl || null)
      }
    }).catch(() => {})
  }, [connectorId])

  const allFilled = fields.every(f => values[f.key]?.trim())
  const isDisabled = status === 'submitting' || status === 'verifying' || status === 'success'

  const handleSubmit = async () => {
    if (!allFilled || isDisabled) return
    setStatus('submitting')
    setErrorMsg(null)
    setVerifyMsg(null)

    try {
      const config: Record<string, string> = {}
      fields.forEach(f => { config[f.key] = values[f.key].trim() })

      const res = await fetch('/api/integrations/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: connectorId, config, ...(workspaceId ? { workspaceId } : {}) }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        const rawError = data?.error || 'Failed to create connection'
        const friendlyError = rawError.includes('API key is invalid')
          ? `${connectorName} rejected the key — double-check that you copied the full key and that it has the required scopes.`
          : rawError.includes('Server misconfigured')
            ? 'Server configuration issue — please contact support.'
            : rawError
        setErrorMsg(friendlyError)
        setStatus('error')
        onComplete?.(false)
        return
      }

      setStatus('verifying')
      setVerifyMsg(`Credentials saved — verifying live connection to ${connectorName}…`)

      try {
        const verifyRes = await fetch('/api/integrations/connections?action=verify', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: data?.connection?.id, connector_id: connectorId }),
        })
        const verifyData = await verifyRes.json().catch(() => null)

        if (verifyRes.ok && verifyData?.success !== false) {
          const detail = verifyData?.message || verifyData?.workspace_name
            ? ` (${verifyData.message || verifyData.workspace_name})`
            : ''
          setVerifyMsg(`Connected and verified${detail}`)
          setStatus('success')
          onComplete?.(true)
        } else {
          setVerifyMsg(`Connected — credentials saved. Live verification returned: ${verifyData?.error || 'could not confirm'}. The connection may still work.`)
          setStatus('success')
          onComplete?.(true)
        }
      } catch {
        setVerifyMsg('Connected — credentials saved. Could not run live verification (network issue), but the connection is ready to use.')
        setStatus('success')
        onComplete?.(true)
      }
    } catch {
      setErrorMsg('Network error — please check your connection and try again')
      setStatus('error')
      onComplete?.(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="mt-4 rounded-2xl border border-border bg-card shadow-[0px_2px_12px_0px_rgba(0,0,0,0.04)] dark:shadow-[0px_4px_16px_0px_rgba(0,0,0,0.3)] overflow-hidden max-w-[440px]"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-sidebar/30">
        <ConnectorIcon connectorId={connectorId} connectorName={connectorName} logoUrl={logoUrl} />
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-semibold text-foreground">Connect {connectorName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {docsUrl && (
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              title={`${connectorName} docs`}
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {status === 'success' && (
            <div className="flex items-center gap-1 text-primary">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold">Connected</span>
            </div>
          )}
        </div>
      </div>

      {/* Setup guide (collapsible) */}
      {setupGuide && status !== 'success' && (
        <div className="border-b border-border/50">
          <button
            type="button"
            onClick={() => setGuideExpanded(!guideExpanded)}
            className="w-full flex items-center justify-between px-4 py-2 text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            <span className="font-medium">How to get your credentials</span>
            {guideExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <AnimatePresence>
            {guideExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-3 text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-line">
                  {setupGuide}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Fields */}
      <div className="px-4 py-3 space-y-2.5">
        {fields.map(field => (
          <div key={field.key} className="relative">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              {field.label}
            </label>
            <div className="relative">
              <input
                type={visibility[field.key] ? 'text' : 'password'}
                value={values[field.key]}
                onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder || field.label}
                disabled={isDisabled}
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-9 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
              {field.type === 'password' && (
                <button
                  type="button"
                  onClick={() => setVisibility(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  tabIndex={-1}
                >
                  {visibility[field.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Security note */}
        {status === 'idle' && (
          <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 shrink-0" />
            Credentials are encrypted and never shared
          </p>
        )}

        {/* Error */}
        {status === 'error' && errorMsg && (
          <div className="flex items-start gap-1.5 text-[11px] text-red-500 mt-1 leading-relaxed">
            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Verification status */}
        {(status === 'verifying' || (status === 'success' && verifyMsg)) && (
          <div className={`flex items-start gap-1.5 text-[11px] mt-1 leading-relaxed ${status === 'verifying' ? 'text-muted-foreground' : 'text-primary'}`}>
            {status === 'verifying' ? (
              <Loader2 className="w-3 h-3 shrink-0 mt-0.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3 h-3 shrink-0 mt-0.5" />
            )}
            <span>{verifyMsg}</span>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!allFilled || isDisabled}
          className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'submitting' && <TwoHandsLoader size="sm" />}
          {status === 'verifying' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {status === 'success' && <Check className="w-3.5 h-3.5" />}
          {status === 'success' ? 'Connected' : status === 'verifying' ? 'Verifying…' : status === 'submitting' ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </motion.div>
  )
}
