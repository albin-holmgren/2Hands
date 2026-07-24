-- ============================================================
-- Fix workspace credit model
-- 1. Add paid_credits_balance column (persists through daily reset)
-- 2. Fix column defaults: 1000 → 300
-- 3. Backfill existing data (Option A: clamp free workspaces to 300)
-- 4. Add RPCs: add_paid_workspace_credits, reset_workspace_daily_credits
-- 5. Update ensure_personal_workspace to start with 300 credits
-- ============================================================

-- 1. Add paid_credits_balance column
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS paid_credits_balance INTEGER NOT NULL DEFAULT 0;

-- 2. Fix column defaults
ALTER TABLE workspaces ALTER COLUMN credits_balance SET DEFAULT 300;
ALTER TABLE workspaces ALTER COLUMN monthly_credits SET DEFAULT 300;

-- ============================================================
-- 3. Backfill existing data
-- ============================================================

-- Free workspaces (plan_type = 'free' or NULL): clamp to 300, zero out paid bucket
UPDATE workspaces
SET
  credits_balance      = 300,
  paid_credits_balance = 0,
  monthly_credits      = 300
WHERE COALESCE(plan_type, 'free') = 'free';

-- Paid workspaces: preserve existing balance, but separate it into
-- a paid bucket (balance above 300 is treated as paid/subscription credits)
UPDATE workspaces
SET
  paid_credits_balance = GREATEST(0, credits_balance - 300)
WHERE COALESCE(plan_type, 'free') != 'free';

-- ============================================================
-- 4a. RPC: add_paid_workspace_credits
-- Used for Stripe credit-pack purchases and subscription grants.
-- Increments both paid_credits_balance and credits_balance atomically.
-- ============================================================
CREATE OR REPLACE FUNCTION add_paid_workspace_credits(
  p_workspace_id UUID,
  p_amount       INTEGER,
  p_reason       TEXT DEFAULT 'purchase'
)
RETURNS TABLE(new_balance INTEGER, new_paid_balance INTEGER, success BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_total INTEGER;
  v_new_paid  INTEGER;
BEGIN
  UPDATE workspaces
  SET
    paid_credits_balance = GREATEST(0, paid_credits_balance + p_amount),
    credits_balance      = GREATEST(0, credits_balance      + p_amount),
    updated_at           = NOW()
  WHERE id = p_workspace_id
  RETURNING credits_balance, paid_credits_balance
    INTO v_new_total, v_new_paid;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0, FALSE;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_new_total, v_new_paid, TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION add_paid_workspace_credits(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_paid_workspace_credits(UUID, INTEGER, TEXT) TO service_role;

-- ============================================================
-- 4b. RPC: reset_workspace_daily_credits
-- Daily free refill: sets credits_balance = 300 + paid_credits_balance.
-- Never accumulates above 300 free credits; paid credits are untouched.
-- ============================================================
CREATE OR REPLACE FUNCTION reset_workspace_daily_credits(
  p_workspace_id UUID
)
RETURNS TABLE(new_balance INTEGER, success BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_paid      INTEGER;
  v_new_total INTEGER;
BEGIN
  SELECT paid_credits_balance INTO v_paid
  FROM workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, FALSE;
    RETURN;
  END IF;

  v_new_total := 300 + COALESCE(v_paid, 0);

  UPDATE workspaces
  SET
    credits_balance = v_new_total,
    credits_reset_at = NOW(),
    updated_at       = NOW()
  WHERE id = p_workspace_id;

  RETURN QUERY SELECT v_new_total, TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_workspace_daily_credits(UUID) TO service_role;
-- Authenticated users can trigger their own daily reset (called from check-reset route)
GRANT EXECUTE ON FUNCTION reset_workspace_daily_credits(UUID) TO authenticated;

-- ============================================================
-- 5. Update ensure_personal_workspace to start with 300 credits
-- (column default is now 300, so just explicitly set it for clarity)
-- ============================================================
CREATE OR REPLACE FUNCTION ensure_personal_workspace(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_workspace_id   UUID;
  v_user_name      TEXT;
  v_member_exists  BOOLEAN;
BEGIN
  -- Check if personal workspace already exists
  SELECT w.id INTO v_workspace_id
  FROM workspaces w
  WHERE w.owner_id = p_user_id AND w.is_personal = TRUE
  LIMIT 1;

  IF v_workspace_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM workspace_members
      WHERE workspace_id = v_workspace_id AND user_id = p_user_id
    ) INTO v_member_exists;

    IF NOT v_member_exists THEN
      INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
      VALUES (gen_random_uuid(), v_workspace_id, p_user_id, 'owner', NOW());
    END IF;

    RETURN v_workspace_id;
  END IF;

  -- Get user name for workspace title
  SELECT COALESCE(raw_user_meta_data->>'full_name', email)
  INTO v_user_name
  FROM auth.users WHERE id = p_user_id;

  v_workspace_id := gen_random_uuid();

  INSERT INTO workspaces (
    id, name, slug, owner_id, plan, is_personal, settings,
    plan_type, credits_balance, paid_credits_balance, monthly_credits, credits_reset_at,
    created_at, updated_at
  )
  VALUES (
    v_workspace_id,
    COALESCE(v_user_name, 'My Workspace') || '''s Workspace',
    'personal-' || REPLACE(p_user_id::TEXT, '-', ''),
    p_user_id,
    'team',
    TRUE,
    '{"maxMembers": 5, "maxAgents": 20, "maxCreditsPerMonth": 5000, "allowMemberAgentCreation": true, "requireApprovalForAgentRuns": false, "sharedCreditsPool": true, "auditLogRetentionDays": 30}'::JSONB,
    'free',
    300,
    0,
    300,
    NOW(),
    NOW(),
    NOW()
  );

  INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
  VALUES (gen_random_uuid(), v_workspace_id, p_user_id, 'owner', NOW());

  RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
