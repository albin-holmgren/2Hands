-- ============================================================
-- Billion Dollar Roadmap Migration
-- Agent Templates, Analytics, Auto-Retry, Workflows, API Platform
-- ============================================================

-- 1. Behavior Profiles (for behavior-engine.ts)
CREATE TABLE IF NOT EXISTS behavior_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_count INTEGER DEFAULT 0,
  avg_session_gap_hours NUMERIC DEFAULT 24,
  active_hours INTEGER[] DEFAULT ARRAY[9,10,11,14,15,16],
  active_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
  avg_session_duration_minutes NUMERIC DEFAULT 5,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  engagement_momentum NUMERIC DEFAULT 0.5,
  momentum_trend TEXT DEFAULT 'stable',
  topic_scores JSONB DEFAULT '{}',
  notification_scores JSONB DEFAULT '{}',
  notification_tap_rate NUMERIC DEFAULT 0.5,
  quiet_hours_start INTEGER,
  quiet_hours_end INTEGER,
  max_daily_notifications INTEGER DEFAULT 5,
  churn_risk NUMERIC DEFAULT 0,
  days_since_last_session INTEGER DEFAULT 0,
  reactivation_count INTEGER DEFAULT 0,
  preferred_update_types TEXT[] DEFAULT ARRAY[]::TEXT[],
  value_signals TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE behavior_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own behavior profile"
  ON behavior_profiles FOR ALL
  USING (auth.uid() = user_id);

-- 2. Agent Failures (for auto-retry.ts)
CREATE TABLE IF NOT EXISTS agent_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  error_type TEXT NOT NULL,
  error_message TEXT,
  retry_attempt INTEGER DEFAULT 0,
  was_retried BOOLEAN DEFAULT FALSE,
  retry_succeeded BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_failures_agent_id ON agent_failures(agent_id);
CREATE INDEX idx_agent_failures_created_at ON agent_failures(created_at);

ALTER TABLE agent_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own agent failures"
  ON agent_failures FOR SELECT
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

-- 3. Workflows
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'draft', 'archived')),
  steps JSONB DEFAULT '[]',
  trigger_config JSONB DEFAULT '{"type": "manual"}',
  workflow_config JSONB DEFAULT '{}',
  current_step_index INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflows_user_id ON workflows(user_id);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own workflows"
  ON workflows FOR ALL
  USING (auth.uid() = user_id);

-- 4. Workflow Runs
CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  step_results JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  total_duration_ms BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_user_id ON workflow_runs(user_id);

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own workflow runs"
  ON workflow_runs FOR ALL
  USING (auth.uid() = user_id);

-- 5. API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  permissions TEXT[] DEFAULT ARRAY['agents:read'],
  rate_limit INTEGER DEFAULT 60,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = TRUE;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own API keys"
  ON api_keys FOR ALL
  USING (auth.uid() = user_id);

-- 6. Webhooks
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] DEFAULT ARRAY[]::TEXT[],
  secret TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  description TEXT DEFAULT '',
  failure_count INTEGER DEFAULT 0,
  last_delivered_at TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX idx_webhooks_active ON webhooks(is_active) WHERE is_active = TRUE;

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own webhooks"
  ON webhooks FOR ALL
  USING (auth.uid() = user_id);

-- 7. Webhook Deliveries
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB,
  response_status INTEGER,
  response_body TEXT,
  success BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 1,
  delivered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_delivered ON webhook_deliveries(delivered_at);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own webhook deliveries"
  ON webhook_deliveries FOR SELECT
  USING (webhook_id IN (SELECT id FROM webhooks WHERE user_id = auth.uid()));

-- 8. Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'team' CHECK (plan IN ('team', 'business', 'enterprise')),
  settings JSONB DEFAULT '{}',
  member_count INTEGER DEFAULT 1,
  agent_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_owner ON organizations(owner_id);
CREATE UNIQUE INDEX idx_organizations_slug ON organizations(slug);

-- 9. Organization Members (must be created before org RLS policies that reference it)
CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org ON org_members(org_id);
CREATE INDEX idx_org_members_user ON org_members(user_id);

-- Now enable RLS on both tables (org_members exists)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view their org"
  ON organizations FOR SELECT
  USING (id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "Owner can manage org"
  ON organizations FOR ALL
  USING (owner_id = auth.uid());

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view co-members"
  ON org_members FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY "Admins can manage members"
  ON org_members FOR ALL
  USING (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- 10. Organization Invites
CREATE TABLE IF NOT EXISTS org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_org_invites_org ON org_invites(org_id);
CREATE INDEX idx_org_invites_email ON org_invites(email);

ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage invites"
  ON org_invites FOR ALL
  USING (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- 11. Shared Agents
CREATE TABLE IF NOT EXISTS shared_agents (
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES auth.users(id),
  visibility TEXT DEFAULT 'org' CHECK (visibility IN ('org', 'team', 'private')),
  permissions TEXT[] DEFAULT ARRAY['view', 'run'],
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (agent_id, org_id)
);

CREATE INDEX idx_shared_agents_org ON shared_agents(org_id);

ALTER TABLE shared_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view shared agents"
  ON shared_agents FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "Agent owner or admin can share"
  ON shared_agents FOR ALL
  USING (shared_by = auth.uid() OR org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- 12. Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_org ON audit_log(org_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins can view audit log"
  ON audit_log FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- 13. Digest Engagement (for agent-digest.ts)
CREATE TABLE IF NOT EXISTS digest_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  insight_type TEXT,
  action TEXT NOT NULL,
  engaged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_digest_engagement_user ON digest_engagement(user_id);

ALTER TABLE digest_engagement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own digest engagement"
  ON digest_engagement FOR ALL
  USING (auth.uid() = user_id);
