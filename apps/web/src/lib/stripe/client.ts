import Stripe from 'stripe'

// Lazy initialization to avoid build-time errors
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const stripeSecretKey = (process.env.STRIPE_SECRET_KEY || '').replace(/\\n/g, '').replace(/\n/g, '').trim()
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    _stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
    })
  }
  return _stripe
}

// Keep backward compatibility - but this will throw at runtime if accessed before getStripe()
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
