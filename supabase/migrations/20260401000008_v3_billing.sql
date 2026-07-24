-- ============================================================================
-- v3 Slice 8 — Billing: plans, weekly credits, ledgers, reservation/settlement,
-- spending mandates, external subscriptions.
--
-- Tables: subscriptions, credit_grants, usage_events (append-only),
-- credit_ledger (append-only), spending_mandates, external_subscriptions,
-- external_subscription_events (append-only), external_receipts (append-only).
--
-- RPCs: v3_reserve_credits, v3_settle_reservation, v3_grant_weekly_credits.
--
-- Credit model (dual-run, per IMPLEMENTATION_MAP §4 credits cutover):
--   * workspaces.credits_balance stays the authoritative enforcement balance
--     (it already includes paid credits — add_paid_workspace_credits increments
--     both credits_balance and paid_credits_balance; the legacy daily reset
--     sets credits_balance = 300 + paid_credits_balance and is untouched).
--   * credit_ledger is the immutable v3 record: balance_after is the strict
--     running sum of credits_delta (starting at 0), so SUM(credits_delta)
--     always equals the latest balance_after. Entitlement reads are
--     ledger-derived; enforcement (insufficient_credits) uses the workspace
--     balance so the legacy reservation system keeps working.
-- ============================================================================

-- ============================================================================
-- 1. subscriptions — one row per workspace; Free = no row (or plan_id 'free')
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'free'
    CHECK (plan_id IN ('free', 'pro', 'pro_5x', 'pro_20x')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'incomplete')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_workspace
  ON public.subscriptions(workspace_id);

DROP TRIGGER IF EXISTS trg_subscriptions_touch ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_touch
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

