-- Webhook idempotency table to prevent duplicate processing
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL, -- Stripe event ID (evt_xxx)
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  payload JSONB, -- Optional: store event payload for debugging
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id ON stripe_webhook_events(event_id);

-- Auto-cleanup old events (keep 30 days)
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created_at ON stripe_webhook_events(created_at);

-- Atomic credit adjustment function
-- Returns the new credit balance after adjustment
-- Prevents race conditions with concurrent updates
CREATE OR REPLACE FUNCTION adjust_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT NULL,
  p_max_credits INTEGER DEFAULT NULL -- Optional cap
)
RETURNS TABLE(
  success BOOLEAN,
  new_balance INTEGER,
  previous_balance INTEGER,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_credits INTEGER;
  v_new_credits INTEGER;
BEGIN
  -- Lock the row to prevent concurrent updates
  SELECT credits INTO v_current_credits
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'User not found'::TEXT;
    RETURN;
  END IF;

  v_current_credits := COALESCE(v_current_credits, 0);
  v_new_credits := v_current_credits + p_amount;

  -- Check for insufficient credits on deduction
  IF p_amount < 0 AND v_new_credits < 0 THEN
    RETURN QUERY SELECT FALSE, v_current_credits, v_current_credits, 'Insufficient credits'::TEXT;
    RETURN;
  END IF;

  -- Apply cap if specified
  IF p_max_credits IS NOT NULL AND v_new_credits > p_max_credits THEN
    v_new_credits := p_max_credits;
  END IF;

  -- Ensure non-negative
  IF v_new_credits < 0 THEN
    v_new_credits := 0;
  END IF;

  -- Update credits
  UPDATE profiles
  SET credits = v_new_credits
  WHERE id = p_user_id;

  -- Log the adjustment (optional - uncomment if you have a credit_history table)
  -- INSERT INTO credit_history (user_id, amount, reason, balance_after, created_at)
  -- VALUES (p_user_id, p_amount, p_reason, v_new_credits, NOW());

  RETURN QUERY SELECT TRUE, v_new_credits, v_current_credits, NULL::TEXT;
END;
$$;

-- Function to check if webhook event was already processed
CREATE OR REPLACE FUNCTION is_webhook_processed(p_event_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM stripe_webhook_events WHERE event_id = p_event_id
  );
END;
$$;

-- Function to mark webhook event as processed
CREATE OR REPLACE FUNCTION mark_webhook_processed(
  p_event_id TEXT,
  p_event_type TEXT,
  p_payload JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO stripe_webhook_events (event_id, event_type, payload)
  VALUES (p_event_id, p_event_type, p_payload)
  ON CONFLICT (event_id) DO NOTHING;
  
  RETURN TRUE;
END;
$$;

-- Grant execute permissions to authenticated and service role
GRANT EXECUTE ON FUNCTION adjust_credits TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_credits TO service_role;
GRANT EXECUTE ON FUNCTION is_webhook_processed TO service_role;
GRANT EXECUTE ON FUNCTION mark_webhook_processed TO service_role;

-- RLS for webhook events table (only service role should access)
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access to webhook events" ON stripe_webhook_events;
CREATE POLICY "Service role full access to webhook events"
  ON stripe_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
