#!/bin/bash

# 2Hands Stripe Products Setup Script
# Run this script to create all products and prices in Stripe
# Usage: ./scripts/setup-stripe-products.sh

set -e

echo "🚀 Setting up Stripe products for 2Hands..."

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo "❌ Stripe CLI not found. Install it first: https://stripe.com/docs/stripe-cli"
    exit 1
fi

# Create Products
echo "📦 Creating products..."

# Starter Plan
STARTER_PRODUCT=$(stripe products create \
  --name="2Hands Starter" \
  --description="4,000 credits/month, up to 5 agents, basic scheduling" \
  --metadata[tier]="starter" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Created Starter product: $STARTER_PRODUCT"

# Pro Plan
PRO_PRODUCT=$(stripe products create \
  --name="2Hands Pro" \
  --description="12,000 credits/month, up to 15 agents, advanced scheduling, priority support" \
  --metadata[tier]="pro" \
  --metadata[popular]="true" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Created Pro product: $PRO_PRODUCT"

# Business Plan
BUSINESS_PRODUCT=$(stripe products create \
  --name="2Hands Business" \
  --description="30,000 credits/month, up to 50 agents, highest concurrency, dedicated support" \
  --metadata[tier]="business" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Created Business product: $BUSINESS_PRODUCT"

# Credit Packs
SMALL_PACK=$(stripe products create \
  --name="Small Credit Pack" \
  --description="2,500 credits" \
  --metadata[type]="credit_pack" \
  --metadata[credits]="2500" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Created Small Pack product: $SMALL_PACK"

MEDIUM_PACK=$(stripe products create \
  --name="Medium Credit Pack" \
  --description="7,500 credits - Best Value" \
  --metadata[type]="credit_pack" \
  --metadata[credits]="7500" \
  --metadata[best_value]="true" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Created Medium Pack product: $MEDIUM_PACK"

LARGE_PACK=$(stripe products create \
  --name="Large Credit Pack" \
  --description="20,000 credits" \
  --metadata[type]="credit_pack" \
  --metadata[credits]="20000" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Created Large Pack product: $LARGE_PACK"

XL_PACK=$(stripe products create \
  --name="XL Credit Pack" \
  --description="45,000 credits" \
  --metadata[type]="credit_pack" \
  --metadata[credits]="45000" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Created XL Pack product: $XL_PACK"

# Create Prices
echo "💰 Creating prices..."

# Starter Prices
STARTER_MONTHLY=$(stripe prices create \
  --product="$STARTER_PRODUCT" \
  --unit-amount=2500 \
  --currency=usd \
  --recurring[interval]=month \
  --metadata[plan]="starter" \
  --metadata[credits]="4000" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Starter Monthly: $STARTER_MONTHLY"

STARTER_YEARLY=$(stripe prices create \
  --product="$STARTER_PRODUCT" \
  --unit-amount=25000 \
  --currency=usd \
  --recurring[interval]=year \
  --metadata[plan]="starter" \
  --metadata[credits]="48000" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Starter Yearly: $STARTER_YEARLY"

# Pro Prices
PRO_MONTHLY=$(stripe prices create \
  --product="$PRO_PRODUCT" \
  --unit-amount=4000 \
  --currency=usd \
  --recurring[interval]=month \
  --metadata[plan]="pro" \
  --metadata[credits]="12000" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Pro Monthly: $PRO_MONTHLY"

PRO_YEARLY=$(stripe prices create \
  --product="$PRO_PRODUCT" \
  --unit-amount=40000 \
  --currency=usd \
  --recurring[interval]=year \
  --metadata[plan]="pro" \
  --metadata[credits]="144000" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Pro Yearly: $PRO_YEARLY"

# Business Prices
BUSINESS_MONTHLY=$(stripe prices create \
  --product="$BUSINESS_PRODUCT" \
  --unit-amount=10000 \
  --currency=usd \
  --recurring[interval]=month \
  --metadata[plan]="business" \
  --metadata[credits]="30000" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Business Monthly: $BUSINESS_MONTHLY"

BUSINESS_YEARLY=$(stripe prices create \
  --product="$BUSINESS_PRODUCT" \
  --unit-amount=100000 \
  --currency=usd \
  --recurring[interval]=year \
  --metadata[plan]="business" \
  --metadata[credits]="360000" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Business Yearly: $BUSINESS_YEARLY"

# Credit Pack Prices (one-time)
SMALL_PRICE=$(stripe prices create \
  --product="$SMALL_PACK" \
  --unit-amount=1000 \
  --currency=usd \
  --metadata[type]="credit_pack" \
  --metadata[pack]="small" \
  --metadata[credits]="2500" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Small Pack Price: $SMALL_PRICE"

MEDIUM_PRICE=$(stripe prices create \
  --product="$MEDIUM_PACK" \
  --unit-amount=2500 \
  --currency=usd \
  --metadata[type]="credit_pack" \
  --metadata[pack]="medium" \
  --metadata[credits]="7500" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Medium Pack Price: $MEDIUM_PRICE"

LARGE_PRICE=$(stripe prices create \
  --product="$LARGE_PACK" \
  --unit-amount=6000 \
  --currency=usd \
  --metadata[type]="credit_pack" \
  --metadata[pack]="large" \
  --metadata[credits]="20000" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Large Pack Price: $LARGE_PRICE"

XL_PRICE=$(stripe prices create \
  --product="$XL_PACK" \
  --unit-amount=12000 \
  --currency=usd \
  --metadata[type]="credit_pack" \
  --metadata[pack]="xlarge" \
  --metadata[credits]="45000" \
  --format=json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ XL Pack Price: $XL_PRICE"

echo ""
echo "🎉 All products and prices created successfully!"
echo ""
echo "📋 Summary of Price IDs (add these to your .env.local):"
echo ""
echo "# Subscription Prices"
echo "STRIPE_PRICE_STARTER_MONTHLY=$STARTER_MONTHLY"
echo "STRIPE_PRICE_STARTER_YEARLY=$STARTER_YEARLY"
echo "STRIPE_PRICE_PRO_MONTHLY=$PRO_MONTHLY"
echo "STRIPE_PRICE_PRO_YEARLY=$PRO_YEARLY"
echo "STRIPE_PRICE_BUSINESS_MONTHLY=$BUSINESS_MONTHLY"
echo "STRIPE_PRICE_BUSINESS_YEARLY=$BUSINESS_YEARLY"
echo ""
echo "# Credit Pack Prices"
echo "STRIPE_PRICE_PACK_SMALL=$SMALL_PRICE"
echo "STRIPE_PRICE_PACK_MEDIUM=$MEDIUM_PRICE"
echo "STRIPE_PRICE_PACK_LARGE=$LARGE_PRICE"
echo "STRIPE_PRICE_PACK_XL=$XL_PRICE"
echo ""
echo "Next steps:"
echo "1. Add the above price IDs to your .env.local"
echo "2. Set up the webhook endpoint in Stripe Dashboard:"
echo "   URL: https://your-domain.com/api/stripe/webhook"
echo "   Events: checkout.session.completed, customer.subscription.updated,"
echo "           customer.subscription.deleted, invoice.payment_succeeded,"
echo "           invoice.payment_failed"
echo "3. Add the webhook signing secret to .env.local as STRIPE_WEBHOOK_SECRET"
