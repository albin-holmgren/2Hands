-- Migration: Structured Memory System + Heartbeat/Proactive Monitoring
-- Inspired by Moltbot's memory architecture for smarter, more personalized agents

-- ============================================
-- 1. STRUCTURED MEMORY DOCUMENTS
-- ============================================
-- Store markdown-style documents per agent (like Moltbot's SOUL.md, USER.md, etc.)
CREATE TABLE IF NOT EXISTS agent_memory_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- 'soul', 'user_context', 'long_term_memory', 'workspace'
  content TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, document_type)
);

-- Enable RLS
ALTER TABLE agent_memory_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can access memory documents for their agents
DROP POLICY IF EXISTS "Users can manage memory documents for their agents" ON agent_memory_documents;
CREATE POLICY "Users can manage memory documents for their agents" ON agent_memory_documents
  FOR ALL USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );

-- Service role full access for agent execution
DROP POLICY IF EXISTS "Service role full access to memory documents" ON agent_memory_documents;
CREATE POLICY "Service role full access to memory documents" ON agent_memory_documents
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- 2. DAILY RUN LOGS
-- ============================================
-- Store daily summaries of agent runs (like Moltbot's memory/YYYY-MM-DD.md)
CREATE TABLE IF NOT EXISTS agent_daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  content TEXT NOT NULL DEFAULT '',
  run_count INTEGER DEFAULT 0,
  insights_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, log_date)
);

-- Enable RLS
ALTER TABLE agent_daily_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage daily logs for their agents" ON agent_daily_logs;
CREATE POLICY "Users can manage daily logs for their agents" ON agent_daily_logs
  FOR ALL USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access to daily logs" ON agent_daily_logs;
CREATE POLICY "Service role full access to daily logs" ON agent_daily_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- 3. HEARTBEAT CONFIGURATION
-- ============================================
-- Proactive monitoring - agents can check things periodically
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  checklist TEXT NOT NULL, -- Markdown checklist of things to monitor
  interval_minutes INTEGER NOT NULL DEFAULT 30,
  active_hours_start TIME DEFAULT '08:00',
  active_hours_end TIME DEFAULT '22:00',
  timezone TEXT DEFAULT 'UTC',
  is_enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, name)
);

-- Enable RLS
ALTER TABLE agent_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage heartbeats for their agents" ON agent_heartbeats;
CREATE POLICY "Users can manage heartbeats for their agents" ON agent_heartbeats
  FOR ALL USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access to heartbeats" ON agent_heartbeats;
CREATE POLICY "Service role full access to heartbeats" ON agent_heartbeats
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Index for finding due heartbeats
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_next_run 
  ON agent_heartbeats(next_run_at) 
  WHERE is_enabled = true;

-- ============================================
-- 4. MONITOR AGENTS (New Agent Type)
-- ============================================
-- Add agent_type to agents table to support different behaviors
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'task' 
CHECK (agent_type IN ('task', 'monitor', 'research'));

-- Add monitoring configuration
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS monitor_config JSONB DEFAULT NULL;

