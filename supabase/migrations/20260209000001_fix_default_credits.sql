-- Fix default credits for new users: 100 → 300 (matches PRICING.free.dailyCredits)
ALTER TABLE profiles ALTER COLUMN credits SET DEFAULT 300;

-- Also update plan_type check constraint to include all plan types
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_plan_type_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_plan_type_check 
  CHECK (plan_type IN ('free', 'starter', 'pro', 'business'));

-- Update any existing free users who still have exactly 100 credits (the old default)
-- to the new daily allowance of 300
UPDATE profiles SET credits = 300 WHERE plan_type = 'free' AND credits = 100;
