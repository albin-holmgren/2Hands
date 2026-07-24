-- ============================================================================
-- v3 Slice 2 — Core trust domain
-- Durable tasks, steps, append-only safe events, exact approvals,
-- immutable action receipts, artifacts, policy profiles, capability grants,
-- usage reservations.
--
-- Additive only. Extends the legacy `tasks` table; adds new canonical tables.
-- Contracts: docs/v3/IMPLEMENTATION_MAP.md §3 (frozen names).
-- ============================================================================

-- ============================================================================
-- 1. EXTEND legacy tasks table to the canonical v3 task spine
-- ============================================================================

-- Legacy rows are agent-bound; v3 tasks are workspace/user-scoped and an agent
-- is optional. Making agent_id nullable is additive-safe.
ALTER TABLE public.tasks ALTER COLUMN agent_id DROP NOT NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goal TEXT,
  ADD COLUMN IF NOT EXISTS normalized_intent TEXT,
  ADD COLUMN IF NOT EXISTS plan JSONB,
  ADD COLUMN IF NOT EXISTS policy_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS waiting_reason TEXT
    CHECK (waiting_reason IS NULL OR waiting_reason IN ('authentication', 'approval', 'verification', 'external_event')),
  ADD COLUMN IF NOT EXISTS waiting_resource_id UUID,
  ADD COLUMN IF NOT EXISTS usage_reservation_id UUID,
  ADD COLUMN IF NOT EXISTS receipt_id UUID,
  ADD COLUMN IF NOT EXISTS safe_error JSONB,
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Widen the status CHECK to the superset of legacy + canonical v3 states.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK (status IN (
  -- legacy states (preserved)
  'pending', 'in_progress',
  -- canonical v3 states
  'draft', 'planning', 'awaiting_auth', 'awaiting_approval', 'queued',
  'running', 'verifying', 'completed', 'failed', 'cancelled'
));

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_created ON public.tasks(workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status ON public.tasks(workspace_id, status)
  WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_conversation ON public.tasks(conversation_id)
  WHERE conversation_id IS NOT NULL;

-- ============================================================================
-- 2. Shared trigger helpers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.v3_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Append-only guard. RLS alone is insufficient (service role bypasses RLS);
-- triggers fire for every role.
CREATE OR REPLACE FUNCTION public.v3_forbid_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_touch_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_touch_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

-- ============================================================================
-- 3. task_steps
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  index INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'waiting', 'completed', 'failed', 'skipped', 'cancelled')),
  risk_class TEXT NOT NULL DEFAULT 'r0_read'
    CHECK (risk_class IN ('r0_read', 'r1_reversible', 'r2_external_write', 'r3_high_impact', 'r4_blocked')),
  -- Side-effect outcome tracking for external writes; distinct from task states.
  side_effect_state TEXT
    CHECK (side_effect_state IS NULL OR side_effect_state IN
      ('none', 'pending', 'waiting_external', 'confirmed', 'failed_unknown_outcome')),
  idempotency_key TEXT,
  provider_request_ref TEXT,
  approval_id UUID,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, index)
);

