-- ============================================================================
-- v3 Slice 5 — Managed 2Hands Computer
--
-- computers (persistent logical computer; merges the doc's computers +
-- computer_workspaces concepts — one row per logical computer, documented
-- deviation), computer_sessions, computer_runs, computer_events (append-only),
-- computer_checkpoints, environment_blueprints, preview_endpoints,
-- workspace_write_leases (one writer per worktree).
--
-- Contracts: specs/computer-provider.types.ts (frozen).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.computers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_workspace_ref TEXT,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'creating'
    CHECK (state IN ('creating', 'stopped', 'starting', 'ready', 'stopping', 'failed', 'deleting', 'deleted')),
  image_ref TEXT NOT NULL,
  blueprint_version INTEGER NOT NULL DEFAULT 1,
  repository_ref TEXT,
  storage_bytes BIGINT,
  last_checkpoint_id UUID,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_computers_workspace ON public.computers(workspace_id, state);

DROP TRIGGER IF EXISTS trg_computers_touch ON public.computers;
CREATE TRIGGER trg_computers_touch
  BEFORE UPDATE ON public.computers
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.computer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computer_id UUID NOT NULL REFERENCES public.computers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  provider_session_ref TEXT,
  state TEXT NOT NULL DEFAULT 'starting'
    CHECK (state IN ('starting', 'ready', 'stopping', 'stopped', 'failed', 'expired', 'unknown')),
  network_policy_id TEXT NOT NULL DEFAULT 'deny_default',
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  last_heartbeat_at TIMESTAMPTZ,
  active_cpu_ms BIGINT,
  memory_gb_ms BIGINT,
  network_ingress_bytes BIGINT,
  network_egress_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_computer_sessions_computer ON public.computer_sessions(computer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_computer_sessions_active ON public.computer_sessions(state)
  WHERE state IN ('starting', 'ready');

DROP TRIGGER IF EXISTS trg_computer_sessions_touch ON public.computer_sessions;
CREATE TRIGGER trg_computer_sessions_touch
  BEFORE UPDATE ON public.computer_sessions
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

-- Bounded runner jobs (one lease each).
CREATE TABLE IF NOT EXISTS public.computer_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.computer_sessions(id) ON DELETE CASCADE,
  computer_id UUID NOT NULL REFERENCES public.computers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  lease_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'command'
    CHECK (kind IN ('command', 'agent', 'test', 'build', 'checkpoint', 'preview', 'publication')),
  agent TEXT,
  agent_role TEXT CHECK (agent_role IS NULL OR agent_role IN ('implementer', 'reviewer', 'verifier')),
  worktree_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
  exit_code INTEGER,
  safe_output_ref TEXT,
  redactions_applied INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_computer_runs_idempotency
  ON public.computer_runs(workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_computer_runs_session ON public.computer_runs(session_id, created_at);

DROP TRIGGER IF EXISTS trg_computer_runs_touch ON public.computer_runs;
CREATE TRIGGER trg_computer_runs_touch
  BEFORE UPDATE ON public.computer_runs
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.computer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computer_id UUID NOT NULL REFERENCES public.computers(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.computer_sessions(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.computer_runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  sequence BIGINT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (computer_id, sequence)
);

DROP TRIGGER IF EXISTS trg_computer_events_append_only ON public.computer_events;
CREATE TRIGGER trg_computer_events_append_only
  BEFORE UPDATE OR DELETE ON public.computer_events
  FOR EACH ROW EXECUTE FUNCTION public.v3_forbid_mutation();

CREATE OR REPLACE FUNCTION public.v3_append_computer_event(
  p_computer_id UUID,
  p_type TEXT,
  p_session_id UUID DEFAULT NULL,
  p_run_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
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
  SELECT workspace_id INTO v_workspace_id FROM computers WHERE id = p_computer_id FOR UPDATE;
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'v3_append_computer_event: computer % not found', p_computer_id;
  END IF;
  SELECT COALESCE(MAX(sequence), 0) + 1 INTO v_seq FROM computer_events WHERE computer_id = p_computer_id;
  INSERT INTO computer_events (computer_id, session_id, run_id, workspace_id, type, sequence, payload)
  VALUES (p_computer_id, p_session_id, p_run_id, v_workspace_id, p_type, v_seq, COALESCE(p_payload, '{}'::jsonb));
  RETURN v_seq;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_append_computer_event FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_append_computer_event TO service_role;

CREATE TABLE IF NOT EXISTS public.computer_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computer_id UUID NOT NULL REFERENCES public.computers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.computer_sessions(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  provider_checkpoint_ref TEXT,
  storage_ref TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_computer_checkpoints_computer
  ON public.computer_checkpoints(computer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.environment_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computer_id UUID NOT NULL REFERENCES public.computers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  -- EnvironmentBlueprint document (specs shape); never credentials.
  blueprint JSONB NOT NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (computer_id, version)
);

CREATE TABLE IF NOT EXISTS public.preview_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.computer_sessions(id) ON DELETE CASCADE,
  computer_id UUID NOT NULL REFERENCES public.computers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  port INTEGER NOT NULL,
  -- Signed, expiring, user-bound access token for the authenticated proxy.
  access_token_hash TEXT NOT NULL,
  url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One writer lease per worktree: partial unique index enforces single active
-- writer per (computer, worktree).
CREATE TABLE IF NOT EXISTS public.workspace_write_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computer_id UUID NOT NULL REFERENCES public.computers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.computer_sessions(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.computer_runs(id) ON DELETE CASCADE,
  worktree_path TEXT NOT NULL,
  holder TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'write' CHECK (mode IN ('write', 'read')),
  released_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_write_leases_single_writer
  ON public.workspace_write_leases(computer_id, worktree_path)
  WHERE mode = 'write' AND released_at IS NULL;

-- Acquire a write lease atomically; returns lease id or raises when held.
CREATE OR REPLACE FUNCTION public.v3_acquire_write_lease(
  p_computer_id UUID,
  p_worktree_path TEXT,
  p_holder TEXT,
  p_session_id UUID DEFAULT NULL,
  p_run_id UUID DEFAULT NULL,
  p_ttl_seconds INTEGER DEFAULT 3600
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM computers WHERE id = p_computer_id;
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'v3_acquire_write_lease: computer % not found', p_computer_id;
  END IF;

  -- Expire stale leases first (crash recovery).
  UPDATE workspace_write_leases
  SET released_at = NOW()
  WHERE computer_id = p_computer_id AND worktree_path = p_worktree_path
    AND mode = 'write' AND released_at IS NULL AND expires_at <= NOW();

  BEGIN
    INSERT INTO workspace_write_leases
      (computer_id, workspace_id, session_id, run_id, worktree_path, holder, mode, expires_at)
    VALUES
      (p_computer_id, v_workspace_id, p_session_id, p_run_id, p_worktree_path, p_holder, 'write',
       NOW() + make_interval(secs => p_ttl_seconds))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'v3_acquire_write_lease: worktree % already has an active writer', p_worktree_path;
  END;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_acquire_write_lease FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_acquire_write_lease TO service_role;

CREATE OR REPLACE FUNCTION public.v3_release_write_lease(p_lease_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE workspace_write_leases SET released_at = NOW()
  WHERE id = p_lease_id AND released_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_release_write_lease FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_release_write_lease TO service_role;

-- RLS: members read; privileged writes only.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'computers', 'computer_sessions', 'computer_runs', 'computer_events',
    'computer_checkpoints', 'environment_blueprints', 'preview_endpoints',
    'workspace_write_leases'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
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
