-- Fix: ensure_personal_workspace + RLS policies
-- Ensures member row exists AND RLS policies are correctly applied

-- 1. Enable RLS on all workspace tables (idempotent)
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 2. Drop and recreate workspace RLS policies
DROP POLICY IF EXISTS "Workspace members can view their workspace" ON workspaces;
DROP POLICY IF EXISTS "Owner can manage workspace" ON workspaces;
DROP POLICY IF EXISTS "Members can view co-members" ON workspace_members;
DROP POLICY IF EXISTS "Admins can manage members" ON workspace_members;
DROP POLICY IF EXISTS "Admins can manage invites" ON workspace_invites;
DROP POLICY IF EXISTS "Users can see their own invites" ON workspace_invites;
DROP POLICY IF EXISTS "Workspace members can view shared agents" ON shared_agents;
DROP POLICY IF EXISTS "Agent owner or admin can share" ON shared_agents;
DROP POLICY IF EXISTS "Workspace admins can view audit log" ON audit_log;

CREATE POLICY "Workspace members can view their workspace"
  ON workspaces FOR SELECT
  USING (id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "Owner can manage workspace"
  ON workspaces FOR ALL
  USING (owner_id = auth.uid());

CREATE POLICY "Members can view co-members"
  ON workspace_members FOR SELECT
  USING (workspace_id IN (SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()));

CREATE POLICY "Admins can manage members"
  ON workspace_members FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Admins can manage invites"
  ON workspace_invites FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Users can see their own invites"
  ON workspace_invites FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Workspace members can view shared agents"
  ON shared_agents FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "Agent owner or admin can share"
  ON shared_agents FOR ALL
  USING (shared_by = auth.uid() OR workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Workspace admins can view audit log"
  ON audit_log FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- 3. Fix ensure_personal_workspace function
CREATE OR REPLACE FUNCTION ensure_personal_workspace(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_workspace_id UUID;
  v_user_name TEXT;
  v_member_exists BOOLEAN;
BEGIN
  -- Check if personal workspace already exists
  SELECT w.id INTO v_workspace_id
  FROM workspaces w
  WHERE w.owner_id = p_user_id AND w.is_personal = TRUE
  LIMIT 1;

  IF v_workspace_id IS NOT NULL THEN
    -- ALWAYS ensure member row exists (fixes RLS visibility)
    SELECT EXISTS(
      SELECT 1 FROM workspace_members
      WHERE workspace_id = v_workspace_id AND user_id = p_user_id
    ) INTO v_member_exists;

    IF NOT v_member_exists THEN
      INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
      VALUES (gen_random_uuid(), v_workspace_id, p_user_id, 'owner', NOW());
    END IF;

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
