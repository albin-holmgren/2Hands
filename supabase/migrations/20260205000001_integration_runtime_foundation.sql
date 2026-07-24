CREATE TABLE IF NOT EXISTS public.integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  credential_id UUID REFERENCES public.credentials(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_user_id ON public.integration_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_connections_provider ON public.integration_connections(provider);

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own integration connections" ON public.integration_connections;
CREATE POLICY "Users can manage own integration connections"
  ON public.integration_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to integration connections" ON public.integration_connections;
CREATE POLICY "Service role full access to integration connections"
  ON public.integration_connections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_integration_connections_updated_at ON public.integration_connections;
CREATE TRIGGER update_integration_connections_updated_at
  BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.integration_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_thread_id TEXT NOT NULL,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, external_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_threads_user_id ON public.integration_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_threads_conversation_id ON public.integration_threads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_integration_threads_connection_id ON public.integration_threads(connection_id);

ALTER TABLE public.integration_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own integration threads" ON public.integration_threads;
CREATE POLICY "Users can manage own integration threads"
  ON public.integration_threads
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to integration threads" ON public.integration_threads;
CREATE POLICY "Service role full access to integration threads"
  ON public.integration_threads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_integration_threads_updated_at ON public.integration_threads;
CREATE TRIGGER update_integration_threads_updated_at
  BEFORE UPDATE ON public.integration_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.inbound_event_dedupe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, connection_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_inbound_event_dedupe_connection_id ON public.inbound_event_dedupe(connection_id);
CREATE INDEX IF NOT EXISTS idx_inbound_event_dedupe_created_at ON public.inbound_event_dedupe(created_at);

ALTER TABLE public.inbound_event_dedupe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to inbound event dedupe" ON public.inbound_event_dedupe;
CREATE POLICY "Service role full access to inbound event dedupe"
  ON public.inbound_event_dedupe
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.integration_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_thread_id TEXT,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}',
  response JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_delivery_log_connection_id ON public.integration_delivery_log(connection_id);
CREATE INDEX IF NOT EXISTS idx_integration_delivery_log_status ON public.integration_delivery_log(status);
CREATE INDEX IF NOT EXISTS idx_integration_delivery_log_next_attempt_at ON public.integration_delivery_log(next_attempt_at);

ALTER TABLE public.integration_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to integration delivery log" ON public.integration_delivery_log;
CREATE POLICY "Service role full access to integration delivery log"
  ON public.integration_delivery_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_integration_delivery_log_updated_at ON public.integration_delivery_log;
CREATE TRIGGER update_integration_delivery_log_updated_at
  BEFORE UPDATE ON public.integration_delivery_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
