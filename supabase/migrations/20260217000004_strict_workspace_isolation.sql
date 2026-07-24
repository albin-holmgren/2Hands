-- Migration: Strict Workspace Isolation
-- Makes every context-bearing table workspace-scoped.
-- Existing user-level data is migrated into each user's personal workspace.
-- Tables with no matching personal workspace have their rows deleted (they'll
-- be recreated fresh — exactly the "new brand" experience we want).

-- ============================================================
-- 1. ai_manager_memories — add workspace_id
-- ============================================================

ALTER TABLE ai_manager_memories
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE ai_manager_memories
SET workspace_id = (
  SELECT id FROM workspaces
  WHERE owner_id = ai_manager_memories.user_id AND is_personal = TRUE
  LIMIT 1
)
WHERE workspace_id IS NULL;

-- Delete rows we couldn't backfill (will be recreated clean)
DELETE FROM ai_manager_memories WHERE workspace_id IS NULL;

ALTER TABLE ai_manager_memories ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_manager_memories_workspace
  ON ai_manager_memories(user_id, workspace_id);

-- Update RLS to include workspace membership
DROP POLICY IF EXISTS "Users can view own memories" ON ai_manager_memories;
DROP POLICY IF EXISTS "Users can insert own memories" ON ai_manager_memories;
DROP POLICY IF EXISTS "Users can update own memories" ON ai_manager_memories;
DROP POLICY IF EXISTS "Users can delete own memories" ON ai_manager_memories;

