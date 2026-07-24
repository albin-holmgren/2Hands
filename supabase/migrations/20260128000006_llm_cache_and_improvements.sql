-- Migration: Adaptive Outreach Learning + Push Notifications + Observability
-- Enables ML-driven outreach optimization and mobile push

-- ============================================
-- 1. USER OUTREACH METRICS (Learned preferences)
-- ============================================
CREATE TABLE IF NOT EXISTS user_outreach_metrics (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_responded INTEGER DEFAULT 0,
  total_ignored INTEGER DEFAULT 0,
  avg_response_time_minutes FLOAT DEFAULT 0,
  optimal_frequency_hours FLOAT DEFAULT 12,
  last_outreach_at TIMESTAMPTZ,
  last_engagement_at TIMESTAMPTZ,
  engagement_score FLOAT DEFAULT 0.5 CHECK (engagement_score >= 0 AND engagement_score <= 1),
  retention_risk TEXT DEFAULT 'low' CHECK (retention_risk IN ('low', 'medium', 'high', 'churning')),
  preferred_hours INTEGER[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_outreach_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to outreach metrics" ON user_outreach_metrics;
CREATE POLICY "Service role full access to outreach metrics" ON user_outreach_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- 2. OUTREACH EVENTS (For learning)
-- ============================================
CREATE TABLE IF NOT EXISTS outreach_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'opened', 'responded', 'dismissed', 'action_taken')),
  outreach_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE outreach_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to outreach events" ON outreach_events;
CREATE POLICY "Service role full access to outreach events" ON outreach_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_outreach_events_user ON outreach_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_events_outreach ON outreach_events(outreach_id);

-- ============================================
-- 3. PUSH TOKENS (Expo push notifications)
-- ============================================
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their push tokens" ON push_tokens;
CREATE POLICY "Users can manage their push tokens" ON push_tokens
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to push tokens" ON push_tokens;
CREATE POLICY "Service role full access to push tokens" ON push_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

-- ============================================
-- 4. NOTIFICATION LOGS (Analytics)
-- ============================================
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'delivered', 'opened')),
  title TEXT NOT NULL,
  token_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to notification logs" ON notification_logs;
CREATE POLICY "Service role full access to notification logs" ON notification_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON notification_logs(user_id, created_at DESC);

