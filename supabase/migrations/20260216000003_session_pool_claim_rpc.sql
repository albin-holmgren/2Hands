-- Migration: Atomic session pool slot claiming RPC
-- Prevents multi-worker races when leasing available pool slots.

CREATE OR REPLACE FUNCTION claim_session_pool_slot(
  p_region TEXT DEFAULT NULL,
  p_lease_minutes INTEGER DEFAULT 30
)
RETURNS TABLE(
  id UUID,
  compute_id TEXT,
  base_url TEXT,
  ip_address TEXT,
  port INTEGER,
  region TEXT,
  instance_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT s.id
    FROM session_pool s
    WHERE s.state = 'available'
      AND s.health_status = 'healthy'
      AND (p_region IS NULL OR s.region = p_region)
    ORDER BY s.last_health_check_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ),
  claimed AS (
    UPDATE session_pool s
    SET state = 'leased',
        leased_at = now(),
        lease_expires_at = now() + make_interval(mins => GREATEST(1, COALESCE(p_lease_minutes, 30)))
    WHERE s.id IN (SELECT c.id FROM candidate c)
    RETURNING s.id, s.compute_id, s.base_url, s.ip_address, s.port, s.region, s.instance_type
  )
  SELECT c.id, c.compute_id, c.base_url, c.ip_address, c.port, c.region, c.instance_type
  FROM claimed c;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_session_pool_slot TO service_role;
