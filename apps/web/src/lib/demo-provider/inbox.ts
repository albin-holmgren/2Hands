/**
 * Demo Account Provider — simulated external email inbox.
 *
 * Writes fixture emails (OTP codes, magic links) into `public.demo_inbox` so
 * the Account Broker / verification broker can read them deterministically in
 * dev/CI. The table is created by the Slice 3 migrations; if it is missing we
 * fail with a clear, code-only error (never echo row contents).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { DEMO_FROM_DOMAIN } from './config'

export const DEMO_INBOX_UNAVAILABLE = 'demo_inbox_unavailable'

interface DemoInboxInsert {
  toEmail: string
  kind: 'otp' | 'magic_link'
  subject: string
  bodyText: string
}

/** Untyped escape hatch: demo_inbox is not in the generated Database types yet. */
interface MinimalPostgrest {
  from(table: string): {
    insert(values: Record<string, unknown>): PromiseLike<{ error: { code?: string; message?: string } | null }>
  }
}

export async function insertDemoInboxRow(row: DemoInboxInsert): Promise<void> {
  const supabase = createAdminClient() as unknown as MinimalPostgrest
  const { error } = await supabase.from('demo_inbox').insert({
    to_email: row.toEmail,
    from_domain: DEMO_FROM_DOMAIN,
    kind: row.kind,
    subject: row.subject,
    body_text: row.bodyText,
  })
  if (error) {
    // PGRST205 = table not in schema cache; 42P01 = undefined_table.
    if (error.code === 'PGRST205' || error.code === '42P01') {
      throw new Error(DEMO_INBOX_UNAVAILABLE)
    }
    // Error codes only — never include values or provider error text that
    // could echo the inserted body.
    throw new Error(`demo_inbox_insert_failed:${error.code ?? 'unknown'}`)
  }
}
