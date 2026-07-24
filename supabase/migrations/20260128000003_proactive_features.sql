-- Migration: Proactive Features
-- Adds tables for suggestion engine, autonomy preferences, and error tracking

-- ============================================
-- 1. PROACTIVE SUGGESTIONS TABLE
-- ============================================
-- AI-generated suggestions based on user patterns
CREATE TABLE IF NOT EXISTS proactive_suggestions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_agent', 'schedule_optimization', 'automation', 'improvement')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  action_payload JSONB DEFAULT '{}',
  dismissed BOOLEAN DEFAULT FALSE,
  accepted BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE proactive_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own suggestions" ON proactive_suggestions;
CREATE POLICY "Users can manage their own suggestions" ON proactive_suggestions
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to suggestions" ON proactive_suggestions;
CREATE POLICY "Service role full access to suggestions" ON proactive_suggestions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_user ON proactive_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_pending ON proactive_suggestions(user_id, dismissed, expires_at);

-- ============================================
-- 2. USER AUTONOMY PREFERENCES
-- ============================================
-- Per-user settings for agent autonomy level
CREATE TABLE IF NOT EXISTS user_autonomy_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  autonomy_level TEXT DEFAULT 'balanced' CHECK (autonomy_level IN ('conservative', 'balanced', 'aggressive')),
  always_ask_for TEXT[] DEFAULT ARRAY['send_email', 'send_message', 'make_purchase', 'delete_data', 'post_publicly'],
  never_ask_for TEXT[] DEFAULT ARRAY['screenshot', 'scroll', 'read_content', 'search'],
  max_autonomous_spend DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_autonomy_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their autonomy preferences" ON user_autonomy_preferences;
CREATE POLICY "Users can manage their autonomy preferences" ON user_autonomy_preferences
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to autonomy preferences" ON user_autonomy_preferences;
CREATE POLICY "Service role full access to autonomy preferences" ON user_autonomy_preferences
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- 3. AGENT ERROR LOG
-- ============================================
-- Track errors for pattern analysis and recovery improvement
CREATE TABLE IF NOT EXISTS agent_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  recovery_attempted BOOLEAN DEFAULT FALSE,
  recovery_successful BOOLEAN,
  recovery_action TEXT,
  attempt_count INTEGER DEFAULT 1,
  current_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE agent_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view error logs for their agents" ON agent_error_logs;
CREATE POLICY "Users can view error logs for their agents" ON agent_error_logs
  FOR ALL USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access to error logs" ON agent_error_logs;
CREATE POLICY "Service role full access to error logs" ON agent_error_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_agent_error_logs_agent ON agent_error_logs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_error_logs_type ON agent_error_logs(error_type, created_at DESC);

-- ============================================
-- 4. AGENT APPROVAL QUEUE (Enhanced)
-- ============================================
-- For confidence-based autonomy - actions awaiting approval
CREATE TABLE IF NOT EXISTS agent_pending_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_description TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  confidence FLOAT NOT NULL,
  reasoning TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE agent_pending_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage approvals for their agents" ON agent_pending_approvals;
CREATE POLICY "Users can manage approvals for their agents" ON agent_pending_approvals
  FOR ALL USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access to pending approvals" ON agent_pending_approvals;
CREATE POLICY "Service role full access to pending approvals" ON agent_pending_approvals
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_agent_pending_approvals_agent ON agent_pending_approvals(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_pending_approvals_pending ON agent_pending_approvals(status, expires_at) WHERE status = 'pending';

-- ============================================
-- 5. USER PATTERN ANALYSIS CACHE
-- ============================================
-- Cache detected patterns to avoid re-analyzing frequently
CREATE TABLE IF NOT EXISTS user_patterns_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_description TEXT NOT NULL,
  frequency TEXT NOT NULL,
  confidence FLOAT NOT NULL,
  last_occurrence TIMESTAMPTZ,
  occurrence_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, pattern_description)
);

-- Enable RLS
ALTER TABLE user_patterns_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own patterns" ON user_patterns_cache;
CREATE POLICY "Users can view their own patterns" ON user_patterns_cache
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to patterns cache" ON user_patterns_cache;
CREATE POLICY "Service role full access to patterns cache" ON user_patterns_cache
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_user_patterns_cache_user ON user_patterns_cache(user_id, confidence DESC);

