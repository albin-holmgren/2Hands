/**
 * Setup script: Creates all Stripe products and prices for 2Hands.
 * 
 * Usage:
 *   npx tsx scripts/setup-stripe-prices.ts
 * 
 * Requires STRIPE_SECRET_KEY in .env.local
 * Outputs all STRIPE_PRICE_* env vars to paste into .env.local
 */

import Stripe from 'stripe'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load env files (most specific wins)
dotenv.config({ path: path.resolve(__dirname, '../.env.vercel') })
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true })
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local'), override: true })

// Strip quotes, literal \n, whitespace
const stripeKey = (process.env.STRIPE_SECRET_KEY || '')
  .replace(/^['"]|['"]$/g, '')
  .replace(/\\n/g, '')
  .trim()
if (!stripeKey || !stripeKey.startsWith('sk_')) {
  console.error('❌ STRIPE_SECRET_KEY not found or invalid in .env.local (must start with sk_)')
  console.error('   Got:', JSON.stringify(process.env.STRIPE_SECRET_KEY?.slice(0, 20)))
  process.exit(1)
}

const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion })

interface TierDef {
  key: string
  credits: number
  monthlyPriceCents: number
  yearlyPriceCents: number
}

interface PlanDef {
  name: string
  description: string
  tiers: TierDef[]
}

const plans: Record<string, PlanDef> = {
  starter: {
    name: 'Starter',
    description: 'For individuals getting started with AI automation',
    tiers: [
      { key: 't1', credits: 10000, monthlyPriceCents: 2500, yearlyPriceCents: 25000 },
      { key: 't2', credits: 20000, monthlyPriceCents: 4000, yearlyPriceCents: 40000 },
      { key: 't3', credits: 35000, monthlyPriceCents: 6000, yearlyPriceCents: 60000 },
    ],
  },
  pro: {
    name: 'Pro',
    description: 'For power users and small teams',
    tiers: [
      { key: 't1', credits: 50000, monthlyPriceCents: 4900, yearlyPriceCents: 49000 },
      { key: 't2', credits: 80000, monthlyPriceCents: 7900, yearlyPriceCents: 79000 },
      { key: 't3', credits: 120000, monthlyPriceCents: 11900, yearlyPriceCents: 119000 },
    ],
  },
  business: {
    name: 'Business',
    description: 'For growing teams and departments',
    tiers: [
      { key: 't1', credits: 200000, monthlyPriceCents: 14900, yearlyPriceCents: 149000 },
      { key: 't2', credits: 350000, monthlyPriceCents: 24900, yearlyPriceCents: 249000 },
      { key: 't3', credits: 600000, monthlyPriceCents: 39900, yearlyPriceCents: 399000 },
    ],
  },
}

const creditPacks = [
  { key: 'small', name: 'Small Credit Pack', credits: 2500, priceCents: 1000 },
  { key: 'medium', name: 'Medium Credit Pack', credits: 7500, priceCents: 2500 },
  { key: 'large', name: 'Large Credit Pack', credits: 20000, priceCents: 6000 },
  { key: 'xlarge', name: 'XL Credit Pack', credits: 45000, priceCents: 12000 },
]

async function main() {
  const envLines: string[] = []

  console.log('🔧 Creating Stripe products and prices for 2Hands...\n')

  // Create subscription products + prices
  for (const [planKey, plan] of Object.entries(plans)) {
    for (const tier of plan.tiers) {
      const productName = `2Hands ${plan.name} - ${tier.credits.toLocaleString()} credits/mo`
      console.log(`Creating product: ${productName}`)

      const product = await stripe.products.create({
        name: productName,
        description: `${plan.description}. ${tier.credits.toLocaleString()} credits per month.`,
        metadata: {
          plan: planKey,
          tier: tier.key,
          credits: String(tier.credits),
        },
      })

      // Monthly price
      const monthlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: tier.monthlyPriceCents,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { plan: planKey, tier: tier.key, interval: 'monthly' },
      })

      // Yearly price
      const yearlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: tier.yearlyPriceCents,
        currency: 'usd',
        recurring: { interval: 'year' },
        metadata: { plan: planKey, tier: tier.key, interval: 'yearly' },
      })

      const monthlyEnv = `STRIPE_PRICE_${planKey.toUpperCase()}_${tier.key.toUpperCase()}_MONTHLY`
      const yearlyEnv = `STRIPE_PRICE_${planKey.toUpperCase()}_${tier.key.toUpperCase()}_YEARLY`
      envLines.push(`${monthlyEnv}=${monthlyPrice.id}`)
      envLines.push(`${yearlyEnv}=${yearlyPrice.id}`)

      console.log(`  ✅ ${monthlyEnv}=${monthlyPrice.id}`)
      console.log(`  ✅ ${yearlyEnv}=${yearlyPrice.id}`)
    }
  }

  // Create credit pack products + prices
  console.log('\nCreating credit packs...')
  for (const pack of creditPacks) {
    const product = await stripe.products.create({
      name: `2Hands ${pack.name}`,
      description: `One-time purchase of ${pack.credits.toLocaleString()} credits`,
      metadata: { type: 'credit_pack', pack: pack.key, credits: String(pack.credits) },
    })

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: pack.priceCents,
      currency: 'usd',
      metadata: { type: 'credit_pack', pack: pack.key, credits: String(pack.credits) },
    })

    const envKey = `STRIPE_PRICE_CREDITS_${pack.key.toUpperCase()}`
    envLines.push(`${envKey}=${price.id}`)
    console.log(`  ✅ ${envKey}=${price.id}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('📋 Add these to your .env.local:\n')
  console.log(envLines.join('\n'))
  console.log('\n' + '='.repeat(60))
  console.log('✅ Done! Paste the above into your .env.local and restart the dev server.')
}

main().catch((err) => {
  console.error('❌ Error:', err)
  process.exit(1)
})
