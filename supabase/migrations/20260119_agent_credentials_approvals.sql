-- Agent Credentials Table
-- Stores encrypted credentials for agent authentication to external services
CREATE TABLE IF NOT EXISTS agent_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  service TEXT NOT NULL, -- e.g., 'gmail', 'twitter', 'shopify'
  username TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, service)
);

-- Enable RLS
ALTER TABLE agent_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own credentials
DROP POLICY IF EXISTS "Users can manage their own credentials" ON agent_credentials;
CREATE POLICY "Users can manage their own credentials" ON agent_credentials
  FOR ALL USING (auth.uid() = user_id);

-- Agent Approvals Table
-- Stores pending actions that require user approval before execution
CREATE TABLE IF NOT EXISTS agent_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- e.g., 'send_email', 'post_publicly', 'make_purchase'
  action_details JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'expired'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE agent_approvals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own approvals
DROP POLICY IF EXISTS "Users can manage their own approvals" ON agent_approvals;
CREATE POLICY "Users can manage their own approvals" ON agent_approvals
  FOR ALL USING (auth.uid() = user_id);

-- Agent Memories Table
-- Stores agent memories for context persistence across runs
CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL, -- 'fact', 'preference', 'context', 'interaction', 'learning'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;

-- Policy: Users can access memories for their agents
DROP POLICY IF EXISTS "Users can manage memories for their agents" ON agent_memories;
CREATE POLICY "Users can manage memories for their agents" ON agent_memories
  FOR ALL USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_credentials_agent_id ON agent_credentials(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_credentials_user_id ON agent_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_user_id_status ON agent_approvals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_agent_id ON agent_approvals(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_id ON agent_memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_type ON agent_memories(agent_id, memory_type);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_agent_credentials_updated_at ON agent_credentials;
CREATE TRIGGER update_agent_credentials_updated_at
  BEFORE UPDATE ON agent_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agent_memories_updated_at ON agent_memories;
CREATE TRIGGER update_agent_memories_updated_at
  BEFORE UPDATE ON agent_memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
