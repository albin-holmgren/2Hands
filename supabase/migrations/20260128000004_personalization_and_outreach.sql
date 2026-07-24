-- Migration: Personalization and Proactive Outreach
-- Creates tables for user personalization and AI-initiated messages

-- ============================================
-- 1. USER PERSONALIZATION PROFILE
-- ============================================
-- Stores everything we learn about the user
CREATE TABLE IF NOT EXISTS user_personalization (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Basic info
  preferred_name TEXT,
  timezone TEXT,
  work_schedule JSONB,
  
  -- Communication style
  communication_style TEXT DEFAULT 'friendly' CHECK (communication_style IN ('formal', 'casual', 'friendly', 'professional')),
  preferred_detail_level TEXT DEFAULT 'moderate' CHECK (preferred_detail_level IN ('brief', 'moderate', 'detailed')),
  uses_emoji BOOLEAN DEFAULT FALSE,
  
  -- Personal context
  interests TEXT[] DEFAULT '{}',
  goals TEXT[] DEFAULT '{}',
  challenges TEXT[] DEFAULT '{}',
  industry_or_role TEXT,
  
  -- Relationship tracking
  relationship_stage TEXT DEFAULT 'new' CHECK (relationship_stage IN ('new', 'building', 'established', 'trusted')),
  total_interactions INTEGER DEFAULT 0,
  last_interaction TIMESTAMPTZ,
  positive_interactions INTEGER DEFAULT 0,
  
  -- Behavioral patterns
  typical_response_time INTEGER, -- minutes
  preferred_contact_times TEXT[] DEFAULT '{}',
  stress_indicators TEXT[] DEFAULT '{}',
  
  -- Learned facts (JSON array)
  learned_facts JSONB DEFAULT '[]',
  pending_questions TEXT[] DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_personalization ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their personalization" ON user_personalization;
CREATE POLICY "Users can manage their personalization" ON user_personalization
  FOR ALL USING (auth.uid() = id);

DROP POLICY IF EXISTS "Service role full access to personalization" ON user_personalization;
CREATE POLICY "Service role full access to personalization" ON user_personalization
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- 2. PROACTIVE OUTREACH MESSAGES
-- ============================================
-- AI-initiated messages to users
CREATE TABLE IF NOT EXISTS proactive_outreach (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('check_in', 'agent_completion', 'report_ready', 'learning_question', 'celebration', 'reminder', 'suggestion', 'insight')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE proactive_outreach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their outreach messages" ON proactive_outreach;
CREATE POLICY "Users can view their outreach messages" ON proactive_outreach
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to outreach" ON proactive_outreach;
CREATE POLICY "Service role full access to outreach" ON proactive_outreach
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_proactive_outreach_user ON proactive_outreach(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_outreach_pending ON proactive_outreach(scheduled_for) WHERE sent_at IS NULL;

-- ============================================
-- 3. CONVERSATION CONTEXT TRACKING
-- ============================================
-- Track context for more natural conversations
CREATE TABLE IF NOT EXISTS conversation_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Recent topics discussed
  recent_topics TEXT[] DEFAULT '{}',
  
  -- Emotional context
  detected_mood TEXT,
  mood_confidence FLOAT,
  
  -- Open threads (things to follow up on)
  open_threads JSONB DEFAULT '[]',
  
  -- Last question asked by AI (for follow-up)
  last_ai_question TEXT,
  awaiting_response BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE conversation_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their conversation context" ON conversation_context;
CREATE POLICY "Users can view their conversation context" ON conversation_context
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to conversation context" ON conversation_context;
CREATE POLICY "Service role full access to conversation context" ON conversation_context
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_conversation_context_user ON conversation_context(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_context_conversation ON conversation_context(conversation_id);

-- ============================================
-- 4. USER MILESTONES
-- ============================================
-- Track achievements and milestones for celebrations
CREATE TABLE IF NOT EXISTS user_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL,
  milestone_value INTEGER,
  description TEXT,
  celebrated BOOLEAN DEFAULT FALSE,
  achieved_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their milestones" ON user_milestones;
CREATE POLICY "Users can view their milestones" ON user_milestones
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to milestones" ON user_milestones;
CREATE POLICY "Service role full access to milestones" ON user_milestones
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_user_milestones_user ON user_milestones(user_id, achieved_at DESC);

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Increment interaction count and update relationship stage
CREATE OR REPLACE FUNCTION record_user_interaction(
  p_user_id UUID,
  p_was_positive BOOLEAN DEFAULT TRUE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INTEGER;
  v_positive INTEGER;
  v_new_stage TEXT;
BEGIN
  -- Upsert personalization record
  INSERT INTO user_personalization (id, total_interactions, positive_interactions, last_interaction)
  VALUES (p_user_id, 1, CASE WHEN p_was_positive THEN 1 ELSE 0 END, NOW())
  ON CONFLICT (id) DO UPDATE
  SET 
    total_interactions = user_personalization.total_interactions + 1,
    positive_interactions = user_personalization.positive_interactions + CASE WHEN p_was_positive THEN 1 ELSE 0 END,
    last_interaction = NOW(),
    updated_at = NOW();
  
  -- Get current counts
  SELECT total_interactions, positive_interactions INTO v_total, v_positive
  FROM user_personalization WHERE id = p_user_id;
  
  -- Determine new relationship stage
  IF v_total >= 50 AND v_positive >= 40 THEN
    v_new_stage := 'trusted';
  ELSIF v_total >= 20 AND v_positive >= 15 THEN
    v_new_stage := 'established';
  ELSIF v_total >= 5 THEN
    v_new_stage := 'building';
  ELSE
    v_new_stage := 'new';
  END IF;
  
  -- Update stage if changed
  UPDATE user_personalization
  SET relationship_stage = v_new_stage
  WHERE id = p_user_id AND relationship_stage != v_new_stage;
END;
$$;

GRANT EXECUTE ON FUNCTION record_user_interaction TO service_role;

-- Check and create milestones
CREATE OR REPLACE FUNCTION check_user_milestones(p_user_id UUID)
RETURNS TABLE(milestone_type TEXT, description TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent_count INTEGER;
  v_run_count INTEGER;
BEGIN
  -- Count agents
  SELECT COUNT(*) INTO v_agent_count FROM agents WHERE user_id = p_user_id;
  
  -- Count completed agent runs
  SELECT COUNT(*) INTO v_run_count 
  FROM agents 
  WHERE user_id = p_user_id AND status = 'completed';
  
  -- First agent milestone
  IF v_agent_count >= 1 AND NOT EXISTS (
    SELECT 1 FROM user_milestones WHERE user_id = p_user_id AND milestone_type = 'first_agent'
  ) THEN
    INSERT INTO user_milestones (user_id, milestone_type, milestone_value, description)
    VALUES (p_user_id, 'first_agent', 1, 'Created your first AI agent!');
    RETURN QUERY SELECT 'first_agent'::TEXT, 'Created your first AI agent!'::TEXT;
  END IF;
  
  -- 5 agents milestone
  IF v_agent_count >= 5 AND NOT EXISTS (
    SELECT 1 FROM user_milestones WHERE user_id = p_user_id AND milestone_type = 'five_agents'
  ) THEN
    INSERT INTO user_milestones (user_id, milestone_type, milestone_value, description)
    VALUES (p_user_id, 'five_agents', 5, 'Created 5 AI agents!');
    RETURN QUERY SELECT 'five_agents'::TEXT, 'Created 5 AI agents!'::TEXT;
  END IF;
  
  -- 10 completed runs milestone
  IF v_run_count >= 10 AND NOT EXISTS (
    SELECT 1 FROM user_milestones WHERE user_id = p_user_id AND milestone_type = 'ten_runs'
  ) THEN
    INSERT INTO user_milestones (user_id, milestone_type, milestone_value, description)
    VALUES (p_user_id, 'ten_runs', 10, 'Your agents have completed 10 tasks!');
    RETURN QUERY SELECT 'ten_runs'::TEXT, 'Your agents have completed 10 tasks!'::TEXT;
  END IF;
  
  -- 50 completed runs milestone
  IF v_run_count >= 50 AND NOT EXISTS (
    SELECT 1 FROM user_milestones WHERE user_id = p_user_id AND milestone_type = 'fifty_runs'
  ) THEN
    INSERT INTO user_milestones (user_id, milestone_type, milestone_value, description)
    VALUES (p_user_id, 'fifty_runs', 50, 'Your agents have completed 50 tasks!');
    RETURN QUERY SELECT 'fifty_runs'::TEXT, 'Your agents have completed 50 tasks!'::TEXT;
  END IF;
  
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION check_user_milestones TO service_role;

-- Update timestamp trigger
DROP TRIGGER IF EXISTS update_user_personalization_updated_at ON user_personalization;
CREATE TRIGGER update_user_personalization_updated_at
  BEFORE UPDATE ON user_personalization
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversation_context_updated_at ON conversation_context;
CREATE TRIGGER update_conversation_context_updated_at
  BEFORE UPDATE ON conversation_context
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
