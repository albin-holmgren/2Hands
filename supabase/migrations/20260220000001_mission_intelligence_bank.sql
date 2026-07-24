-- ============================================================
-- Mission Intelligence Bank
-- Cross-mission shared knowledge store so every mission can
-- read findings from every other mission in the same workspace.
-- ============================================================

CREATE TABLE IF NOT EXISTS mission_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_mission_id UUID REFERENCES missions(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'competitor', 'customer', 'market', 'product', 'metric',
    'tactic', 'investor', 'partner', 'technology', 'code', 'other'
  )),
  fact TEXT NOT NULL,
  confidence NUMERIC DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  source_url TEXT,
  tags TEXT[] DEFAULT '{}',
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mission_intelligence_workspace ON mission_intelligence(workspace_id);
CREATE INDEX idx_mission_intelligence_category  ON mission_intelligence(workspace_id, category);
CREATE INDEX idx_mission_intelligence_mission   ON mission_intelligence(source_mission_id);
CREATE INDEX idx_mission_intelligence_created   ON mission_intelligence(created_at DESC);

ALTER TABLE mission_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view mission intelligence"
  ON mission_intelligence FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage mission intelligence"
  ON mission_intelligence FOR ALL
  USING (true)
  WITH CHECK (true);
