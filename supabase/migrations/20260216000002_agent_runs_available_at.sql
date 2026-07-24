-- Migration: Add delayed queue availability to agent runs
-- Supports retry backoff and future-scheduled run execution.

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ;

UPDATE agent_runs
SET available_at = COALESCE(available_at, queued_at, now())
WHERE available_at IS NULL;

ALTER TABLE agent_runs
  ALTER COLUMN available_at SET DEFAULT now();

ALTER TABLE agent_runs
  ALTER COLUMN available_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_status_available_queued
  ON agent_runs(status, available_at, queued_at);

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
      AND r.available_at <= now()
    ORDER BY r.available_at ASC, r.queued_at ASC
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