-- Exactly-once external actions: one idempotency key per workspace.
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_steps_idempotency
  ON public.task_steps(workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_steps_task ON public.task_steps(task_id, index);

DROP TRIGGER IF EXISTS trg_task_steps_touch_updated_at ON public.task_steps;
CREATE TRIGGER trg_task_steps_touch_updated_at
  BEFORE UPDATE ON public.task_steps
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

-- ============================================================================
-- 4. task_events — append-only normalized safe event stream
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL DEFAULT 1,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID,
  run_id TEXT,
  type TEXT NOT NULL,
  sequence BIGINT NOT NULL,
  actor_kind TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_kind IN ('user', '2hands', 'agent', 'connector', 'system')),
  actor_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (task_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_seq ON public.task_events(task_id, sequence);
CREATE INDEX IF NOT EXISTS idx_task_events_workspace_time ON public.task_events(workspace_id, occurred_at DESC);

DROP TRIGGER IF EXISTS trg_task_events_append_only ON public.task_events;
CREATE TRIGGER trg_task_events_append_only
  BEFORE UPDATE OR DELETE ON public.task_events
  FOR EACH ROW EXECUTE FUNCTION public.v3_forbid_mutation();

-- ============================================================================
-- 5. approvals — exact, hash-bound, single-use
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  step_id UUID REFERENCES public.task_steps(id) ON DELETE SET NULL,
  risk_class TEXT NOT NULL
    CHECK (risk_class IN ('r0_read', 'r1_reversible', 'r2_external_write', 'r3_high_impact', 'r4_blocked')),
  category TEXT
    CHECK (category IS NULL OR category IN
      ('external_communication', 'publication', 'financial', 'account_security', 'destructive', 'legal')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  -- The canonical exact action. This object is what the hash covers.
  canonical_action JSONB NOT NULL,
  canonical_action_hash TEXT NOT NULL,
  reversibility TEXT NOT NULL DEFAULT 'irreversible'
    CHECK (reversibility IN ('reversible', 'partially_reversible', 'irreversible')),
  estimated_max_cost_credits NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'cancelled', 'consumed')),
  challenge TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  responded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  response_idempotency_key TEXT,
  consumed_at TIMESTAMPTZ,
  consumed_by_receipt_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_workspace_status ON public.approvals(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_task ON public.approvals(task_id) WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_response_idempotency
  ON public.approvals(workspace_id, response_idempotency_key)
  WHERE response_idempotency_key IS NOT NULL;

-- Guard: the canonical action is immutable; terminal statuses are final.
CREATE OR REPLACE FUNCTION public.v3_approvals_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.canonical_action IS DISTINCT FROM OLD.canonical_action
     OR NEW.canonical_action_hash IS DISTINCT FROM OLD.canonical_action_hash
     OR NEW.challenge IS DISTINCT FROM OLD.challenge
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'approvals: canonical action, hash, challenge, and workspace are immutable';
  END IF;
  -- Legal status moves only:
  --   pending  -> approved | denied | expired | cancelled
  --   approved -> consumed | expired | cancelled
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('approved', 'denied', 'expired', 'cancelled')) OR
      (OLD.status = 'approved' AND NEW.status IN ('consumed', 'expired', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'approvals: illegal status transition % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_approvals_guard ON public.approvals;
CREATE TRIGGER trg_approvals_guard
  BEFORE UPDATE ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.v3_approvals_guard();

DROP TRIGGER IF EXISTS trg_approvals_touch_updated_at ON public.approvals;
CREATE TRIGGER trg_approvals_touch_updated_at
  BEFORE UPDATE ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

-- ============================================================================
-- 6. action_receipts — immutable receipts with provenance and evidence
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.action_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  step_id UUID REFERENCES public.task_steps(id) ON DELETE SET NULL,
  approval_id UUID REFERENCES public.approvals(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  -- Safe evidence refs only: [{ kind, ref, label? }]. Never secret values.
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider TEXT,
  provider_request_ref TEXT,
  idempotency_key TEXT,
  usage JSONB,
  outcome TEXT NOT NULL DEFAULT 'success'
    CHECK (outcome IN ('success', 'denied', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_receipts_workspace ON public.action_receipts(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_receipts_task ON public.action_receipts(task_id) WHERE task_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_action_receipts_append_only ON public.action_receipts;
CREATE TRIGGER trg_action_receipts_append_only
  BEFORE UPDATE OR DELETE ON public.action_receipts
  FOR EACH ROW EXECUTE FUNCTION public.v3_forbid_mutation();

-- ============================================================================
-- 7. artifacts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('diff', 'file', 'log', 'test_report', 'preview', 'screenshot', 'document', 'link')),
  title TEXT NOT NULL,
  storage_ref TEXT,
  url TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_workspace ON public.artifacts(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_task ON public.artifacts(task_id) WHERE task_id IS NOT NULL;

-- ============================================================================
-- 8. policy_profiles and capability_grants
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.policy_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  -- Risk-class handling, auto-approval categories, spending ceilings, etc.
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

DROP TRIGGER IF EXISTS trg_policy_profiles_touch_updated_at ON public.policy_profiles;
CREATE TRIGGER trg_policy_profiles_touch_updated_at
  BEFORE UPDATE ON public.policy_profiles
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.capability_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  provider_account_id UUID,
  mode TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capability_grants_workspace ON public.capability_grants(workspace_id, provider_id, capability);
CREATE INDEX IF NOT EXISTS idx_capability_grants_task ON public.capability_grants(task_id) WHERE task_id IS NOT NULL;

-- ============================================================================
-- 9. usage_reservations — reserve before expensive work, settle after
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.usage_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  estimated_credits NUMERIC NOT NULL DEFAULT 0,
  reserved_credits NUMERIC NOT NULL DEFAULT 0,
  settled_credits NUMERIC,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'settled', 'released', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_usage_reservations_workspace ON public.usage_reservations(workspace_id, status);

-- ============================================================================
-- 10. RLS — members read their workspace rows; all writes are privileged
-- ============================================================================

ALTER TABLE public.task_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capability_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_reservations ENABLE ROW LEVEL SECURITY;

-- Members can read rows in their workspace. No INSERT/UPDATE/DELETE policies
-- for authenticated: ordinary clients cannot mint approvals, receipts,
-- transitions, grants, or settlements. Privileged server code (service role)
-- uses the bounded RPCs below.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'task_steps', 'task_events', 'approvals', 'action_receipts',
    'artifacts', 'policy_profiles', 'capability_grants', 'usage_reservations'
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

-- Workspace-scoped v3 task rows: members may read. (Legacy per-user policies
-- on tasks remain in force for legacy rows.)
DROP POLICY IF EXISTS "Members can view workspace tasks" ON public.tasks;
CREATE POLICY "Members can view workspace tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND user_belongs_to_workspace(auth.uid(), workspace_id));

-- ============================================================================
-- 11. Bounded privileged functions
-- ============================================================================

-- Legal task transitions (canonical matrix; awaiting_* re-enterable).
CREATE OR REPLACE FUNCTION public.v3_is_legal_task_transition(p_from TEXT, p_to TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_from
    WHEN 'draft' THEN p_to IN ('planning', 'cancelled')
    WHEN 'planning' THEN p_to IN ('awaiting_auth', 'awaiting_approval', 'queued', 'failed', 'cancelled')
    WHEN 'awaiting_auth' THEN p_to IN ('planning', 'queued', 'running', 'failed', 'cancelled')
    WHEN 'awaiting_approval' THEN p_to IN ('planning', 'queued', 'running', 'failed', 'cancelled')
    WHEN 'queued' THEN p_to IN ('running', 'awaiting_auth', 'awaiting_approval', 'failed', 'cancelled')
    WHEN 'running' THEN p_to IN ('verifying', 'awaiting_auth', 'awaiting_approval', 'queued', 'failed', 'cancelled')
    WHEN 'verifying' THEN p_to IN ('completed', 'running', 'awaiting_approval', 'failed', 'cancelled')
    ELSE FALSE
  END;
$$;

-- Append one event with a monotonic per-task sequence. Locks the task row so
-- concurrent appenders serialize; UNIQUE(task_id, sequence) backstops.
CREATE OR REPLACE FUNCTION public.v3_append_task_event(
  p_task_id UUID,
  p_type TEXT,
  p_actor_kind TEXT DEFAULT 'system',
  p_actor_id TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_conversation_id UUID DEFAULT NULL,
  p_run_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_seq BIGINT;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM tasks WHERE id = p_task_id FOR UPDATE;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'v3_append_task_event: task % not found or has no workspace', p_task_id;
  END IF;

  SELECT COALESCE(MAX(sequence), 0) + 1 INTO v_seq
  FROM task_events WHERE task_id = p_task_id;

  INSERT INTO task_events (task_id, workspace_id, conversation_id, run_id, type, sequence, actor_kind, actor_id, payload)
  VALUES (p_task_id, v_workspace_id, p_conversation_id, p_run_id, p_type, v_seq, p_actor_kind, p_actor_id, COALESCE(p_payload, '{}'::jsonb));

  RETURN v_seq;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_append_task_event FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_append_task_event TO service_role;

-- Server-validated task transition. Fails closed on illegal or stale moves;
-- appends the corresponding event atomically.
CREATE OR REPLACE FUNCTION public.v3_transition_task(
  p_task_id UUID,
  p_expected_status TEXT,
  p_new_status TEXT,
  p_actor_kind TEXT DEFAULT 'system',
  p_actor_id TEXT DEFAULT NULL,
  p_event_type TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (task_id UUID, old_status TEXT, new_status TEXT, event_sequence BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current TEXT;
  v_seq BIGINT;
BEGIN
  SELECT status INTO v_current FROM tasks WHERE id = p_task_id FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'v3_transition_task: task % not found', p_task_id;
  END IF;
  IF v_current IS DISTINCT FROM p_expected_status THEN
    -- Note: deliberately NOT SQLSTATE 40001 — PostgREST auto-retries
    -- serialization_failure, which would hang deliberate stale rejections.
    RAISE EXCEPTION 'v3_transition_task: stale transition for %: expected %, found %',
      p_task_id, p_expected_status, v_current;
  END IF;
  IF NOT v3_is_legal_task_transition(v_current, p_new_status) THEN
    RAISE EXCEPTION 'v3_transition_task: illegal transition % -> % for task %',
      v_current, p_new_status, p_task_id;
  END IF;

  UPDATE tasks
  SET status = p_new_status,
      waiting_reason = CASE
        WHEN p_new_status = 'awaiting_auth' THEN 'authentication'
        WHEN p_new_status = 'awaiting_approval' THEN 'approval'
        ELSE NULL
      END,
      waiting_resource_id = CASE
        WHEN p_new_status IN ('awaiting_auth', 'awaiting_approval')
        THEN NULLIF(p_payload->>'resourceId', '')::uuid
        ELSE NULL
      END,
      completed_at = CASE WHEN p_new_status IN ('completed', 'failed', 'cancelled') THEN NOW() ELSE completed_at END,
      safe_error = CASE WHEN p_new_status = 'failed' THEN COALESCE(p_payload->'safeError', safe_error) ELSE safe_error END
  WHERE id = p_task_id;

  v_seq := v3_append_task_event(
    p_task_id,
    COALESCE(p_event_type,
      CASE p_new_status
        WHEN 'completed' THEN 'task.completed'
        WHEN 'failed' THEN 'task.failed'
        WHEN 'cancelled' THEN 'task.cancelled'
        WHEN 'awaiting_auth' THEN 'task.waiting'
        WHEN 'awaiting_approval' THEN 'task.waiting'
        WHEN 'running' THEN 'task.resumed'
        ELSE 'task.plan.updated'
      END),
    p_actor_kind, p_actor_id, p_payload);

  RETURN QUERY SELECT p_task_id, v_current, p_new_status, v_seq;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_transition_task FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_transition_task TO service_role;

-- Respond to an approval: challenge + exact hash + idempotency, single use.
CREATE OR REPLACE FUNCTION public.v3_respond_approval(
  p_approval_id UUID,
  p_challenge TEXT,
  p_action_hash TEXT,
  p_response TEXT,            -- 'approved' | 'denied'
  p_user_id UUID,
  p_idempotency_key TEXT
)
RETURNS TABLE (approval_id UUID, status TEXT, responded_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row approvals%ROWTYPE;
BEGIN
  IF p_response NOT IN ('approved', 'denied') THEN
    RAISE EXCEPTION 'v3_respond_approval: invalid response %', p_response;
  END IF;

  SELECT * INTO v_row FROM approvals a WHERE a.id = p_approval_id FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'v3_respond_approval: approval % not found', p_approval_id;
  END IF;

  -- Idempotent replay of the same response returns current state.
  IF v_row.response_idempotency_key IS NOT NULL
     AND v_row.response_idempotency_key = p_idempotency_key THEN
    RETURN QUERY SELECT v_row.id, v_row.status, v_row.responded_at;
    RETURN;
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'v3_respond_approval: approval % is % — not pending', p_approval_id, v_row.status;
  END IF;
  IF v_row.expires_at <= NOW() THEN
    UPDATE approvals SET status = 'expired' WHERE id = p_approval_id;
    RAISE EXCEPTION 'v3_respond_approval: approval % expired', p_approval_id;
  END IF;
  IF v_row.challenge IS DISTINCT FROM p_challenge THEN
    RAISE EXCEPTION 'v3_respond_approval: challenge mismatch for %', p_approval_id;
  END IF;
  -- Exactness: the responder must be answering the payload the server holds.
  IF v_row.canonical_action_hash IS DISTINCT FROM p_action_hash THEN
    RAISE EXCEPTION 'v3_respond_approval: canonical action hash mismatch for % — payload changed', p_approval_id;
  END IF;
  IF NOT user_belongs_to_workspace(p_user_id, v_row.workspace_id) THEN
    RAISE EXCEPTION 'v3_respond_approval: user % is not a member of workspace %', p_user_id, v_row.workspace_id;
  END IF;

  UPDATE approvals
  SET status = p_response,
      responded_by = p_user_id,
      responded_at = NOW(),
      response_idempotency_key = p_idempotency_key
  WHERE id = p_approval_id;

  RETURN QUERY SELECT p_approval_id, p_response, NOW()::timestamptz;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_respond_approval FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_respond_approval TO service_role;

-- Consume an approved approval exactly once (before executing the action).
CREATE OR REPLACE FUNCTION public.v3_consume_approval(
  p_approval_id UUID,
  p_action_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE approvals
  SET status = 'consumed', consumed_at = NOW()
  WHERE id = p_approval_id
    AND status = 'approved'
    AND canonical_action_hash = p_action_hash
    AND expires_at > NOW();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_consume_approval FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_consume_approval TO service_role;

-- Expire overdue approvals (cron-safe, idempotent).
CREATE OR REPLACE FUNCTION public.v3_expire_approvals()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE approvals SET status = 'expired'
  WHERE status = 'pending' AND expires_at <= NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_expire_approvals FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_expire_approvals TO service_role;
