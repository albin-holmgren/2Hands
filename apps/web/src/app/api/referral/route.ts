import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseAndValidate, referralRequestSchema, validationErrorResponse } from '@/lib/validation/schemas'

interface ProfileData {
  referral_code: string | null
  referral_count: number | null
  credits: number | null
}

interface ReferralResult {
  success: boolean
  message: string
  referrer_id: string | null
  credits_awarded: number
}

// GET: Get user's referral info
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's referral code and stats
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('referral_code, referral_count, credits')
      .eq('id', user.id)
      .single()

    if (profileError || !data) {
      return NextResponse.json({ error: 'Failed to get profile' }, { status: 500 })
    }

    const profile = data as unknown as ProfileData

    // Get referral history
    const { data: referrals } = await supabase
      .from('referrals')
      .select('id, status, credits_awarded, created_at, completed_at')
      .eq('referrer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim() || 'https://2hands.ai'
    const referralUrl = `${baseUrl}/signup?ref=${profile.referral_code || ''}`

    return NextResponse.json({
      referralCode: profile.referral_code || '',
      referralUrl,
      referralCount: profile.referral_count || 0,
      totalCreditsEarned: (profile.referral_count || 0) * 500,
      currentCredits: profile.credits || 0,
      recentReferrals: referrals || [],
    })
  } catch (error) {
    console.error('Referral GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Apply a referral code (for new users)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = await parseAndValidate(request, referralRequestSchema)
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: parsed.status })
    }
    
    const { referralCode } = parsed.data

    // Call the complete_referral function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('complete_referral', {
        p_referral_code: referralCode.toUpperCase(),
        p_referee_id: user.id,
      })

    if (error) {
      console.error('Referral error:', error)
      return NextResponse.json({ error: 'Failed to apply referral' }, { status: 500 })
    }

    const results = data as unknown as ReferralResult[] | null
    const result = results?.[0]
    
    if (!result?.success) {
      return NextResponse.json({ error: result?.message || 'Invalid referral code' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      creditsAwarded: result.credits_awarded,
    })
  } catch (error) {
    console.error('Referral POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
