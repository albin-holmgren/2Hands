-- Migration: Fix race conditions and add atomic operations
-- Addresses: Webhook idempotency, credit reservations, agent execution locks

-- ============================================
-- 1. ATOMIC WEBHOOK PROCESSING
-- ============================================
-- Replace check-then-act with atomic claim pattern
CREATE OR REPLACE FUNCTION claim_webhook_event(
  p_event_id TEXT,
  p_event_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted BOOLEAN;
BEGIN
  -- Atomic insert - returns true only if this call inserted the row
  INSERT INTO stripe_webhook_events (event_id, event_type, processed_at)
  VALUES (p_event_id, p_event_type, NOW())
  ON CONFLICT (event_id) DO NOTHING;
  
  -- Check if we actually inserted (we "own" this event)
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_webhook_event TO service_role;

-- ============================================
-- 2. CREDIT RESERVATION SYSTEM
-- ============================================
-- Table to track credit reservations for in-progress operations
CREATE TABLE IF NOT EXISTS credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  operation_type TEXT NOT NULL, -- 'agent_run', 'api_call', etc.
  operation_id TEXT, -- Reference to the operation (e.g., agent_id)
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'released')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour'),
  committed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_user ON credit_reservations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_reservations_expires ON credit_reservations(expires_at) WHERE status = 'reserved';

-- Enable RLS
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reservations" ON credit_reservations;
CREATE POLICY "Users can view own reservations"
  ON credit_reservations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access to reservations" ON credit_reservations;
CREATE POLICY "Service role full access to reservations"
  ON credit_reservations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Atomic credit reservation function
-- Reserves credits upfront, returns reservation ID or NULL if insufficient
CREATE OR REPLACE FUNCTION reserve_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_operation_type TEXT,
  p_operation_id TEXT DEFAULT NULL,
  p_ttl_minutes INTEGER DEFAULT 60
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_available_credits INTEGER;
  v_reserved_credits INTEGER;
  v_reservation_id UUID;
BEGIN
  -- Lock user row and get current credits
  SELECT credits INTO v_available_credits
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Calculate already reserved credits
  SELECT COALESCE(SUM(amount), 0) INTO v_reserved_credits
  FROM credit_reservations
  WHERE user_id = p_user_id 
    AND status = 'reserved'
    AND expires_at > NOW();

  -- Check if sufficient credits available
  IF (v_available_credits - v_reserved_credits) < p_amount THEN
    RETURN NULL; -- Insufficient credits
  END IF;

  -- Create reservation
  INSERT INTO credit_reservations (user_id, amount, operation_type, operation_id, expires_at)
  VALUES (p_user_id, p_amount, p_operation_type, p_operation_id, NOW() + (p_ttl_minutes || ' minutes')::INTERVAL)
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