-- ============================================
-- 6. HELPER FUNCTIONS
-- ============================================

-- Function to get user's autonomy preferences (with defaults)
CREATE OR REPLACE FUNCTION get_user_autonomy_preferences(p_user_id UUID)
RETURNS TABLE(
  autonomy_level TEXT,
  always_ask_for TEXT[],
  never_ask_for TEXT[],
  max_autonomous_spend DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(u.autonomy_level, 'balanced'),
    COALESCE(u.always_ask_for, ARRAY['send_email', 'send_message', 'make_purchase', 'delete_data', 'post_publicly']),
    COALESCE(u.never_ask_for, ARRAY['screenshot', 'scroll', 'read_content', 'search']),
    COALESCE(u.max_autonomous_spend, 0)
  FROM user_autonomy_preferences u
  WHERE u.user_id = p_user_id
  UNION ALL
  SELECT 
    'balanced',
    ARRAY['send_email', 'send_message', 'make_purchase', 'delete_data', 'post_publicly'],
    ARRAY['screenshot', 'scroll', 'read_content', 'search'],
    0::DECIMAL
  WHERE NOT EXISTS (SELECT 1 FROM user_autonomy_preferences WHERE user_id = p_user_id)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_autonomy_preferences TO service_role;

-- Function to log agent error with deduplication
CREATE OR REPLACE FUNCTION log_agent_error(
  p_agent_id UUID,
  p_error_type TEXT,
  p_error_message TEXT,
  p_current_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  -- Check if same error occurred recently (within 5 minutes)
  SELECT id INTO v_existing_id
  FROM agent_error_logs
  WHERE agent_id = p_agent_id
    AND error_type = p_error_type
    AND created_at > NOW() - INTERVAL '5 minutes'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_existing_id IS NOT NULL THEN
    -- Increment attempt count
    UPDATE agent_error_logs
    SET attempt_count = attempt_count + 1
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  ELSE
    -- Insert new error log
    INSERT INTO agent_error_logs (agent_id, error_type, error_message, current_url)
    VALUES (p_agent_id, p_error_type, p_error_message, p_current_url)
    RETURNING id INTO v_new_id;
    RETURN v_new_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION log_agent_error TO service_role;

-- Function to resolve pending approval
CREATE OR REPLACE FUNCTION resolve_pending_approval(
  p_approval_id UUID,
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE agent_pending_approvals
  SET status = p_status,
      resolved_at = NOW()
  WHERE id = p_approval_id
    AND status = 'pending';
  
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_pending_approval TO service_role;

-- Trigger to auto-expire old approvals
CREATE OR REPLACE FUNCTION expire_old_approvals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE agent_pending_approvals
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();
  RETURN NULL;
END;
$$;

-- Run expiration check periodically (on any insert to the table)
DROP TRIGGER IF EXISTS trigger_expire_old_approvals ON agent_pending_approvals;
CREATE TRIGGER trigger_expire_old_approvals
  AFTER INSERT ON agent_pending_approvals
  EXECUTE FUNCTION expire_old_approvals();

-- Update timestamp trigger for autonomy preferences
DROP TRIGGER IF EXISTS update_user_autonomy_preferences_updated_at ON user_autonomy_preferences;
CREATE TRIGGER update_user_autonomy_preferences_updated_at
  BEFORE UPDATE ON user_autonomy_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. AGENT SCHEDULE FEEDBACK
-- ============================================
-- Track when users view agent results to optimize scheduling
CREATE TABLE IF NOT EXISTS agent_schedule_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_at TIMESTAMPTZ NOT NULL,
  viewed_at TIMESTAMPTZ,
  delay_minutes INTEGER,
  was_helpful BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE agent_schedule_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their schedule feedback" ON agent_schedule_feedback;
CREATE POLICY "Users can view their schedule feedback" ON agent_schedule_feedback
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to schedule feedback" ON agent_schedule_feedback;
CREATE POLICY "Service role full access to schedule feedback" ON agent_schedule_feedback
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_agent_schedule_feedback_agent ON agent_schedule_feedback(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_schedule_feedback_user ON agent_schedule_feedback(user_id, created_at DESC);