-- Monitor config structure:
-- {
--   "check_interval_minutes": 30,
--   "active_hours": { "start": "08:00", "end": "22:00" },
--   "conditions": [
--     { "description": "Check email for urgent messages", "priority": "high" },
--     { "description": "Review calendar for upcoming events", "priority": "medium" }
--   ],
--   "notify_only_on_change": true,
--   "quiet_if_nothing": true
-- }

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function to initialize default memory documents for a new agent
CREATE OR REPLACE FUNCTION initialize_agent_memory_documents(p_agent_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create SOUL document (agent personality/communication style)
  INSERT INTO agent_memory_documents (agent_id, document_type, content)
  VALUES (p_agent_id, 'soul', '# Agent Personality

## Communication Style
- Be genuinely helpful, not performatively helpful
- Skip filler phrases like "Great question!" - just help
- Have opinions and preferences
- Be resourceful before asking questions

## Working Style  
- Complete tasks thoroughly
- Report progress and findings proactively
- Ask for clarification only when truly stuck
- Remember context from previous interactions
')
  ON CONFLICT (agent_id, document_type) DO NOTHING;

  -- Create USER_CONTEXT document (facts about user/business)
  INSERT INTO agent_memory_documents (agent_id, document_type, content)
  VALUES (p_agent_id, 'user_context', '# User Context

## About the User
(Agent will learn and populate this over time)

## Business/Work Context
(Agent will learn and populate this over time)

## Preferences
(Agent will learn and populate this over time)
')
  ON CONFLICT (agent_id, document_type) DO NOTHING;

  -- Create LONG_TERM_MEMORY document (curated important memories)
  INSERT INTO agent_memory_documents (agent_id, document_type, content)
  VALUES (p_agent_id, 'long_term_memory', '# Long-Term Memory

## Important Facts
(Curated memories that should persist)

## Key Learnings
(What the agent has learned from past runs)

## Recurring Patterns
(Patterns noticed across multiple interactions)
')
  ON CONFLICT (agent_id, document_type) DO NOTHING;

  -- Create WORKSPACE document (agent-specific workspace notes)
  INSERT INTO agent_memory_documents (agent_id, document_type, content)
  VALUES (p_agent_id, 'workspace', '# Workspace

## Current Focus
(What the agent is currently working on)

## Pending Items
(Things to follow up on)

## Resources
(Useful links, files, or references)
')
  ON CONFLICT (agent_id, document_type) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION initialize_agent_memory_documents TO service_role;

-- Function to append to daily log
CREATE OR REPLACE FUNCTION append_agent_daily_log(
  p_agent_id UUID,
  p_entry TEXT,
  p_is_insight BOOLEAN DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO agent_daily_logs (agent_id, log_date, content, run_count, insights_count)
  VALUES (
    p_agent_id, 
    CURRENT_DATE, 
    '## ' || to_char(NOW(), 'HH24:MI') || E'\n' || p_entry || E'\n\n',
    1,
    CASE WHEN p_is_insight THEN 1 ELSE 0 END
  )
  ON CONFLICT (agent_id, log_date) DO UPDATE
  SET 
    content = agent_daily_logs.content || '## ' || to_char(NOW(), 'HH24:MI') || E'\n' || p_entry || E'\n\n',
    run_count = agent_daily_logs.run_count + 1,
    insights_count = agent_daily_logs.insights_count + CASE WHEN p_is_insight THEN 1 ELSE 0 END,
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION append_agent_daily_log TO service_role;

-- Function to update a specific memory document section
CREATE OR REPLACE FUNCTION update_memory_document(
  p_agent_id UUID,
  p_document_type TEXT,
  p_content TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO agent_memory_documents (agent_id, document_type, content, version)
  VALUES (p_agent_id, p_document_type, p_content, 1)
  ON CONFLICT (agent_id, document_type) DO UPDATE
  SET 
    content = p_content,
    version = agent_memory_documents.version + 1,
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION update_memory_document TO service_role;

-- Function to claim due heartbeats atomically
CREATE OR REPLACE FUNCTION claim_due_heartbeats(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(
  heartbeat_id UUID,
  agent_id UUID,
  checklist TEXT,
  agent_name TEXT,
  user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT h.id, h.agent_id, h.checklist
    FROM agent_heartbeats h
    WHERE h.is_enabled = true
      AND h.next_run_at <= NOW()
      AND (
        -- Check if within active hours (simple version - assumes same timezone)
        CURRENT_TIME BETWEEN h.active_hours_start AND h.active_hours_end
      )
    ORDER BY h.next_run_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE agent_heartbeats
    SET 
      last_run_at = NOW(),
      next_run_at = NOW() + (interval_minutes || ' minutes')::INTERVAL
    WHERE id IN (SELECT c.id FROM claimed c)
    RETURNING id
  )
  SELECT 
    c.id as heartbeat_id,
    c.agent_id,
    c.checklist,
    a.name as agent_name,
    a.user_id
  FROM claimed c
  JOIN agents a ON a.id = c.agent_id
  WHERE c.id IN (SELECT u.id FROM updated u);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_due_heartbeats TO service_role;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_memory_documents_agent ON agent_memory_documents(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_daily_logs_agent_date ON agent_daily_logs(agent_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(agent_type) WHERE agent_type != 'task';

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_agent_memory_documents_updated_at ON agent_memory_documents;
CREATE TRIGGER update_agent_memory_documents_updated_at
  BEFORE UPDATE ON agent_memory_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agent_daily_logs_updated_at ON agent_daily_logs;
CREATE TRIGGER update_agent_daily_logs_updated_at
  BEFORE UPDATE ON agent_daily_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agent_heartbeats_updated_at ON agent_heartbeats;
CREATE TRIGGER update_agent_heartbeats_updated_at
  BEFORE UPDATE ON agent_heartbeats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
