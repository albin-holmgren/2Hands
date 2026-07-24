import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // Check for Bearer token (mobile) or cookies (web)
    const authHeader = request.headers.get('Authorization')
    let supabase = await createClient()
    let user = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const { createClient: createBrowserClient } = await import('@supabase/supabase-js')
      const supabaseWithToken = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        }
      )
      const { data: { user: tokenUser }, error } = await supabaseWithToken.auth.getUser(token)
      if (!error && tokenUser) {
        user = tokenUser
        supabase = supabaseWithToken
      }
    } else {
      const { data: { user: cookieUser }, error } = await supabase.auth.getUser()
      if (!error) user = cookieUser
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting
    const rateKey = createRateLimitKey(user.id, 'portal')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.checkout) // Same limits as checkout
    if (!rateCheck.allowed) {
      return NextResponse.json({ 
        error: 'Too many requests. Please wait a moment.',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
      }, { status: 429 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single() as { data: { stripe_customer_id: string | null } | null }

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found' },
        { status: 400 }
      )
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim() || 'http://localhost:3000'

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${baseUrl}/app`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Portal session error:', error)
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    )
  }
}
