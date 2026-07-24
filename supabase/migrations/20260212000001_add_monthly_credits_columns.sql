-- Add monthly_credits and monthly_credit_cap columns to profiles
-- monthly_credits: the user's selected tier credits per month (set by webhook on subscription)
-- monthly_credit_cap: max credits allowed (rollover cap = monthly_credits * 2)

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS monthly_credits INTEGER DEFAULT 0;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS monthly_credit_cap INTEGER DEFAULT 0;

-- Index for queries filtering by monthly_credits (e.g. billing page)
CREATE INDEX IF NOT EXISTS idx_profiles_monthly_credits ON profiles(monthly_credits);
