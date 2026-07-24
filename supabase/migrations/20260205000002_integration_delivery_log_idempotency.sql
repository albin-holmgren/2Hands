ALTER TABLE public.integration_delivery_log
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_delivery_log_connection_idempotency_key
  ON public.integration_delivery_log (connection_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
