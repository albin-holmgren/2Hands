-- ============================================================================
-- v3 Slice 9a — canonical memory_items with lifecycle + hybrid retrieval
--
-- MemoryItem lifecycle: proposed → active | rejected → expired.
-- Sensitivity gate: 'secret' rows never leave the retrieval RPC; credential-
-- like content is additionally rejected at storage time in the service layer.
-- Retrieval is hybrid FTS + confidence + recency + usefulness (+ pinned
-- boost). The semantic (embedding) component only participates when an
-- embeddings provider is configured; the column stays NULL otherwise.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'workspace' CHECK (scope IN ('user', 'workspace', 'project')),
  type TEXT NOT NULL CHECK (type IN ('profile', 'project', 'episodic', 'skill', 'fact')),
  content TEXT NOT NULL,
  source_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  source_kind TEXT,
  confidence NUMERIC NOT NULL DEFAULT 0.7,
  sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal', 'sensitive', 'secret')),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'active', 'rejected', 'expired')),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  embedding vector(1536),
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  usefulness NUMERIC NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  review_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_items_workspace_status
  ON public.memory_items(workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_items_tsv
  ON public.memory_items USING GIN (content_tsv);

-- HNSW when the installed pgvector supports it (>= 0.5.0), ivfflat otherwise.
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_memory_items_embedding
             ON public.memory_items USING hnsw (embedding vector_cosine_ops)';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_memory_items_embedding
             ON public.memory_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
  END;
END $$;

-- ----------------------------------------------------------------------------
-- 2. updated_at trigger (shared v3 helper from 20260401000001)
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_memory_items_touch_updated_at ON public.memory_items;
CREATE TRIGGER trg_memory_items_touch_updated_at
  BEFORE UPDATE ON public.memory_items
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. RLS — members read their workspace rows; all writes are privileged
--    (lifecycle transitions go through the service layer with service role).
-- ----------------------------------------------------------------------------

ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view workspace memory_items" ON public.memory_items;
CREATE POLICY "Members can view workspace memory_items" ON public.memory_items
  FOR SELECT TO authenticated
  USING (user_belongs_to_workspace(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Service role full access memory_items" ON public.memory_items;
CREATE POLICY "Service role full access memory_items" ON public.memory_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 4. Hybrid retrieval RPC. Hard filters first (workspace, active, not secret,
--    not expired), then score:
--      0.40 semantic  — contributes 0 unless an embedding is present AND a
--                       query embedding is passed (EMBEDDINGS_PROVIDER set);
--      0.25 FTS       — ts_rank over content_tsv vs plainto_tsquery;
--      0.15 confidence;
--      0.10 recency   — 30-day exponential decay;
--      0.10 usefulness;
--      +0.25 pinned boost (pinned items also match without an FTS hit).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.v3_retrieve_memories(
  p_workspace_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 8,
  p_query_embedding vector(1536) DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  type TEXT,
  scope TEXT,
  sensitivity TEXT,
  confidence NUMERIC,
  usefulness NUMERIC,
  pinned BOOLEAN,
  source_task_id UUID,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  score NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id, m.content, m.type, m.scope, m.sensitivity, m.confidence,
    m.usefulness, m.pinned, m.source_task_id, m.last_used_at, m.created_at,
    (
      0.40 * CASE
        WHEN p_query_embedding IS NOT NULL AND m.embedding IS NOT NULL
          THEN GREATEST(1 - (m.embedding <=> p_query_embedding), 0)
        ELSE 0
      END
      + 0.25 * CASE
        WHEN p_query IS NOT NULL AND p_query <> ''
          THEN LEAST(ts_rank(m.content_tsv, plainto_tsquery('english', p_query)), 1)
        ELSE 0
      END
      + 0.15 * LEAST(GREATEST(m.confidence, 0), 1)
      + 0.10 * EXP(-EXTRACT(EPOCH FROM (NOW() - m.created_at)) / (30 * 86400.0))
      + 0.10 * LEAST(GREATEST(m.usefulness, 0), 1)
      + CASE WHEN m.pinned THEN 0.25 ELSE 0 END
    )::NUMERIC AS score
  FROM public.memory_items m
  WHERE m.workspace_id = p_workspace_id
    AND m.status = 'active'
    AND m.sensitivity <> 'secret'
    AND (m.expires_at IS NULL OR m.expires_at > NOW())
    AND (
      m.pinned
      OR (p_query_embedding IS NOT NULL AND m.embedding IS NOT NULL)
      OR (
        p_query IS NOT NULL AND p_query <> ''
        AND m.content_tsv @@ plainto_tsquery('english', p_query)
      )
    )
  ORDER BY score DESC, m.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.v3_retrieve_memories FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_retrieve_memories TO service_role;
