-- Referral System Migration
-- Tracks referrals and awards 500 credits to both referrer and referee

-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  credits_awarded INTEGER DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- Add referral_code to profiles for easy lookup
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0;

-- Generate unique referral code for existing users
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to create referral code for user if not exists
CREATE OR REPLACE FUNCTION ensure_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate referral code on profile creation
DROP TRIGGER IF EXISTS ensure_referral_code_trigger ON profiles;
CREATE TRIGGER ensure_referral_code_trigger
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  WHEN (NEW.referral_code IS NULL)
  EXECUTE FUNCTION ensure_referral_code();

-- Function to complete a referral and award credits
CREATE OR REPLACE FUNCTION complete_referral(
  p_referral_code TEXT,
  p_referee_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  referrer_id UUID,
  credits_awarded INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referrer_id UUID;
  v_referral_id UUID;
  v_credits INTEGER := 500;
BEGIN
  -- Find the referrer by code
  SELECT id INTO v_referrer_id
  FROM profiles
  WHERE referral_code = p_referral_code;

  IF v_referrer_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Invalid referral code'::TEXT, NULL::UUID, 0;
    RETURN;
  END IF;

  -- Check if referee is trying to use their own code
  IF v_referrer_id = p_referee_id THEN
    RETURN QUERY SELECT FALSE, 'Cannot use your own referral code'::TEXT, NULL::UUID, 0;
    RETURN;
  END IF;

  -- Check if referee was already referred
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_referee_id AND referred_by IS NOT NULL) THEN
    RETURN QUERY SELECT FALSE, 'You have already used a referral code'::TEXT, NULL::UUID, 0;
    RETURN;
  END IF;

  -- Update referee's referred_by
  UPDATE profiles
  SET referred_by = v_referrer_id
  WHERE id = p_referee_id;

  -- Award credits to referrer
  UPDATE profiles
  SET credits = COALESCE(credits, 0) + v_credits,
      referral_count = COALESCE(referral_count, 0) + 1
  WHERE id = v_referrer_id;

  -- Award credits to referee
  UPDATE profiles
  SET credits = COALESCE(credits, 0) + v_credits
  WHERE id = p_referee_id;

  -- Record the referral
  INSERT INTO referrals (referrer_id, referee_id, referral_code, status, completed_at)
  VALUES (v_referrer_id, p_referee_id, p_referral_code, 'completed', NOW())
  RETURNING id INTO v_referral_id;

  RETURN QUERY SELECT TRUE, 'Referral completed! You both received 500 credits.'::TEXT, v_referrer_id, v_credits;
END;
$$;

-- RLS Policies
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own referrals" ON referrals;
CREATE POLICY "Users can view own referrals"
  ON referrals FOR SELECT
  USING (referrer_id = auth.uid() OR referee_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access to referrals" ON referrals;
CREATE POLICY "Service role full access to referrals"
  ON referrals FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION complete_referral TO authenticated;
GRANT EXECUTE ON FUNCTION complete_referral TO service_role;
GRANT EXECUTE ON FUNCTION generate_referral_code TO service_role;

-- Generate referral codes for existing users
UPDATE profiles
SET referral_code = generate_referral_code()
WHERE referral_code IS NULL;