-- ============================================================================
-- 2. credit_grants — weekly/signup/topup/adjustment grants.
--    granted_week is a stored generated column (UTC ISO week start) so the
--    weekly grant can be made idempotent with a unique partial index.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'free'
    CHECK (plan_id IN ('free', 'pro', 'pro_5x', 'pro_20x')),
  credits NUMERIC NOT NULL CHECK (credits >= 0),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_week DATE GENERATED ALWAYS AS
    (date_trunc('week', granted_at AT TIME ZONE 'UTC')::date) STORED,
  expires_at TIMESTAMPTZ,
  source TEXT NOT NULL
    CHECK (source IN ('weekly', 'signup', 'topup', 'adjustment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_grants_workspace
  ON public.credit_grants(workspace_id, granted_at DESC);

-- Idempotency: at most one weekly grant per workspace per ISO week.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_grants_weekly_once
  ON public.credit_grants(workspace_id, source, granted_week)
  WHERE source = 'weekly';

-- ============================================================================
-- 3. usage_events — append-only usage record (credits + provider cost).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES public.usage_reservations(id) ON DELETE SET NULL,
  category TEXT NOT NULL
    CHECK (category IN (
      'model_tokens', 'speech', 'browser_time', 'active_compute',
      'storage', 'network_egress', 'premium_tool', 'retry',
      'external_subscription'
    )),
  credits NUMERIC NOT NULL DEFAULT 0,
  provider_cost_micros BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_workspace
  ON public.usage_events(workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_usage_events_append_only ON public.usage_events;
CREATE TRIGGER trg_usage_events_append_only
  BEFORE UPDATE OR DELETE ON public.usage_events
  FOR EACH ROW EXECUTE FUNCTION public.v3_forbid_mutation();

REVOKE UPDATE, DELETE ON public.usage_events FROM anon, authenticated, service_role;

-- ============================================================================
-- 4. credit_ledger — immutable, strictly ordered running ledger.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq BIGINT GENERATED ALWAYS AS IDENTITY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('grant', 'reserve', 'settle', 'release', 'adjustment')),
  credits_delta NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  ref_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_seq ON public.credit_ledger(seq);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_workspace
  ON public.credit_ledger(workspace_id, seq DESC);

DROP TRIGGER IF EXISTS trg_credit_ledger_append_only ON public.credit_ledger;
CREATE TRIGGER trg_credit_ledger_append_only
  BEFORE UPDATE OR DELETE ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.v3_forbid_mutation();

REVOKE UPDATE, DELETE ON public.credit_ledger FROM anon, authenticated, service_role;

-- ============================================================================
-- 5. spending_mandates — signed permission to spend real money (minor units).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.spending_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  plan_label TEXT,
  currency CHAR(3) NOT NULL,
  max_first_amount_minor BIGINT NOT NULL CHECK (max_first_amount_minor >= 0),
  max_recurring_amount_minor BIGINT NOT NULL CHECK (max_recurring_amount_minor >= 0),
  "interval" TEXT NOT NULL
    CHECK ("interval" IN ('one_time', 'monthly', 'yearly')),
  country_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  payload_hash TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spending_mandates_workspace
  ON public.spending_mandates(workspace_id, created_at DESC);

-- ============================================================================
-- 6. external_subscriptions — subscriptions 2Hands manages on providers,
--    strictly separated from 2Hands' own credit ledger.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.external_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_account_id UUID REFERENCES public.provider_accounts(id) ON DELETE SET NULL,
  plan_label TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL,
  "interval" TEXT NOT NULL
    CHECK ("interval" IN ('one_time', 'monthly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('active', 'cancelled', 'past_due', 'unknown')),
  next_renewal_at TIMESTAMPTZ,
  consent_receipt_id UUID REFERENCES public.consent_receipts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_subscriptions_workspace
  ON public.external_subscriptions(workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_external_subscriptions_touch ON public.external_subscriptions;
CREATE TRIGGER trg_external_subscriptions_touch
  BEFORE UPDATE ON public.external_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

-- ============================================================================
-- 7. external_subscription_events — append-only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.external_subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  external_subscription_id UUID NOT NULL
    REFERENCES public.external_subscriptions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_subscription_events_sub
  ON public.external_subscription_events(external_subscription_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_external_subscription_events_append_only
  ON public.external_subscription_events;
CREATE TRIGGER trg_external_subscription_events_append_only
  BEFORE UPDATE OR DELETE ON public.external_subscription_events
  FOR EACH ROW EXECUTE FUNCTION public.v3_forbid_mutation();

REVOKE UPDATE, DELETE ON public.external_subscription_events
  FROM anon, authenticated, service_role;

-- ============================================================================
-- 8. external_receipts — append-only record of real-money receipts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.external_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  external_subscription_id UUID
    REFERENCES public.external_subscriptions(id) ON DELETE SET NULL,
  provider_id TEXT,
  title TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_receipts_workspace
  ON public.external_receipts(workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_external_receipts_append_only ON public.external_receipts;
CREATE TRIGGER trg_external_receipts_append_only
  BEFORE UPDATE OR DELETE ON public.external_receipts
  FOR EACH ROW EXECUTE FUNCTION public.v3_forbid_mutation();

REVOKE UPDATE, DELETE ON public.external_receipts FROM anon, authenticated, service_role;

-- ============================================================================
-- 9. RLS — members read their workspace rows; all writes are privileged.
-- ============================================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spending_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_receipts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subscriptions', 'credit_grants', 'usage_events', 'credit_ledger',
    'spending_mandates', 'external_subscriptions',
    'external_subscription_events', 'external_receipts'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Members can view workspace %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Members can view workspace %s" ON public.%I FOR SELECT TO authenticated
         USING (user_belongs_to_workspace(auth.uid(), workspace_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Service role full access %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Service role full access %s" ON public.%I FOR ALL TO service_role
         USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- 10. Ledger helper — append a row with a consistent running balance.
--     balance_after = previous balance_after (else 0) + credits_delta,
--     so SUM(credits_delta) over a workspace always equals the latest
--     balance_after. Internal only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.v3_append_credit_ledger(
  p_workspace_id UUID,
  p_entry_type TEXT,
  p_delta NUMERIC,
  p_ref_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev NUMERIC;
  v_after NUMERIC;
BEGIN
  SELECT balance_after INTO v_prev
  FROM public.credit_ledger
  WHERE workspace_id = p_workspace_id
  ORDER BY seq DESC
  LIMIT 1;

  v_after := COALESCE(v_prev, 0) + p_delta;

  INSERT INTO public.credit_ledger (workspace_id, entry_type, credits_delta, balance_after, ref_id)
  VALUES (p_workspace_id, p_entry_type, p_delta, v_after, p_ref_id);

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_append_credit_ledger FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_append_credit_ledger TO service_role;

-- ============================================================================
-- 11. v3_reserve_credits — estimate → reserve maximum.
--     Enforcement balance is workspaces.credits_balance (includes paid);
--     the reservation deducts it up front, settlement refunds the unused part.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.v3_reserve_credits(
  p_workspace_id UUID,
  p_task_id UUID,
  p_estimated NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
  v_reservation_id UUID;
BEGIN
  IF p_estimated IS NULL OR p_estimated <= 0 THEN
    RAISE EXCEPTION 'v3_reserve_credits: estimated credits must be > 0';
  END IF;

  SELECT credits_balance INTO v_balance
  FROM public.workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'v3_reserve_credits: workspace % not found', p_workspace_id;
  END IF;

  IF COALESCE(v_balance, 0) < p_estimated THEN
    RAISE EXCEPTION 'insufficient_credits: available % < estimated %',
      COALESCE(v_balance, 0), p_estimated;
  END IF;

  INSERT INTO public.usage_reservations
    (workspace_id, task_id, estimated_credits, reserved_credits, status)
  VALUES (p_workspace_id, p_task_id, p_estimated, p_estimated, 'reserved')
  RETURNING id INTO v_reservation_id;

  UPDATE public.workspaces
  SET credits_balance = credits_balance - p_estimated,
      updated_at = NOW()
  WHERE id = p_workspace_id;

  PERFORM public.v3_append_credit_ledger(
    p_workspace_id, 'reserve', -p_estimated, v_reservation_id);

  RETURN v_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_reserve_credits FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_reserve_credits TO service_role;

-- ============================================================================
-- 12. v3_settle_reservation — measure → settle → refund the unused delta.
--     The settle ledger row's credits_delta is the refund
--     (reserved - actual); net ledger effect of reserve+settle = -actual.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.v3_settle_reservation(
  p_reservation_id UUID,
  p_actual NUMERIC
)
RETURNS TABLE(reservation_id UUID, settled_credits NUMERIC, refunded_credits NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.usage_reservations%ROWTYPE;
  v_refund NUMERIC;
BEGIN
  IF p_actual IS NULL OR p_actual < 0 THEN
    RAISE EXCEPTION 'v3_settle_reservation: actual credits must be >= 0';
  END IF;

  SELECT * INTO v_row
  FROM public.usage_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'v3_settle_reservation: reservation % not found', p_reservation_id;
  END IF;

  IF v_row.status <> 'reserved' THEN
    RAISE EXCEPTION 'v3_settle_reservation: reservation % is % — already finalized',
      p_reservation_id, v_row.status;
  END IF;

  v_refund := v_row.reserved_credits - p_actual;

  -- Lock workspace, refund (or charge overage) against the enforcement balance.
  PERFORM 1 FROM public.workspaces WHERE id = v_row.workspace_id FOR UPDATE;
  UPDATE public.workspaces
  SET credits_balance = GREATEST(0, credits_balance + v_refund),
      updated_at = NOW()
  WHERE id = v_row.workspace_id;

  UPDATE public.usage_reservations
  SET settled_credits = p_actual,
      status = 'settled',
      settled_at = NOW()
  WHERE id = p_reservation_id;

  PERFORM public.v3_append_credit_ledger(
    v_row.workspace_id, 'settle', v_refund, p_reservation_id);

  RETURN QUERY SELECT p_reservation_id, p_actual, v_refund;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_settle_reservation FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_settle_reservation TO service_role;

-- ============================================================================
-- 13. v3_grant_weekly_credits — idempotent per UTC ISO week per workspace.
--     Plan comes from the workspace's subscription row (active/trialing),
--     Free otherwise. Weekly credits per PLAN_CONFIGS: 50/500/2500/10000.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.v3_grant_weekly_credits(
  p_workspace_id UUID
)
RETURNS TABLE(granted BOOLEAN, grant_id UUID, credits NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT := 'free';
  v_credits NUMERIC;
  v_grant_id UUID;
BEGIN
  PERFORM 1 FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'v3_grant_weekly_credits: workspace % not found', p_workspace_id;
  END IF;

  SELECT s.plan_id INTO v_plan
  FROM public.subscriptions s
  WHERE s.workspace_id = p_workspace_id
    AND s.status IN ('active', 'trialing')
  ORDER BY s.created_at DESC
  LIMIT 1;
  v_plan := COALESCE(v_plan, 'free');

  v_credits := CASE v_plan
    WHEN 'pro' THEN 500
    WHEN 'pro_5x' THEN 2500
    WHEN 'pro_20x' THEN 10000
    ELSE 50
  END;

  INSERT INTO public.credit_grants (workspace_id, plan_id, credits, source)
  VALUES (p_workspace_id, v_plan, v_credits, 'weekly')
  ON CONFLICT (workspace_id, source, granted_week) WHERE source = 'weekly'
  DO NOTHING
  RETURNING id INTO v_grant_id;

  IF v_grant_id IS NULL THEN
    -- Already granted this ISO week — idempotent no-op.
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC;
    RETURN;
  END IF;

  UPDATE public.workspaces
  SET credits_balance = credits_balance + v_credits,
      updated_at = NOW()
  WHERE id = p_workspace_id;

  PERFORM public.v3_append_credit_ledger(p_workspace_id, 'grant', v_credits, v_grant_id);

  RETURN QUERY SELECT TRUE, v_grant_id, v_credits;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_grant_weekly_credits FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_grant_weekly_credits TO service_role;
