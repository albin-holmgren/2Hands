// Stripe Products Setup Script
// Run with: npx tsx scripts/setup-stripe-products.ts

import Stripe from 'stripe'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY environment variable is required')
  console.log('Run with: STRIPE_SECRET_KEY=sk_live_xxx npx tsx scripts/setup-stripe-products.ts')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY)

async function createProducts() {
  console.log('🚀 Setting up Stripe products for 2Hands...\n')

  // Create Subscription Products
  console.log('📦 Creating subscription products...')

  const starterProduct = await stripe.products.create({
    name: '2Hands Starter',
    description: '4,000 credits/month, up to 5 agents, basic scheduling',
    metadata: { tier: 'starter' },
  })
  console.log(`✅ Created Starter product: ${starterProduct.id}`)

  const proProduct = await stripe.products.create({
    name: '2Hands Pro',
    description: '12,000 credits/month, up to 15 agents, advanced scheduling, priority support',
    metadata: { tier: 'pro', popular: 'true' },
  })
  console.log(`✅ Created Pro product: ${proProduct.id}`)

  const businessProduct = await stripe.products.create({
    name: '2Hands Business',
    description: '30,000 credits/month, up to 50 agents, highest concurrency, dedicated support',
    metadata: { tier: 'business' },
  })
  console.log(`✅ Created Business product: ${businessProduct.id}`)

  // Create Credit Pack Products
  console.log('\n📦 Creating credit pack products...')

  const smallPack = await stripe.products.create({
    name: 'Small Credit Pack',
    description: '2,500 credits',
    metadata: { type: 'credit_pack', credits: '2500' },
  })
  console.log(`✅ Created Small Pack: ${smallPack.id}`)

  const mediumPack = await stripe.products.create({
    name: 'Medium Credit Pack',
    description: '7,500 credits - Best Value',
    metadata: { type: 'credit_pack', credits: '7500', best_value: 'true' },
  })
  console.log(`✅ Created Medium Pack: ${mediumPack.id}`)

  const largePack = await stripe.products.create({
    name: 'Large Credit Pack',
    description: '20,000 credits',
    metadata: { type: 'credit_pack', credits: '20000' },
  })
  console.log(`✅ Created Large Pack: ${largePack.id}`)

  const xlPack = await stripe.products.create({
    name: 'XL Credit Pack',
    description: '45,000 credits',
    metadata: { type: 'credit_pack', credits: '45000' },
  })
  console.log(`✅ Created XL Pack: ${xlPack.id}`)

  // Create Subscription Prices
  console.log('\n💰 Creating subscription prices...')

  const starterMonthly = await stripe.prices.create({
    product: starterProduct.id,
    unit_amount: 2500, // $25
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { plan: 'starter', credits: '4000' },
  })
  console.log(`✅ Starter Monthly: ${starterMonthly.id}`)

  const starterYearly = await stripe.prices.create({
    product: starterProduct.id,
    unit_amount: 25000, // $250
    currency: 'usd',
    recurring: { interval: 'year' },
    metadata: { plan: 'starter', credits: '48000' },
  })
  console.log(`✅ Starter Yearly: ${starterYearly.id}`)

  const proMonthly = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 4000, // $40
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { plan: 'pro', credits: '12000' },
  })
  console.log(`✅ Pro Monthly: ${proMonthly.id}`)

  const proYearly = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 40000, // $400
    currency: 'usd',
    recurring: { interval: 'year' },
    metadata: { plan: 'pro', credits: '144000' },
  })
  console.log(`✅ Pro Yearly: ${proYearly.id}`)

  const businessMonthly = await stripe.prices.create({
    product: businessProduct.id,
    unit_amount: 10000, // $100
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { plan: 'business', credits: '30000' },
  })
  console.log(`✅ Business Monthly: ${businessMonthly.id}`)

  const businessYearly = await stripe.prices.create({
    product: businessProduct.id,
    unit_amount: 100000, // $1000
    currency: 'usd',
    recurring: { interval: 'year' },
    metadata: { plan: 'business', credits: '360000' },
  })
  console.log(`✅ Business Yearly: ${businessYearly.id}`)

  // Create Credit Pack Prices (one-time)
  console.log('\n💰 Creating credit pack prices...')

  const smallPrice = await stripe.prices.create({
    product: smallPack.id,
    unit_amount: 1000, // $10
    currency: 'usd',
    metadata: { type: 'credit_pack', pack: 'small', credits: '2500' },
  })
  console.log(`✅ Small Pack Price: ${smallPrice.id}`)

  const mediumPrice = await stripe.prices.create({
    product: mediumPack.id,
    unit_amount: 2500, // $25
    currency: 'usd',
    metadata: { type: 'credit_pack', pack: 'medium', credits: '7500' },
  })
  console.log(`✅ Medium Pack Price: ${mediumPrice.id}`)

  const largePrice = await stripe.prices.create({
    product: largePack.id,
    unit_amount: 6000, // $60
    currency: 'usd',
    metadata: { type: 'credit_pack', pack: 'large', credits: '20000' },
  })
  console.log(`✅ Large Pack Price: ${largePrice.id}`)

  const xlPrice = await stripe.prices.create({
    product: xlPack.id,
    unit_amount: 12000, // $120
    currency: 'usd',
    metadata: { type: 'credit_pack', pack: 'xlarge', credits: '45000' },
  })
  console.log(`✅ XL Pack Price: ${xlPrice.id}`)

  // Output summary
  console.log('\n🎉 All products and prices created successfully!\n')
  console.log('📋 Add these to your .env.local:\n')
  console.log('# Subscription Prices')
  console.log(`STRIPE_PRICE_STARTER_MONTHLY=${starterMonthly.id}`)
  console.log(`STRIPE_PRICE_STARTER_YEARLY=${starterYearly.id}`)
  console.log(`STRIPE_PRICE_PRO_MONTHLY=${proMonthly.id}`)
  console.log(`STRIPE_PRICE_PRO_YEARLY=${proYearly.id}`)
  console.log(`STRIPE_PRICE_BUSINESS_MONTHLY=${businessMonthly.id}`)
  console.log(`STRIPE_PRICE_BUSINESS_YEARLY=${businessYearly.id}`)
  console.log('\n# Credit Pack Prices')
  console.log(`STRIPE_PRICE_PACK_SMALL=${smallPrice.id}`)
  console.log(`STRIPE_PRICE_PACK_MEDIUM=${mediumPrice.id}`)
  console.log(`STRIPE_PRICE_PACK_LARGE=${largePrice.id}`)
  console.log(`STRIPE_PRICE_PACK_XL=${xlPrice.id}`)
  console.log('\n# Next steps:')
  console.log('1. Add the above to .env.local')
  console.log('2. Set up webhook in Stripe Dashboard:')
  console.log('   URL: https://your-domain.com/api/stripe/webhook')
  console.log('   Events: checkout.session.completed, customer.subscription.updated,')
  console.log('           customer.subscription.deleted, invoice.payment_succeeded,')
  console.log('           invoice.payment_failed')
  console.log('3. Add webhook secret as STRIPE_WEBHOOK_SECRET in .env.local')
}

createProducts().catch(console.error)