-- ============================================
-- 5. AGENT PENDING APPROVALS (Real autonomy gating)
-- ============================================
-- Add status and response tracking if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_pending_approvals' AND column_name = 'status') THEN
    ALTER TABLE agent_pending_approvals ADD COLUMN status TEXT DEFAULT 'pending' 
      CHECK (status IN ('pending', 'approved', 'rejected', 'expired'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_pending_approvals' AND column_name = 'responded_at') THEN
    ALTER TABLE agent_pending_approvals ADD COLUMN responded_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agent_pending_approvals' AND column_name = 'run_id') THEN
    ALTER TABLE agent_pending_approvals ADD COLUMN run_id TEXT;
  END IF;
END $$;

-- ============================================
-- 6. OBSERVABILITY: TOKEN USAGE TRACKING
-- ============================================
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  estimated_cost_usd FLOAT DEFAULT 0,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('chat', 'agent_run', 'memory_curation', 'reflection', 'fact_extraction', 'outreach_generation')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their usage" ON ai_usage_logs;
CREATE POLICY "Users can view their usage" ON ai_usage_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to usage logs" ON ai_usage_logs;
CREATE POLICY "Service role full access to usage logs" ON ai_usage_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user ON ai_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_agent ON ai_usage_logs(agent_id, created_at DESC);

-- ============================================
-- 7. OBSERVABILITY: SUCCESS METRICS
-- ============================================
CREATE TABLE IF NOT EXISTS agent_run_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'timeout', 'cancelled')),
  iterations_used INTEGER DEFAULT 0,
  screenshots_taken INTEGER DEFAULT 0,
  actions_performed INTEGER DEFAULT 0,
  errors_encountered INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  estimated_cost_usd FLOAT DEFAULT 0,
  success_rating FLOAT CHECK (success_rating >= 0 AND success_rating <= 1),
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_run_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their run metrics" ON agent_run_metrics;
CREATE POLICY "Users can view their run metrics" ON agent_run_metrics
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to run metrics" ON agent_run_metrics;
CREATE POLICY "Service role full access to run metrics" ON agent_run_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_agent_run_metrics_agent ON agent_run_metrics(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_run_metrics_user ON agent_run_metrics(user_id, created_at DESC);

-- ============================================
-- 8. LEARNED FACTS WITH CONFIDENCE
-- ============================================
CREATE TABLE IF NOT EXISTS learned_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fact TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('personal', 'work', 'preference', 'goal', 'challenge', 'behavior')),
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL CHECK (source IN ('user_message', 'ai_extraction', 'user_confirmed', 'inferred')),
  needs_confirmation BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  contradicted_by UUID REFERENCES learned_facts(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE learned_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their learned facts" ON learned_facts;
CREATE POLICY "Users can view their learned facts" ON learned_facts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to learned facts" ON learned_facts;
CREATE POLICY "Service role full access to learned facts" ON learned_facts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_learned_facts_user ON learned_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_learned_facts_category ON learned_facts(user_id, category);
CREATE INDEX IF NOT EXISTS idx_learned_facts_confidence ON learned_facts(user_id, confidence DESC);

-- ============================================
-- 9. HELPER FUNCTIONS
-- ============================================

-- Get user's current engagement tier
CREATE OR REPLACE FUNCTION get_engagement_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score FLOAT;
BEGIN
  SELECT engagement_score INTO v_score
  FROM user_outreach_metrics
  WHERE user_id = p_user_id;
  
  IF v_score IS NULL THEN RETURN 'new'; END IF;
  IF v_score > 0.8 THEN RETURN 'highly_engaged'; END IF;
  IF v_score > 0.6 THEN RETURN 'engaged'; END IF;
  IF v_score > 0.4 THEN RETURN 'moderate'; END IF;
  IF v_score > 0.2 THEN RETURN 'low'; END IF;
  RETURN 'at_risk';
END;
$$;

GRANT EXECUTE ON FUNCTION get_engagement_tier TO service_role;

-- Log AI usage
CREATE OR REPLACE FUNCTION log_ai_usage(
  p_user_id UUID,
  p_agent_id UUID,
  p_model TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_operation_type TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cost FLOAT;
  v_log_id UUID;
BEGIN
  -- Calculate cost based on model
  v_cost := CASE p_model
    WHEN 'claude-3-5-haiku-20241022' THEN (p_input_tokens * 0.001 + p_output_tokens * 0.005) / 1000
    WHEN 'claude-3-5-sonnet-20241022' THEN (p_input_tokens * 0.003 + p_output_tokens * 0.015) / 1000
    WHEN 'claude-sonnet-4-20250514' THEN (p_input_tokens * 0.003 + p_output_tokens * 0.015) / 1000
    WHEN 'claude-opus-4-5' THEN (p_input_tokens * 0.015 + p_output_tokens * 0.075) / 1000
    ELSE (p_input_tokens * 0.003 + p_output_tokens * 0.015) / 1000
  END;
  
  INSERT INTO ai_usage_logs (user_id, agent_id, model, input_tokens, output_tokens, estimated_cost_usd, operation_type, metadata)
  VALUES (p_user_id, p_agent_id, p_model, p_input_tokens, p_output_tokens, v_cost, p_operation_type, p_metadata)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_ai_usage TO service_role;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_user_outreach_metrics_updated_at ON user_outreach_metrics;
CREATE TRIGGER update_user_outreach_metrics_updated_at
  BEFORE UPDATE ON user_outreach_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_learned_facts_updated_at ON learned_facts;
CREATE TRIGGER update_learned_facts_updated_at
  BEFORE UPDATE ON learned_facts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. IDEMPOTENCY KEYS (Prevent duplicate operations)
-- ============================================
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  result JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to idempotency" ON idempotency_keys;
CREATE POLICY "Service role full access to idempotency" ON idempotency_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys(expires_at);

-- ============================================
-- 11. CRON LOCKS (Distributed locking)
-- ============================================
CREATE TABLE IF NOT EXISTS cron_locks (
  name TEXT PRIMARY KEY,
  lock_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cron_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to cron locks" ON cron_locks;
CREATE POLICY "Service role full access to cron locks" ON cron_locks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- 12. LLM RESPONSE CACHE (Cost optimization)
-- ============================================
CREATE TABLE IF NOT EXISTS llm_response_cache (
  cache_key TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  response TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE llm_response_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to llm cache" ON llm_response_cache;
CREATE POLICY "Service role full access to llm cache" ON llm_response_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_llm_cache_operation ON llm_response_cache(operation_type);
CREATE INDEX IF NOT EXISTS idx_llm_cache_expires ON llm_response_cache(expires_at);
