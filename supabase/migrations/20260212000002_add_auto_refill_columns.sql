-- Add auto-refill credit settings to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auto_refill_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_refill_threshold integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS auto_refill_amount integer NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS billing_period_start timestamptz;

COMMENT ON COLUMN profiles.auto_refill_enabled IS 'Whether auto-refill is turned on';
COMMENT ON COLUMN profiles.auto_refill_threshold IS 'Trigger refill when credits drop below this';
COMMENT ON COLUMN profiles.auto_refill_amount IS 'Number of credits to add when auto-refill triggers (in credits, not dollars)';
COMMENT ON COLUMN profiles.billing_period_start IS 'Start of the current billing period (set by webhook)';
