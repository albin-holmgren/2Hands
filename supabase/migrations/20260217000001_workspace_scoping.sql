-- Migration: Add workspace_id to workspace-scoped tables and implement RLS policies
-- This migration adds workspace scoping to agents, conversations, messages, and related tables

-- ============================================================
-- Add workspace_id columns to tables
-- ============================================================

-- Add workspace_id to agents table
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Add workspace_id to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Add workspace_id to messages table (indirectly via conversation)
-- Messages inherit workspace from their conversation, so we don't add workspace_id directly

-- Add workspace_id to tasks table
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Add workspace_id to integration_connections table
ALTER TABLE integration_connections 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Add workspace_id to webhooks table
ALTER TABLE webhooks 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Add workspace_id to api_keys table
ALTER TABLE api_keys 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- ============================================================
-- Create indexes for workspace_id columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_agents_workspace_id ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_user_workspace ON agents(user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_id ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_workspace ON conversations(user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_workspace ON tasks(agent_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_integration_connections_workspace_id ON integration_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_connections_user_workspace ON integration_connections(user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_webhooks_workspace_id ON webhooks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_user_workspace ON webhooks(user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_workspace_id ON api_keys(workspace_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_workspace ON api_keys(user_id, workspace_id);

-- ============================================================
-- Backfill workspace_id for existing data
-- ============================================================

-- First, ensure all users have a personal workspace
INSERT INTO workspaces (id, name, slug, owner_id, plan, is_personal, settings, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  COALESCE(p.full_name, p.email) || '''s Workspace',
  LOWER(REGEXP_REPLACE(COALESCE(p.full_name, p.email), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING(p.id::text, 1, 8),
  p.id,
  'team',
  TRUE,
  '{}'::jsonb,
  NOW(),
  NOW()
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM workspaces w 
  WHERE w.owner_id = p.id AND w.is_personal = TRUE
);

-- Add users as members of their personal workspaces
INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
SELECT 
  gen_random_uuid(),
  w.id,
  w.owner_id,
  'owner',
  NOW()
FROM workspaces w
WHERE w.is_personal = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM workspace_members wm 
    WHERE wm.workspace_id = w.id AND wm.user_id = w.owner_id
  );

-- Backfill agents with their user's personal workspace
UPDATE agents
SET workspace_id = (
  SELECT id FROM workspaces 
  WHERE owner_id = agents.user_id 
  AND is_personal = TRUE 
  LIMIT 1
)
WHERE workspace_id IS NULL;

-- Backfill conversations with their user's personal workspace
UPDATE conversations
SET workspace_id = (
  SELECT id FROM workspaces 
  WHERE owner_id = conversations.user_id 
  AND is_personal = TRUE 
  LIMIT 1
)
WHERE workspace_id IS NULL;

-- Backfill tasks with their agent's workspace (join through agents table)
UPDATE tasks
SET workspace_id = (
  SELECT w.id 
  FROM workspaces w
  INNER JOIN agents a ON a.user_id = w.owner_id AND w.is_personal = TRUE
  WHERE a.id = tasks.agent_id
  LIMIT 1
)
WHERE workspace_id IS NULL;

-- Backfill integration_connections with their user's personal workspace
UPDATE integration_connections
SET workspace_id = (
  SELECT id FROM workspaces 
  WHERE owner_id = integration_connections.user_id 
  AND is_personal = TRUE 
  LIMIT 1
)
WHERE workspace_id IS NULL;

-- Backfill webhooks with their user's personal workspace
UPDATE webhooks
SET workspace_id = (
  SELECT id FROM workspaces 
  WHERE owner_id = webhooks.user_id 
  AND is_personal = TRUE 
  LIMIT 1
)
WHERE workspace_id IS NULL;

-- Backfill api_keys with their user's personal workspace
UPDATE api_keys
SET workspace_id = (
  SELECT id FROM workspaces 
  WHERE owner_id = api_keys.user_id 
  AND is_personal = TRUE 
  LIMIT 1
)
WHERE workspace_id IS NULL;

-- ============================================================
-- Make workspace_id NOT NULL after backfill
-- ============================================================

ALTER TABLE agents ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE conversations ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE integration_connections ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE webhooks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE api_keys ALTER COLUMN workspace_id SET NOT NULL;

-- ============================================================
-- Row Level Security (RLS) Policies
-- ============================================================

-- Enable RLS on workspace-scoped tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS agents_workspace_isolation ON agents;
DROP POLICY IF EXISTS conversations_workspace_isolation ON conversations;
DROP POLICY IF EXISTS messages_workspace_isolation ON messages;
DROP POLICY IF EXISTS tasks_workspace_isolation ON tasks;
DROP POLICY IF EXISTS integration_connections_workspace_isolation ON integration_connections;
DROP POLICY IF EXISTS webhooks_workspace_isolation ON webhooks;
DROP POLICY IF EXISTS api_keys_workspace_isolation ON api_keys;

-- ============================================================
-- Agents RLS Policy
-- ============================================================
CREATE POLICY agents_workspace_isolation ON agents
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- Conversations RLS Policy
-- ============================================================
CREATE POLICY conversations_workspace_isolation ON conversations
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- Messages RLS Policy (via conversation's workspace)
-- ============================================================
CREATE POLICY messages_workspace_isolation ON messages
  FOR ALL
  USING (
    conversation_id IN (
      SELECT id 
      FROM conversations 
      WHERE workspace_id IN (
        SELECT workspace_id 
        FROM workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- Tasks RLS Policy
-- ============================================================
CREATE POLICY tasks_workspace_isolation ON tasks
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- Integration Connections RLS Policy
-- ============================================================
CREATE POLICY integration_connections_workspace_isolation ON integration_connections
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- Webhooks RLS Policy
-- ============================================================
CREATE POLICY webhooks_workspace_isolation ON webhooks
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- API Keys RLS Policy
-- ============================================================
CREATE POLICY api_keys_workspace_isolation ON api_keys
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON COLUMN agents.workspace_id IS 'Workspace this agent belongs to - enforces data isolation';
COMMENT ON COLUMN conversations.workspace_id IS 'Workspace this conversation belongs to - enforces data isolation';
COMMENT ON COLUMN tasks.workspace_id IS 'Workspace this task belongs to - enforces data isolation';
COMMENT ON COLUMN integration_connections.workspace_id IS 'Workspace this integration belongs to - enforces data isolation';
COMMENT ON COLUMN webhooks.workspace_id IS 'Workspace this webhook belongs to - enforces data isolation';
COMMENT ON COLUMN api_keys.workspace_id IS 'Workspace this API key belongs to - enforces data isolation';
