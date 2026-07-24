-- Add Stripe-related fields to profiles table
-- Run this migration in your Supabase SQL editor

-- Add stripe_customer_id for linking to Stripe customer
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Add stripe_subscription_id for tracking active subscription
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add subscription_status for tracking subscription state
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS subscription_status TEXT 
CHECK (subscription_status IN ('active', 'past_due', 'canceled'));

-- Update plan_type to include new tiers
-- First drop the old constraint if it exists
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS profiles_plan_type_check;

-- Add new constraint with updated plan types
ALTER TABLE profiles 
ADD CONSTRAINT profiles_plan_type_check 
CHECK (plan_type IN ('free', 'starter', 'pro', 'business'));

-- Create index on stripe_customer_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id 
ON profiles(stripe_customer_id);

-- Create index on stripe_subscription_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription_id 
ON profiles(stripe_subscription_id);
