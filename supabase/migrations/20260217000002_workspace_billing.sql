-- ============================================================
-- Add per-workspace billing/credits fields
-- ============================================================

-- Add billing fields to workspaces table
ALTER TABLE workspaces 
ADD COLUMN IF NOT EXISTS credits_balance INTEGER DEFAULT 1000,
ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_status TEXT,
ADD COLUMN IF NOT EXISTS monthly_credits INTEGER DEFAULT 1000,
ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_email TEXT;

-- Create index for Stripe lookups
CREATE INDEX IF NOT EXISTS idx_workspaces_stripe_customer 
ON workspaces(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ============================================================
-- Backfill workspace credits from user profiles
-- ============================================================

-- For personal workspaces, copy credits and plan from the owner's profile
UPDATE workspaces w
SET 
  credits_balance = COALESCE(p.credits, 1000),
  plan_type = COALESCE(p.plan_type, 'free'),
  stripe_customer_id = p.stripe_customer_id,
  billing_email = p.email
FROM profiles p
WHERE w.owner_id = p.id
  AND w.is_personal = TRUE;

-- For team workspaces, initialize with default free plan credits
UPDATE workspaces
SET 
  credits_balance = 1000,
  plan_type = 'free'
WHERE is_personal = FALSE
  AND credits_balance IS NULL;

-- ============================================================
-- Create workspace credit adjustment RPC
-- ============================================================

CREATE OR REPLACE FUNCTION adjust_workspace_credits(
  p_workspace_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT 'adjustment'
)
RETURNS TABLE(new_balance INTEGER, success BOOLEAN) AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  -- Update workspace credits atomically
  UPDATE workspaces
  SET credits_balance = GREATEST(0, credits_balance + p_amount),
      updated_at = NOW()
  WHERE id = p_workspace_id
  RETURNING credits_balance INTO v_new_balance;

  -- Log the adjustment (optional - create credit_logs table if needed)
  -- For now, just return the result
  
  RETURN QUERY SELECT v_new_balance, TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION adjust_workspace_credits(UUID, INTEGER, TEXT) TO authenticated;

-- ============================================================
-- Update RLS policies for workspace billing access
-- ============================================================

-- Allow workspace members to read workspace billing info
DROP POLICY IF EXISTS "workspace_members_read_billing" ON workspaces;
CREATE POLICY "workspace_members_read_billing" ON workspaces
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT workspace_id 
      FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Only workspace owners can update billing info
DROP POLICY IF EXISTS "workspace_owners_update_billing" ON workspaces;
CREATE POLICY "workspace_owners_update_billing" ON workspaces
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT workspace_id 
      FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin')
    )
  );
