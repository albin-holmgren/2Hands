import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit'

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, 'check-email', RATE_LIMITS.login)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { email } = await request.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const normalized = email.toLowerCase().trim()

    // Check profiles table first (covers email/password users)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', normalized)
      .limit(1)

    if (profiles && profiles.length > 0) {
      return NextResponse.json({ exists: true })
    }

    // Fallback: check auth.users for OAuth-only users without a profile row
    const { data: listData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 })
    const exists = listData?.users?.some(
      (u) => u.email?.toLowerCase() === normalized
    ) ?? false

    return NextResponse.json({ exists })
  } catch (error) {
    console.error('check-email error:', error)
    return NextResponse.json({ exists: false })
  }
}
