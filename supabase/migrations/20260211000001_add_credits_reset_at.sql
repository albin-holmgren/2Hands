-- Add credits_reset_at column to track per-user credit reset times
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing free users to have a reset time so they don't all reset immediately
UPDATE profiles SET credits_reset_at = NOW() WHERE plan_type = 'free' AND credits_reset_at IS NULL;

-- Create index for efficient reset queries
CREATE INDEX IF NOT EXISTS idx_profiles_credits_reset_at ON profiles(credits_reset_at) WHERE plan_type = 'free';
