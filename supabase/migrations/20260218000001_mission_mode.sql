-- Migration: Mission Mode
-- Adds missions + mission_events tables and extends user_settings with mission defaults.

-- ============================================================
-- 1. MISSIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core goal
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'failed')),

  -- Autonomy
  autonomy_level TEXT NOT NULL DEFAULT 'execute_with_approval'
    CHECK (autonomy_level IN ('draft_only', 'execute_with_approval', 'full_auto')),

  -- Constraints / safety (JSONB for flexibility)
  -- Fields: kill_switch_enabled, max_actions_per_tick, max_cost_usd_per_day,
  --         allowed_integrations (array), outbound_messaging (draft_only|enabled)
  constraints JSONB NOT NULL DEFAULT '{}',

  -- Cadence
  cadence_mode TEXT NOT NULL DEFAULT 'adaptive'
    CHECK (cadence_mode IN ('fixed', 'adaptive')),
  cadence_cron TEXT,                -- Only used when cadence_mode = 'fixed'
  tick_timebox_minutes INTEGER NOT NULL DEFAULT 30,
  min_tick_interval_minutes INTEGER NOT NULL DEFAULT 60,
  max_ticks_per_day INTEGER NOT NULL DEFAULT 6,
  next_tick_at TIMESTAMPTZ,
  last_tick_at TIMESTAMPTZ,

  -- Planning state (serialized GoalTree from subgoal-planner.ts)
  goal_tree JSONB,

  -- Handoff note written at end of each tick for the next tick
  handoff_note TEXT,

  -- Linked AI Manager conversation (progress updates posted here)
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missions_workspace_user ON missions(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_missions_status_next_tick ON missions(status, next_tick_at)
  WHERE status = 'active';

-- ============================================================
-- 2. MISSION EVENTS TABLE (append-only audit log)
-- ============================================================

CREATE TABLE IF NOT EXISTS mission_events (
  id BIGSERIAL PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  kind TEXT NOT NULL,
  -- Examples: tick_started, tick_completed, tick_failed, action_taken,
  --           agent_created, agent_delegated, approval_requested, approval_resolved,
  --           mission_paused, mission_resumed, mission_completed

  summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_events_mission_id ON mission_events(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_events_workspace ON mission_events(workspace_id, created_at DESC);

-- ============================================================
-- 3. MISSION TICK LOCKS (prevent double-running a mission)
-- ============================================================

CREATE TABLE IF NOT EXISTS mission_tick_locks (
  mission_id UUID PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  worker_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- ============================================================
-- 4. RLS POLICIES
-- ============================================================

ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_tick_locks ENABLE ROW LEVEL SECURITY;

-- missions: user can read/write their own
DROP POLICY IF EXISTS "Users can manage own missions" ON missions;
CREATE POLICY "Users can manage own missions"
  ON missions FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access to missions" ON missions;
CREATE POLICY "Service role full access to missions"
  ON missions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- mission_events: read-only for user
DROP POLICY IF EXISTS "Users can view own mission events" ON mission_events;
CREATE POLICY "Users can view own mission events"
  ON mission_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access to mission events" ON mission_events;
CREATE POLICY "Service role full access to mission events"
  ON mission_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- tick locks: service role only
DROP POLICY IF EXISTS "Service role full access to mission tick locks" ON mission_tick_locks;
CREATE POLICY "Service role full access to mission tick locks"
  ON mission_tick_locks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 5. UPDATED_AT TRIGGER FOR MISSIONS
-- ============================================================

CREATE OR REPLACE FUNCTION update_missions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_missions_updated_at ON missions;
CREATE TRIGGER trg_missions_updated_at
  BEFORE UPDATE ON missions
  FOR EACH ROW EXECUTE FUNCTION update_missions_updated_at();

-- ============================================================
-- 6. ATOMIC TICK LOCK CLAIM FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION claim_mission_tick(
  p_mission_id UUID,
  p_worker_id TEXT,
  p_lock_duration_minutes INTEGER DEFAULT 45
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claimed BOOLEAN := FALSE;
BEGIN
  -- Delete expired lock if any
  DELETE FROM mission_tick_locks
  WHERE mission_id = p_mission_id AND expires_at < now();

  -- Try to insert a new lock
  BEGIN
    INSERT INTO mission_tick_locks (mission_id, worker_id, locked_at, expires_at)
    VALUES (p_mission_id, p_worker_id, now(), now() + (p_lock_duration_minutes || ' minutes')::INTERVAL);
    v_claimed := TRUE;
  EXCEPTION WHEN unique_violation THEN
    v_claimed := FALSE;
  END;

  RETURN v_claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_mission_tick TO service_role;

-- ============================================================
-- 7. EXTEND USER_SETTINGS WITH MISSION DEFAULTS
-- ============================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS default_mission_autonomy_level TEXT DEFAULT 'execute_with_approval'
    CHECK (default_mission_autonomy_level IN ('draft_only', 'execute_with_approval', 'full_auto')),
  ADD COLUMN IF NOT EXISTS default_mission_cadence_mode TEXT DEFAULT 'adaptive'
    CHECK (default_mission_cadence_mode IN ('fixed', 'adaptive')),
  ADD COLUMN IF NOT EXISTS default_mission_cadence_cron TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_mission_tick_minutes INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS default_min_tick_interval_minutes INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS default_max_ticks_per_day INTEGER DEFAULT 6,
  ADD COLUMN IF NOT EXISTS max_concurrent_mission_ticks INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS require_mission_start_confirmation BOOLEAN DEFAULT TRUE;
