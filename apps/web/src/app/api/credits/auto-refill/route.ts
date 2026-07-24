import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('auto_refill_enabled, auto_refill_threshold, auto_refill_amount')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json(profile)
  } catch (error) {
    console.error('Auto-refill GET error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { enabled, threshold, amount } = body

    // Validate
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
    }
    if (enabled) {
      if (typeof threshold !== 'number' || threshold < 10 || threshold > 100000) {
        return NextResponse.json({ error: 'threshold must be between 10 and 100,000' }, { status: 400 })
      }
      if (typeof amount !== 'number' || amount < 1000 || amount > 500000) {
        return NextResponse.json({ error: 'amount must be between 1,000 and 500,000 credits' }, { status: 400 })
      }
    }

    // Check user is on a paid plan (required for auto-charging)
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, plan_type, subscription_status')
      .eq('id', user.id)
      .single() as { data: { stripe_customer_id: string | null; plan_type: string | null; subscription_status: string | null } | null }

    if (enabled) {
      const planType = profile?.plan_type || 'free'
      const subStatus = profile?.subscription_status
      const isPaid = planType !== 'free' && (subStatus === 'active' || subStatus === 'trialing' || subStatus === 'past_due')
      if (!isPaid) {
        return NextResponse.json(
          { error: 'Auto-refill is only available on paid plans. Please upgrade first.', code: 'FREE_PLAN' },
          { status: 403 }
        )
      }
      if (!profile?.stripe_customer_id) {
        return NextResponse.json(
          { error: 'You need an active subscription to enable auto-refill' },
          { status: 400 }
        )
      }
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        auto_refill_enabled: enabled,
        auto_refill_threshold: enabled ? threshold : 100,
        auto_refill_amount: enabled ? amount : 5000,
      } as never)
      .eq('id', user.id)

    if (updateError) {
      console.error('Auto-refill update error:', updateError)
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Auto-refill POST error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
