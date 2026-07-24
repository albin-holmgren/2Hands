-- ============================================================
-- Rename Organization → Workspace
-- Adds Lovable-inspired features: personal workspaces, avatar,
-- description, per-member credit tracking
-- ============================================================

-- 1. Rename core tables
ALTER TABLE IF EXISTS organizations RENAME TO workspaces;
ALTER TABLE IF EXISTS org_members RENAME TO workspace_members;
ALTER TABLE IF EXISTS org_invites RENAME TO workspace_invites;

-- 2. Rename columns in related tables
ALTER TABLE shared_agents RENAME COLUMN org_id TO workspace_id;
ALTER TABLE audit_log RENAME COLUMN org_id TO workspace_id;
ALTER TABLE workspace_members RENAME COLUMN org_id TO workspace_id;
ALTER TABLE workspace_invites RENAME COLUMN org_id TO workspace_id;

-- 3. Add new Lovable-inspired columns to workspaces
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT FALSE;

-- 4. Add per-member credit usage tracking (like Lovable)
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS credits_used INTEGER DEFAULT 0;
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS credits_used_this_month INTEGER DEFAULT 0;
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS month_reset_at TIMESTAMPTZ DEFAULT NOW();

-- 5. Rename indexes
DROP INDEX IF EXISTS idx_organizations_owner;
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);

DROP INDEX IF EXISTS idx_organizations_slug;
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);

DROP INDEX IF EXISTS idx_org_members_org;
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);

DROP INDEX IF EXISTS idx_org_members_user;
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

DROP INDEX IF EXISTS idx_org_invites_org;
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id);

DROP INDEX IF EXISTS idx_org_invites_email;
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON workspace_invites(email);

DROP INDEX IF EXISTS idx_shared_agents_org;
CREATE INDEX IF NOT EXISTS idx_shared_agents_workspace ON shared_agents(workspace_id);

DROP INDEX IF EXISTS idx_audit_log_org;
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON audit_log(workspace_id);

-- 6. Recreate RLS policies with new table/column names

-- workspaces policies
DROP POLICY IF EXISTS "Org members can view their org" ON workspaces;
DROP POLICY IF EXISTS "Owner can manage org" ON workspaces;

CREATE POLICY "Workspace members can view their workspace"
  ON workspaces FOR SELECT
  USING (id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Owner can manage workspace"
  ON workspaces FOR ALL
  USING (owner_id = auth.uid());

-- workspace_members policies
DROP POLICY IF EXISTS "Members can view co-members" ON workspace_members;
DROP POLICY IF EXISTS "Admins can manage members" ON workspace_members;

CREATE POLICY "Members can view co-members"
  ON workspace_members FOR SELECT
  USING (workspace_id IN (SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()));
CREATE POLICY "Admins can manage members"
  ON workspace_members FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- workspace_invites policies
DROP POLICY IF EXISTS "Admins can manage invites" ON workspace_invites;

CREATE POLICY "Admins can manage invites"
  ON workspace_invites FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- shared_agents policies
DROP POLICY IF EXISTS "Org members can view shared agents" ON shared_agents;
DROP POLICY IF EXISTS "Agent owner or admin can share" ON shared_agents;

CREATE POLICY "Workspace members can view shared agents"
  ON shared_agents FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Agent owner or admin can share"
  ON shared_agents FOR ALL
  USING (shared_by = auth.uid() OR workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- audit_log policies
DROP POLICY IF EXISTS "Org admins can view audit log" ON audit_log;

CREATE POLICY "Workspace admins can view audit log"
  ON audit_log FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- 7. Helper function: ensure user has a personal workspace
CREATE OR REPLACE FUNCTION ensure_personal_workspace(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_workspace_id UUID;
  v_user_name TEXT;
BEGIN
  -- Check if personal workspace already exists
  SELECT w.id INTO v_workspace_id
  FROM workspaces w
  WHERE w.owner_id = p_user_id AND w.is_personal = TRUE
  LIMIT 1;

  IF v_workspace_id IS NOT NULL THEN
    RETURN v_workspace_id;
  END IF;

  -- Get user name for workspace
  SELECT COALESCE(raw_user_meta_data->>'full_name', email)
  INTO v_user_name
  FROM auth.users WHERE id = p_user_id;

  -- Create personal workspace
  v_workspace_id := gen_random_uuid();

  INSERT INTO workspaces (id, name, slug, owner_id, plan, is_personal, settings, created_at, updated_at)
  VALUES (
    v_workspace_id,
    COALESCE(v_user_name, 'My Workspace') || '''s Workspace',
    'personal-' || REPLACE(p_user_id::TEXT, '-', ''),
    p_user_id,
    'team',
    TRUE,
    '{"maxMembers": 5, "maxAgents": 20, "maxCreditsPerMonth": 5000, "allowMemberAgentCreation": true, "requireApprovalForAgentRuns": false, "sharedCreditsPool": true, "auditLogRetentionDays": 30}'::JSONB,
    NOW(),
    NOW()
  );

  -- Add owner as member
  INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
  VALUES (gen_random_uuid(), v_workspace_id, p_user_id, 'owner', NOW());

  RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
