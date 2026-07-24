-- Fix RLS infinite recursion on workspace_members
-- The policy "Members can view co-members" was using a subquery on workspace_members
-- inside its own USING clause, causing PostgreSQL RLS recursion error (42P17)

-- Create helper functions first (they're idempotent)
-- Users can see workspace members for workspaces they belong to
-- We use a security definer function to bypass RLS for the membership check
CREATE OR REPLACE FUNCTION user_belongs_to_workspace(p_user_id UUID, p_workspace_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Admins can manage members (owner/admin roles)
CREATE OR REPLACE FUNCTION user_is_workspace_admin(p_user_id UUID, p_workspace_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id 
      AND user_id = p_user_id 
      AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Drop the problematic policies
DROP POLICY IF EXISTS "Members can view co-members" ON workspace_members;
DROP POLICY IF EXISTS "Admins can manage members" ON workspace_members;
DROP POLICY IF EXISTS "Admins can manage invites" ON workspace_invites;
DROP POLICY IF EXISTS "Workspace admins can view audit log" ON audit_log;
DROP POLICY IF EXISTS "Workspace members can view shared agents" ON shared_agents;
DROP POLICY IF EXISTS "Agent owner or admin can share" ON shared_agents;
DROP POLICY IF EXISTS "Workspace members can view their workspace" ON workspaces;

-- Recreate fixed policies using helper functions instead of self-referencing subqueries

CREATE POLICY "Members can view co-members"
  ON workspace_members FOR SELECT
  USING (user_belongs_to_workspace(auth.uid(), workspace_id));

CREATE POLICY "Admins can manage members"
  ON workspace_members FOR ALL
  USING (user_is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY "Admins can manage invites"
  ON workspace_invites FOR ALL
  USING (user_is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY "Workspace admins can view audit log"
  ON audit_log FOR SELECT
  USING (user_is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can view shared agents"
  ON shared_agents FOR SELECT
  USING (user_belongs_to_workspace(auth.uid(), workspace_id));

CREATE POLICY "Agent owner or admin can share"
  ON shared_agents FOR ALL
  USING (shared_by = auth.uid() OR user_is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can view their workspace"
  ON workspaces FOR SELECT
  USING (user_belongs_to_workspace(auth.uid(), id));