-- Commit reservation (actually deduct credits)
CREATE OR REPLACE FUNCTION commit_credit_reservation(
  p_reservation_id UUID,
  p_actual_amount INTEGER DEFAULT NULL -- Optional: commit less than reserved
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation RECORD;
  v_deduct_amount INTEGER;
BEGIN
  -- Lock and get reservation
  SELECT * INTO v_reservation
  FROM credit_reservations
  WHERE id = p_reservation_id AND status = 'reserved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Determine amount to deduct
  v_deduct_amount := COALESCE(p_actual_amount, v_reservation.amount);
  IF v_deduct_amount > v_reservation.amount THEN
    v_deduct_amount := v_reservation.amount; -- Can't exceed reservation
  END IF;

  -- Deduct credits atomically
  UPDATE profiles
  SET credits = GREATEST(0, credits - v_deduct_amount)
  WHERE id = v_reservation.user_id;

  -- Mark reservation as committed
  UPDATE credit_reservations
  SET status = 'committed', committed_at = NOW()
  WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$$;

-- Release reservation without deducting (operation cancelled/failed)
CREATE OR REPLACE FUNCTION release_credit_reservation(p_reservation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE credit_reservations
  SET status = 'released', released_at = NOW()
  WHERE id = p_reservation_id AND status = 'reserved';
  
  RETURN FOUND;
END;
$$;

-- Cleanup expired reservations (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE credit_reservations
  SET status = 'released', released_at = NOW()
  WHERE status = 'reserved' AND expires_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION reserve_credits TO service_role;
GRANT EXECUTE ON FUNCTION commit_credit_reservation TO service_role;
GRANT EXECUTE ON FUNCTION release_credit_reservation TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_reservations TO service_role;

-- ============================================
-- 3. AGENT EXECUTION LOCKS
-- ============================================
-- Table to prevent concurrent agent executions
CREATE TABLE IF NOT EXISTS agent_execution_locks (
  agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT NOT NULL, -- Executor instance ID
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Enable RLS
ALTER TABLE agent_execution_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to execution locks" ON agent_execution_locks;
CREATE POLICY "Service role full access to execution locks"
  ON agent_execution_locks FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Atomic lock acquisition function
CREATE OR REPLACE FUNCTION acquire_agent_lock(
  p_agent_id UUID,
  p_executor_id TEXT,
  p_ttl_minutes INTEGER DEFAULT 10
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Try to insert new lock, or update expired lock
  INSERT INTO agent_execution_locks (agent_id, locked_by, locked_at, heartbeat_at, expires_at)
  VALUES (p_agent_id, p_executor_id, NOW(), NOW(), NOW() + (p_ttl_minutes || ' minutes')::INTERVAL)
  ON CONFLICT (agent_id) DO UPDATE
  SET locked_by = p_executor_id,
      locked_at = NOW(),
      heartbeat_at = NOW(),
      expires_at = NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  WHERE agent_execution_locks.expires_at < NOW(); -- Only if expired
  
  -- Check if we got the lock
  RETURN EXISTS (
    SELECT 1 FROM agent_execution_locks 
    WHERE agent_id = p_agent_id AND locked_by = p_executor_id
  );
END;
$$;

-- Heartbeat to extend lock
CREATE OR REPLACE FUNCTION extend_agent_lock(
  p_agent_id UUID,
  p_executor_id TEXT,
  p_ttl_minutes INTEGER DEFAULT 10
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE agent_execution_locks
  SET heartbeat_at = NOW(),
      expires_at = NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  WHERE agent_id = p_agent_id AND locked_by = p_executor_id;
  
  RETURN FOUND;
END;
$$;

-- Release lock
CREATE OR REPLACE FUNCTION release_agent_lock(
  p_agent_id UUID,
  p_executor_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM agent_execution_locks
  WHERE agent_id = p_agent_id AND locked_by = p_executor_id;
  
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION acquire_agent_lock TO service_role;
GRANT EXECUTE ON FUNCTION extend_agent_lock TO service_role;
GRANT EXECUTE ON FUNCTION release_agent_lock TO service_role;

-- ============================================
-- 4. BOUNDED PROGRESS LOG
-- ============================================
-- Function to safely append to progress log with size limit
CREATE OR REPLACE FUNCTION append_progress_log(
  p_agent_id UUID,
  p_type TEXT,
  p_message TEXT,
  p_data JSONB DEFAULT NULL,
  p_max_entries INTEGER DEFAULT 50
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config JSONB;
  v_progress_log JSONB;
  v_new_entry JSONB;
BEGIN
  -- Lock agent row
  SELECT config INTO v_config
  FROM agents
  WHERE id = p_agent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Get current progress log or initialize
  v_progress_log := COALESCE(v_config->'progress_log', '[]'::JSONB);
  
  -- Create new entry
  v_new_entry := jsonb_build_object(
    'timestamp', NOW(),
    'type', p_type,
    'message', LEFT(p_message, 1000) -- Limit message size
  );
  
  IF p_data IS NOT NULL THEN
    v_new_entry := v_new_entry || jsonb_build_object('data', p_data);
  END IF;

  -- Append and trim to max entries
  v_progress_log := v_progress_log || v_new_entry;
  IF jsonb_array_length(v_progress_log) > p_max_entries THEN
    v_progress_log := (
      SELECT jsonb_agg(elem)
      FROM (
        SELECT elem
        FROM jsonb_array_elements(v_progress_log) elem
        ORDER BY elem->>'timestamp' DESC
        LIMIT p_max_entries
      ) sub
    );
  END IF;

  -- Update config with bounded log
  UPDATE agents
  SET config = jsonb_set(
    COALESCE(config, '{}'::JSONB),
    '{progress_log}',
    v_progress_log
  ),
  last_active = NOW()
  WHERE id = p_agent_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION append_progress_log TO service_role;

-- ============================================
-- 5. SCHEDULER ATOMIC CLAIM
-- ============================================
-- Atomically claim scheduled agents for execution (prevents concurrent schedulers)
CREATE OR REPLACE FUNCTION claim_scheduled_agents(
  p_scheduler_id TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
  agent_id UUID,
  user_id UUID,
  name TEXT,
  schedule_cron TEXT,
  schedule_timezone TEXT,
  config JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE agents
    SET status = 'working',
        last_active = NOW(),
        config = COALESCE(config, '{}'::JSONB) || jsonb_build_object('claimed_by', p_scheduler_id, 'claimed_at', NOW())
    WHERE id IN (
      SELECT a.id
      FROM agents a
      WHERE a.schedule_type = 'scheduled'
        AND a.next_run_at <= NOW()
        AND a.status IN ('idle', 'initializing')
      ORDER BY a.next_run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit
    )
    RETURNING agents.*
  )
  SELECT c.id, c.user_id, c.name, c.schedule_cron, c.schedule_timezone, c.config
  FROM claimed c;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_scheduled_agents TO service_role;

-- ============================================
-- 6. ATOMIC AGENT STATUS TRANSITIONS
-- ============================================
-- Safely transition agent status with validation
CREATE OR REPLACE FUNCTION transition_agent_status(
  p_agent_id UUID,
  p_from_status TEXT,
  p_to_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valid_transitions JSONB := '{
    "idle": ["working", "initializing", "terminated"],
    "initializing": ["working", "idle", "failed", "terminated"],
    "working": ["completed", "failed", "paused", "terminated"],
    "paused": ["working", "idle", "terminated"],
    "completed": ["idle", "working", "terminated"],
    "failed": ["idle", "working", "terminated"]
  }'::JSONB;
  v_allowed_targets JSONB;
BEGIN
  -- Check if transition is valid
  v_allowed_targets := v_valid_transitions->p_from_status;
  
  IF v_allowed_targets IS NULL OR NOT (v_allowed_targets ? p_to_status) THEN
    RAISE WARNING 'Invalid status transition: % -> %', p_from_status, p_to_status;
    RETURN FALSE;
  END IF;

  -- Perform atomic update only if current status matches
  UPDATE agents
  SET status = p_to_status,
      last_active = NOW(),
      config = CASE 
        WHEN p_error_message IS NOT NULL 
        THEN COALESCE(config, '{}'::JSONB) || jsonb_build_object('last_error', p_error_message, 'error_at', NOW())
        ELSE config
      END
  WHERE id = p_agent_id AND status = p_from_status;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION transition_agent_status TO service_role;

-- ============================================
-- 7. AGENT HEALTH RECONCILIATION
-- ============================================
-- Find and fix stuck agents (running but no heartbeat)
CREATE OR REPLACE FUNCTION reconcile_stuck_agents(
  p_timeout_minutes INTEGER DEFAULT 15
)
RETURNS TABLE(
  agent_id UUID,
  old_status TEXT,
  new_status TEXT,
  stuck_duration INTERVAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH stuck_agents AS (
    SELECT a.id, a.status, a.last_active
    FROM agents a
    LEFT JOIN agent_execution_locks l ON a.id = l.agent_id
    WHERE a.status = 'working'
      AND (
        -- No lock exists or lock has expired
        l.agent_id IS NULL 
        OR l.expires_at < NOW()
      )
      AND (
        -- Agent hasn't been active recently
        a.last_active < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL
        OR a.last_active IS NULL
      )
    FOR UPDATE OF a SKIP LOCKED
  ),
  updated AS (
    UPDATE agents
    SET status = 'failed',
        config = COALESCE(config, '{}'::JSONB) || jsonb_build_object(
          'reconciled_at', NOW(),
          'reconciliation_reason', 'Agent stuck - no heartbeat for ' || p_timeout_minutes || ' minutes'
        )
    WHERE id IN (SELECT id FROM stuck_agents)
    RETURNING id, 'working'::TEXT as old_status, 'failed'::TEXT as new_status
  )
  SELECT u.id, u.old_status, u.new_status, NOW() - s.last_active as stuck_duration
  FROM updated u
  JOIN stuck_agents s ON u.id = s.id;
END;
$$;

-- Cleanup expired execution locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM agent_execution_locks
  WHERE expires_at < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION reconcile_stuck_agents TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_locks TO service_role;
