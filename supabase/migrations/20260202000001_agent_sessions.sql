-- Migration: Agent Sessions for Per-Agent VM Isolation
-- Enables on-demand VM sessions with pooling for scalability

-- ============================================
-- 1. AGENT SESSIONS TABLE
-- ============================================
-- Each agent gets its own isolated compute session (no shared VM)
CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Provider info
  provider TEXT NOT NULL DEFAULT 'paperspace', -- paperspace, aws, gcp, pool
  compute_id TEXT, -- VM ID, container ID, or pool slot ID
  
  -- Connection details
  base_url TEXT, -- Full URL to the compute service (e.g., http://1.2.3.4:8080)
  ip_address TEXT,
  port INTEGER DEFAULT 8080,
  
  -- Session state
  state TEXT NOT NULL DEFAULT 'provisioning', 
  -- provisioning: being created
  -- ready: available, not executing
  -- busy: actively running a task
  -- idle: task complete, waiting for next or cleanup
  -- terminated: session ended
  -- error: failed state
  
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  idle_expires_at TIMESTAMPTZ, -- When to return to pool or terminate
  terminated_at TIMESTAMPTZ,
  
  -- Resource tracking
  region TEXT DEFAULT 'us-east',
  instance_type TEXT DEFAULT 'standard',
  
  -- Cost tracking
  compute_seconds INTEGER DEFAULT 0,
  estimated_cost_cents INTEGER DEFAULT 0,
  
  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user ON agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_state ON agent_sessions(state);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_idle ON agent_sessions(idle_expires_at) WHERE state = 'idle';

-- Only one active session per agent at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_active 
  ON agent_sessions(agent_id) 
  WHERE state IN ('provisioning', 'ready', 'busy', 'idle');

-- ============================================
-- 2. SESSION POOL TABLE
-- ============================================
-- Pre-warmed sessions for fast agent startup
CREATE TABLE IF NOT EXISTS session_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Provider info
  provider TEXT NOT NULL DEFAULT 'paperspace',
  compute_id TEXT NOT NULL,
  base_url TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  port INTEGER DEFAULT 8080,
  
  -- Pool state
  state TEXT NOT NULL DEFAULT 'warming', -- warming, available, leased, draining
  
  -- Lease tracking
  leased_to_session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
  leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  
  -- Health
  last_health_check_at TIMESTAMPTZ DEFAULT now(),
  health_status TEXT DEFAULT 'unknown', -- healthy, unhealthy, unknown
  consecutive_failures INTEGER DEFAULT 0,
  
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  warmed_at TIMESTAMPTZ,
  
  -- Resource info
  region TEXT DEFAULT 'us-east',
  instance_type TEXT DEFAULT 'standard',
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_session_pool_state ON session_pool(state);
CREATE INDEX IF NOT EXISTS idx_session_pool_available ON session_pool(state, region) WHERE state = 'available';
CREATE INDEX IF NOT EXISTS idx_session_pool_leased ON session_pool(leased_to_session_id) WHERE leased_to_session_id IS NOT NULL;

-- ============================================
-- 3. GLOBAL KNOWLEDGE TABLE (CROSS-USER)
-- ============================================
-- Knowledge that ALL agents across ALL users can benefit from
-- E.g., "Amazon login page changed layout", "LinkedIn rate limits after 100 connections/day"
CREATE TABLE IF NOT EXISTS global_agent_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source
  contributed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contributed_by_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  
  -- Knowledge content
  category TEXT NOT NULL, -- ui_change, rate_limit, best_practice, error_solution, workflow_tip
  service TEXT, -- amazon, linkedin, google, etc.
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  
  -- Quality metrics
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  verification_count INTEGER DEFAULT 0,
  times_applied INTEGER DEFAULT 0,
  times_helped INTEGER DEFAULT 0,
  times_failed INTEGER DEFAULT 0,
  
  -- Moderation
  is_verified BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT true,
  
  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ, -- Some knowledge becomes stale (e.g., UI changes)
  
  -- Deduplication
  content_hash TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_global_knowledge_category ON global_agent_knowledge(category);
CREATE INDEX IF NOT EXISTS idx_global_knowledge_service ON global_agent_knowledge(service);
CREATE INDEX IF NOT EXISTS idx_global_knowledge_confidence ON global_agent_knowledge(confidence DESC) WHERE is_public = true;

-- ============================================
-- 4. UPDATE AGENTS TABLE
-- ============================================
-- Add current_session_id to agents for quick lookup
ALTER TABLE agents ADD COLUMN IF NOT EXISTS current_session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL;

-- ============================================
-- 5. RLS POLICIES
-- ============================================

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_agent_knowledge ENABLE ROW LEVEL SECURITY;

-- Agent sessions: users can only see their own
CREATE POLICY "Users can manage their agent sessions"
  ON agent_sessions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to agent sessions"
  ON agent_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Session pool: service role only (internal management)
CREATE POLICY "Service role manages session pool"
  ON session_pool FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Global knowledge: anyone can read public, users can contribute
CREATE POLICY "Anyone can read public global knowledge"
  ON global_agent_knowledge FOR SELECT
  USING (is_public = true);

CREATE POLICY "Authenticated users can contribute knowledge"
  ON global_agent_knowledge FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Service role full access to global knowledge"
  ON global_agent_knowledge FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- 6. HELPER FUNCTIONS
-- ============================================

-- Function to get or create a session for an agent
CREATE OR REPLACE FUNCTION ensure_agent_session(
  p_agent_id UUID,
  p_user_id UUID,
  p_provider TEXT DEFAULT 'paperspace'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id UUID;
  v_pool_slot session_pool%ROWTYPE;
BEGIN
  -- Check for existing active session
  SELECT id INTO v_session_id
  FROM agent_sessions
  WHERE agent_id = p_agent_id
    AND state IN ('provisioning', 'ready', 'busy', 'idle')
  LIMIT 1;
  
  IF v_session_id IS NOT NULL THEN
    -- Update last activity
    UPDATE agent_sessions
    SET last_activity_at = now()
    WHERE id = v_session_id;
    RETURN v_session_id;
  END IF;
  
  -- Try to get a slot from the pool first
  SELECT * INTO v_pool_slot
  FROM session_pool
  WHERE state = 'available'
    AND health_status = 'healthy'
  ORDER BY last_health_check_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_pool_slot.id IS NOT NULL THEN
    -- Create session from pool slot
    INSERT INTO agent_sessions (
      agent_id, user_id, provider, compute_id, base_url, ip_address, port,
      state, ready_at, region, instance_type
    )
    VALUES (
      p_agent_id, p_user_id, 'pool', v_pool_slot.compute_id, v_pool_slot.base_url,
      v_pool_slot.ip_address, v_pool_slot.port, 'ready', now(),
      v_pool_slot.region, v_pool_slot.instance_type
    )
    RETURNING id INTO v_session_id;
    
    -- Mark pool slot as leased
    UPDATE session_pool
    SET state = 'leased',
        leased_to_session_id = v_session_id,
        leased_at = now(),
        lease_expires_at = now() + interval '30 minutes'
    WHERE id = v_pool_slot.id;
  ELSE
    -- Create new session (will be provisioned externally)
    INSERT INTO agent_sessions (
      agent_id, user_id, provider, state
    )
    VALUES (
      p_agent_id, p_user_id, p_provider, 'provisioning'
    )
    RETURNING id INTO v_session_id;
  END IF;
  
  -- Update agent's current session
  UPDATE agents
  SET current_session_id = v_session_id
  WHERE id = p_agent_id;
  
  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_agent_session TO service_role;

-- Function to release a session back to pool or terminate
CREATE OR REPLACE FUNCTION release_agent_session(p_session_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session agent_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM agent_sessions WHERE id = p_session_id;
  
  IF v_session.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Clear agent's current session
  UPDATE agents
  SET current_session_id = NULL
  WHERE current_session_id = p_session_id;
  
  -- If from pool, return the slot
  IF v_session.provider = 'pool' THEN
    UPDATE session_pool
    SET state = 'available',
        leased_to_session_id = NULL,
        leased_at = NULL,
        lease_expires_at = NULL
    WHERE leased_to_session_id = p_session_id;
  END IF;
  
  -- Mark session as terminated
  UPDATE agent_sessions
  SET state = 'terminated',
      terminated_at = now()
  WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION release_agent_session TO service_role;

-- Function to get global knowledge for a service
CREATE OR REPLACE FUNCTION get_global_knowledge(
  p_service TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
  id UUID,
  category TEXT,
  service TEXT,
  title TEXT,
  content TEXT,
  confidence FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gk.id,
    gk.category,
    gk.service,
    gk.title,
    gk.content,
    gk.confidence
  FROM global_agent_knowledge gk
  WHERE gk.is_public = true
    AND (p_service IS NULL OR gk.service = p_service)
    AND (p_category IS NULL OR gk.category = p_category)
    AND (gk.expires_at IS NULL OR gk.expires_at > now())
  ORDER BY gk.confidence DESC, gk.times_helped DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_global_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION get_global_knowledge TO service_role;

-- Function to contribute global knowledge
CREATE OR REPLACE FUNCTION contribute_global_knowledge(
  p_user_id UUID,
  p_agent_id UUID,
  p_category TEXT,
  p_service TEXT,
  p_title TEXT,
  p_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash TEXT;
  v_id UUID;
BEGIN
  -- Create content hash for deduplication
  v_hash := md5(p_category || p_service || p_content);
  
  -- Upsert (update confidence if exists)
  INSERT INTO global_agent_knowledge (
    contributed_by_user_id, contributed_by_agent_id,
    category, service, title, content, content_hash
  )
  VALUES (
    p_user_id, p_agent_id,
    p_category, p_service, p_title, p_content, v_hash
  )
  ON CONFLICT (content_hash) DO UPDATE
  SET verification_count = global_agent_knowledge.verification_count + 1,
      confidence = LEAST(1.0, global_agent_knowledge.confidence + 0.05),
      updated_at = now()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION contribute_global_knowledge TO service_role;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_global_knowledge_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_global_knowledge_updated_at ON global_agent_knowledge;
CREATE TRIGGER update_global_knowledge_updated_at
  BEFORE UPDATE ON global_agent_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_global_knowledge_updated_at();
