-- Add ai_name to workspaces table for workspace-scoped AI personalization
-- Each workspace can have its own AI assistant name

ALTER TABLE workspaces 
ADD COLUMN IF NOT EXISTS ai_name TEXT;

COMMENT ON COLUMN workspaces.ai_name IS 'Custom name for the AI assistant in this workspace';

-- Migrate existing user ai_name to their personal workspace
UPDATE workspaces w
SET ai_name = p.ai_name
FROM profiles p
WHERE w.owner_id = p.id
  AND w.is_personal = TRUE
  AND p.ai_name IS NOT NULL
  AND w.ai_name IS NULL;
