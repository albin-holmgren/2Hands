-- Migration: Cross-Agent Knowledge Sharing
-- Enables learnings from one agent to be shared with all agents for a user

-- ============================================
-- 1. USER-LEVEL SHARED KNOWLEDGE TABLE
-- ============================================
-- Knowledge that applies to ALL agents for a user
-- E.g., "User prefers bullet points", "Company uses Shopify"
CREATE TABLE IF NOT EXISTS user_shared_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('user_fact', 'preference', 'business_context', 'workflow_pattern')),
  content TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_shared_knowledge ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own shared knowledge
DROP POLICY IF EXISTS "Users can manage their own shared knowledge" ON user_shared_knowledge;
CREATE POLICY "Users can manage their own shared knowledge" ON user_shared_knowledge
  FOR ALL USING (auth.uid() = user_id);

-- Service role full access for agent operations
DROP POLICY IF EXISTS "Service role full access to shared knowledge" ON user_shared_knowledge;
CREATE POLICY "Service role full access to shared knowledge" ON user_shared_knowledge
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_shared_knowledge_user ON user_shared_knowledge(user_id);
CREATE INDEX IF NOT EXISTS idx_user_shared_knowledge_category ON user_shared_knowledge(user_id, category);
CREATE INDEX IF NOT EXISTS idx_user_shared_knowledge_confidence ON user_shared_knowledge(user_id, confidence DESC);

-- ============================================
-- 2. AGENT SELF-REFLECTION TABLE
-- ============================================
-- After each run, agents reflect on what went well/wrong
CREATE TABLE IF NOT EXISTS agent_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  what_worked TEXT[],
  what_failed TEXT[],
  improvements TEXT[],
  task_complexity TEXT CHECK (task_complexity IN ('simple', 'moderate', 'complex')),
  success_rating INTEGER CHECK (success_rating >= 1 AND success_rating <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE agent_reflections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view reflections for their agents" ON agent_reflections;
CREATE POLICY "Users can view reflections for their agents" ON agent_reflections
  FOR ALL USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access to reflections" ON agent_reflections;
CREATE POLICY "Service role full access to reflections" ON agent_reflections
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_agent_reflections_agent ON agent_reflections(agent_id, run_date DESC);

-- ============================================
-- 3. MEMORY CURATION LOG
-- ============================================
-- Track what the AI Manager curated from agent learnings
CREATE TABLE IF NOT EXISTS memory_curation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  curated_at TIMESTAMPTZ DEFAULT NOW(),
  learnings_reviewed INTEGER DEFAULT 0,
  learnings_kept INTEGER DEFAULT 0,
  learnings_discarded INTEGER DEFAULT 0,
  learnings_shared INTEGER DEFAULT 0,
  summary TEXT
);

-- Enable RLS
ALTER TABLE memory_curation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view curation logs for their agents" ON memory_curation_logs;
CREATE POLICY "Users can view curation logs for their agents" ON memory_curation_logs
  FOR ALL USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access to curation logs" ON memory_curation_logs;
CREATE POLICY "Service role full access to curation logs" ON memory_curation_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- 4. HELPER FUNCTIONS
-- ============================================

-- Function to get shared knowledge for a user
CREATE OR REPLACE FUNCTION get_user_shared_knowledge(p_user_id UUID, p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  id UUID,
  category TEXT,
  content TEXT,
  confidence FLOAT,
  source_agent_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update usage tracking
  UPDATE user_shared_knowledge
  SET usage_count = usage_count + 1,
      last_used_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Return top knowledge by confidence
  RETURN QUERY
  SELECT 
    k.id,
    k.category,
    k.content,
    k.confidence,
    k.source_agent_id
  FROM user_shared_knowledge k
  WHERE k.user_id = p_user_id
  ORDER BY k.confidence DESC, k.usage_count DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_shared_knowledge TO service_role;

-- Function to boost confidence when knowledge is confirmed useful
CREATE OR REPLACE FUNCTION boost_knowledge_confidence(p_knowledge_id UUID, p_boost FLOAT DEFAULT 0.05)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_shared_knowledge
  SET confidence = LEAST(1.0, confidence + p_boost),
      updated_at = NOW()
  WHERE id = p_knowledge_id;
END;
$$;

GRANT EXECUTE ON FUNCTION boost_knowledge_confidence TO service_role;

-- Function to decay confidence over time (run periodically)
CREATE OR REPLACE FUNCTION decay_stale_knowledge()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Decay confidence for knowledge not used in 30+ days
  UPDATE user_shared_knowledge
  SET confidence = GREATEST(0.1, confidence - 0.1),
      updated_at = NOW()
  WHERE last_used_at < NOW() - INTERVAL '30 days'
    AND confidence > 0.1;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- Delete knowledge with very low confidence
  DELETE FROM user_shared_knowledge
  WHERE confidence < 0.2
    AND last_used_at < NOW() - INTERVAL '90 days';
  
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION decay_stale_knowledge TO service_role;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_user_shared_knowledge_updated_at ON user_shared_knowledge;
CREATE TRIGGER update_user_shared_knowledge_updated_at
  BEFORE UPDATE ON user_shared_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