CREATE POLICY "Users can manage workspace memories" ON ai_manager_memories
  FOR ALL USING (
    auth.uid() = user_id
    AND workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Update upsert_ai_memory RPC to accept workspace_id
CREATE OR REPLACE FUNCTION upsert_ai_memory(
  p_user_id UUID,
  p_workspace_id UUID,
  p_memory_type TEXT,
  p_content TEXT,
  p_importance TEXT DEFAULT 'medium',
  p_source TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_memory_id UUID;
  v_existing_id UUID;
BEGIN
  SELECT id INTO v_existing_id
  FROM ai_manager_memories
  WHERE user_id = p_user_id
    AND workspace_id = p_workspace_id
    AND memory_type = p_memory_type
    AND LOWER(content) = LOWER(p_content)
    AND is_active = true
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE ai_manager_memories
    SET reference_count = reference_count + 1,
        last_referenced_at = NOW(),
        updated_at = NOW()
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  ELSE
    INSERT INTO ai_manager_memories
      (user_id, workspace_id, memory_type, content, importance, source)
    VALUES (p_user_id, p_workspace_id, p_memory_type, p_content, p_importance, p_source)
    RETURNING id INTO v_memory_id;
    RETURN v_memory_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_ai_memories RPC to accept workspace_id
CREATE OR REPLACE FUNCTION get_ai_memories(
  p_user_id UUID,
  p_workspace_id UUID,
  p_limit INTEGER DEFAULT 30
) RETURNS TABLE (
  id UUID,
  memory_type TEXT,
  content TEXT,
  importance TEXT,
  reference_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.memory_type,
    m.content,
    m.importance,
    m.reference_count
  FROM ai_manager_memories m
  WHERE m.user_id = p_user_id
    AND m.workspace_id = p_workspace_id
    AND m.is_active = true
  ORDER BY
    CASE m.importance
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      ELSE 3
    END,
    m.reference_count DESC,
    m.updated_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. user_personalization — restructure to (user_id, workspace_id) PK
-- ============================================================

-- Add user_id column (copy of old id)
ALTER TABLE user_personalization
  ADD COLUMN IF NOT EXISTS user_id UUID;

-- Add workspace_id column
ALTER TABLE user_personalization
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Backfill user_id from id
UPDATE user_personalization
SET user_id = id
WHERE user_id IS NULL;

-- Backfill workspace_id from user's personal workspace
UPDATE user_personalization
SET workspace_id = (
  SELECT w.id FROM workspaces w
  WHERE w.owner_id = user_personalization.id AND w.is_personal = TRUE
  LIMIT 1
)
WHERE workspace_id IS NULL AND user_id IS NOT NULL;

-- Delete rows that couldn't be backfilled
DELETE FROM user_personalization WHERE workspace_id IS NULL OR user_id IS NULL;

-- Set NOT NULL constraints
ALTER TABLE user_personalization ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE user_personalization ALTER COLUMN workspace_id SET NOT NULL;

-- Drop old PK (id was PK + FK to auth.users)
ALTER TABLE user_personalization DROP CONSTRAINT IF EXISTS user_personalization_pkey CASCADE;
ALTER TABLE user_personalization DROP CONSTRAINT IF EXISTS user_personalization_id_fkey CASCADE;

-- Add FK for user_id
ALTER TABLE user_personalization
  ADD CONSTRAINT user_personalization_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add new composite PK
ALTER TABLE user_personalization ADD PRIMARY KEY (user_id, workspace_id);

-- Drop old RLS policies first (they reference the id column)
DROP POLICY IF EXISTS "Users can manage their personalization" ON user_personalization;
DROP POLICY IF EXISTS "Service role full access to personalization" ON user_personalization;

-- Drop old id column (now redundant - we have user_id)
ALTER TABLE user_personalization DROP COLUMN IF EXISTS id;

CREATE POLICY "Users can manage their personalization" ON user_personalization
  FOR ALL USING (
    auth.uid() = user_id
    AND workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to personalization" ON user_personalization
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 3. user_settings — add workspace_id
-- ============================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE user_settings
SET workspace_id = (
  SELECT id FROM workspaces
  WHERE owner_id = user_settings.user_id AND is_personal = TRUE
  LIMIT 1
)
WHERE workspace_id IS NULL;

DELETE FROM user_settings WHERE workspace_id IS NULL;

ALTER TABLE user_settings ALTER COLUMN workspace_id SET NOT NULL;

-- Drop old UNIQUE(user_id) and replace with UNIQUE(user_id, workspace_id)
ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_user_id_key;
ALTER TABLE user_settings ADD CONSTRAINT user_settings_user_workspace_key
  UNIQUE (user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_user_settings_workspace ON user_settings(user_id, workspace_id);

-- Update RLS
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;

CREATE POLICY "Users can manage workspace settings" ON user_settings
  FOR ALL USING (
    auth.uid() = user_id
    AND workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. notification_preferences — add workspace_id
-- ============================================================

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE notification_preferences
SET workspace_id = (
  SELECT id FROM workspaces
  WHERE owner_id = notification_preferences.user_id AND is_personal = TRUE
  LIMIT 1
)
WHERE workspace_id IS NULL;

DELETE FROM notification_preferences WHERE workspace_id IS NULL;

ALTER TABLE notification_preferences ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_user_id_key;
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_user_workspace_key
  UNIQUE (user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_workspace
  ON notification_preferences(user_id, workspace_id);

-- Update RLS
DROP POLICY IF EXISTS "Users can view own notification preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can update own notification preferences" ON notification_preferences;

CREATE POLICY "Users can manage workspace notifications" ON notification_preferences
  FOR ALL USING (
    auth.uid() = user_id
    AND workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. credentials — add workspace_id
-- ============================================================

ALTER TABLE public.credentials
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE public.credentials
SET workspace_id = (
  SELECT id FROM workspaces
  WHERE owner_id = public.credentials.user_id AND is_personal = TRUE
  LIMIT 1
)
WHERE workspace_id IS NULL;

DELETE FROM public.credentials WHERE workspace_id IS NULL;

ALTER TABLE public.credentials ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credentials_workspace ON public.credentials(user_id, workspace_id);

-- Update RLS
DROP POLICY IF EXISTS "Users can manage own credentials" ON public.credentials;

CREATE POLICY "Users can manage workspace credentials" ON public.credentials
  FOR ALL USING (
    auth.uid() = user_id
    AND workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 6. conversation_context — add workspace_id
-- ============================================================

ALTER TABLE conversation_context
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE conversation_context
SET workspace_id = (
  SELECT id FROM workspaces
  WHERE owner_id = conversation_context.user_id AND is_personal = TRUE
  LIMIT 1
)
WHERE workspace_id IS NULL;

DELETE FROM conversation_context WHERE workspace_id IS NULL;

ALTER TABLE conversation_context ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_context_workspace
  ON conversation_context(user_id, workspace_id);

DROP POLICY IF EXISTS "Users can view their conversation context" ON conversation_context;
DROP POLICY IF EXISTS "Service role full access to conversation context" ON conversation_context;

CREATE POLICY "Users can manage workspace conversation context" ON conversation_context
  FOR ALL USING (
    auth.uid() = user_id
    AND workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to conversation context" ON conversation_context
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 7. user_milestones — add workspace_id
-- ============================================================

ALTER TABLE user_milestones
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE user_milestones
SET workspace_id = (
  SELECT id FROM workspaces
  WHERE owner_id = user_milestones.user_id AND is_personal = TRUE
  LIMIT 1
)
WHERE workspace_id IS NULL;

DELETE FROM user_milestones WHERE workspace_id IS NULL;

ALTER TABLE user_milestones ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_milestones_workspace
  ON user_milestones(user_id, workspace_id, achieved_at DESC);

DROP POLICY IF EXISTS "Users can view their milestones" ON user_milestones;
DROP POLICY IF EXISTS "Service role full access to milestones" ON user_milestones;

CREATE POLICY "Users can manage workspace milestones" ON user_milestones
  FOR ALL USING (
    auth.uid() = user_id
    AND workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to milestones" ON user_milestones
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 8. proactive_outreach — add workspace_id
-- ============================================================

ALTER TABLE proactive_outreach
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE proactive_outreach
SET workspace_id = (
  SELECT id FROM workspaces
  WHERE owner_id = proactive_outreach.user_id AND is_personal = TRUE
  LIMIT 1
)
WHERE workspace_id IS NULL;

DELETE FROM proactive_outreach WHERE workspace_id IS NULL;

ALTER TABLE proactive_outreach ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proactive_outreach_workspace
  ON proactive_outreach(user_id, workspace_id, sent_at DESC);

DROP POLICY IF EXISTS "Users can view their outreach messages" ON proactive_outreach;
DROP POLICY IF EXISTS "Service role full access to outreach" ON proactive_outreach;

CREATE POLICY "Users can manage workspace outreach" ON proactive_outreach
  FOR ALL USING (
    auth.uid() = user_id
    AND workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to outreach" ON proactive_outreach
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 9. user_shared_knowledge — add workspace_id
-- ============================================================

ALTER TABLE user_shared_knowledge
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE user_shared_knowledge
SET workspace_id = (
  SELECT id FROM workspaces
  WHERE owner_id = user_shared_knowledge.user_id AND is_personal = TRUE
  LIMIT 1
)
WHERE workspace_id IS NULL;

DELETE FROM user_shared_knowledge WHERE workspace_id IS NULL;

ALTER TABLE user_shared_knowledge ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_shared_knowledge_workspace
  ON user_shared_knowledge(user_id, workspace_id, confidence DESC);

DROP POLICY IF EXISTS "Users can manage their own shared knowledge" ON user_shared_knowledge;
DROP POLICY IF EXISTS "Service role full access to shared knowledge" ON user_shared_knowledge;

CREATE POLICY "Users can manage workspace shared knowledge" ON user_shared_knowledge
  FOR ALL USING (
    auth.uid() = user_id
    AND workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to shared knowledge" ON user_shared_knowledge
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 10. task_execution_patterns — add workspace_id (if table exists)
-- ============================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'task_execution_patterns'
  ) THEN
    ALTER TABLE task_execution_patterns
      ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

    UPDATE task_execution_patterns
    SET workspace_id = (
      SELECT id FROM workspaces
      WHERE owner_id = task_execution_patterns.user_id AND is_personal = TRUE
      LIMIT 1
    )
    WHERE workspace_id IS NULL;

    DELETE FROM task_execution_patterns WHERE workspace_id IS NULL;

    ALTER TABLE task_execution_patterns ALTER COLUMN workspace_id SET NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_task_patterns_workspace
      ON task_execution_patterns(user_id, workspace_id);
  END IF;
END $$;

-- ============================================================
-- 11. learning_applications — add workspace_id (if table exists)
-- ============================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'learning_applications'
  ) THEN
    ALTER TABLE learning_applications
      ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

    UPDATE learning_applications
    SET workspace_id = (
      SELECT id FROM workspaces
      WHERE owner_id = learning_applications.user_id AND is_personal = TRUE
      LIMIT 1
    )
    WHERE workspace_id IS NULL;

    DELETE FROM learning_applications WHERE workspace_id IS NULL;

    ALTER TABLE learning_applications ALTER COLUMN workspace_id SET NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_learning_applications_workspace
      ON learning_applications(user_id, workspace_id);
  END IF;
END $$;
