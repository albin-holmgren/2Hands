-- Migration: Agent run queue + canonical run event stream
-- Introduces durable queued runs and append-only event timeline per run

-- ============================================
-- 1. AGENT RUNS
-- ============================================
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL UNIQUE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  task_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'claimed', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
  attempt INTEGER NOT NULL DEFAULT 0,
  worker_id TEXT,
  error_message TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status_queued_at ON agent_runs(status, queued_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_created ON agent_runs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created ON agent_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_running_started ON agent_runs(started_at)
  WHERE status IN ('running', 'claimed');

-- ============================================
-- 2. AGENT RUN EVENTS (canonical stream)
-- ============================================
CREATE TABLE IF NOT EXISTS agent_run_events (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  event TEXT,
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_seq ON agent_run_events(run_id, seq);
CREATE INDEX IF NOT EXISTS idx_agent_run_events_agent_created ON agent_run_events(agent_id, created_at DESC);

-- ============================================
-- 3. RLS POLICIES
-- ============================================
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_run_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own agent runs" ON agent_runs;
CREATE POLICY "Users can view own agent runs"
  ON agent_runs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access to agent runs" ON agent_runs;
CREATE POLICY "Service role full access to agent runs"
  ON agent_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own agent run events" ON agent_run_events;
CREATE POLICY "Users can view own agent run events"
  ON agent_run_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access to agent run events" ON agent_run_events;
CREATE POLICY "Service role full access to agent run events"
  ON agent_run_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 4. HELPER FUNCTIONS
-- ============================================

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION update_agent_runs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_agent_runs_updated_at ON agent_runs;
CREATE TRIGGER trg_update_agent_runs_updated_at
  BEFORE UPDATE ON agent_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_runs_updated_at();

-- Atomically claim queued runs for a worker
CREATE OR REPLACE FUNCTION claim_queued_agent_runs(
  p_worker_id TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(
  run_id TEXT,
  agent_id UUID,
  user_id UUID,
  trigger_type TEXT,
  task_description TEXT,
  attempt INTEGER,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT r.id
    FROM agent_runs r
    WHERE r.status = 'queued'
    ORDER BY r.queued_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),
  claimed AS (
    UPDATE agent_runs r
    SET status = 'claimed',
        worker_id = p_worker_id,
        claimed_at = now(),
        attempt = r.attempt + 1
    WHERE r.id IN (SELECT c.id FROM candidate c)
    RETURNING r.*
  )
  SELECT c.run_id, c.agent_id, c.user_id, c.trigger_type, c.task_description, c.attempt, c.metadata
  FROM claimed c;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_queued_agent_runs TO service_role;

-- Append a run event with monotonically increasing sequence per run
CREATE OR REPLACE FUNCTION append_agent_run_event(
  p_run_id TEXT,
  p_agent_id UUID,
  p_user_id UUID,
  p_kind TEXT,
  p_name TEXT,
  p_event TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  SELECT COALESCE(MAX(seq), 0) + 1
  INTO v_seq
  FROM agent_run_events
  WHERE run_id = p_run_id;

  INSERT INTO agent_run_events (run_id, agent_id, user_id, seq, kind, name, event, message, payload)
  VALUES (p_run_id, p_agent_id, p_user_id, v_seq, p_kind, p_name, p_event, p_message, COALESCE(p_payload, '{}'::jsonb));

  RETURN v_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION append_agent_run_event TO service_role;
