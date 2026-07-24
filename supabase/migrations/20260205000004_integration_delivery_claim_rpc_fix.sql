CREATE OR REPLACE FUNCTION claim_integration_deliveries(
  p_worker_id TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
  delivery_id UUID,
  connection_id UUID,
  provider TEXT,
  external_thread_id TEXT,
  conversation_id UUID,
  payload JSONB,
  attempt_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE public.integration_delivery_log AS l
    SET status = 'processing',
        attempt_count = l.attempt_count + 1,
        last_attempt_at = NOW(),
        next_attempt_at = NULL,
        updated_at = NOW(),
        response = COALESCE(l.response, '{}'::JSONB) || jsonb_build_object('claim', jsonb_build_object('claimed_by', p_worker_id, 'claimed_at', NOW()))
    WHERE l.id IN (
      SELECT x.id
      FROM public.integration_delivery_log x
      WHERE x.status = 'pending'
        AND (x.next_attempt_at IS NULL OR x.next_attempt_at <= NOW())
      ORDER BY x.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit
    )
    RETURNING l.*
  )
  SELECT c.id, c.connection_id, c.provider, c.external_thread_id, c.conversation_id, c.payload, c.attempt_count
  FROM claimed c;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_integration_deliveries TO service_role;
