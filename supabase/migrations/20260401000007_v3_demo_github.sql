-- ============================================================================
-- v3 Slice 7 — Demo GitHub publication adapter storage.
--
-- Deterministic fake publication target for dev/CI ("Demo GitHub"): records
-- branch pushes and draft PRs with exactly-once semantics so the golden path
-- can prove approval-gated, idempotent publication with zero external calls.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.demo_github_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  approval_id UUID REFERENCES public.approvals(id) ON DELETE SET NULL,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  pr_number INTEGER,
  pr_title TEXT,
  pr_draft BOOLEAN NOT NULL DEFAULT TRUE,
  diff_summary TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_demo_github_pubs_workspace
  ON public.demo_github_publications(workspace_id, created_at DESC);

ALTER TABLE public.demo_github_publications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view workspace demo_github_publications" ON public.demo_github_publications;
CREATE POLICY "Members can view workspace demo_github_publications" ON public.demo_github_publications
  FOR SELECT TO authenticated
  USING (user_belongs_to_workspace(auth.uid(), workspace_id));
DROP POLICY IF EXISTS "Service role full access demo_github_publications" ON public.demo_github_publications;
CREATE POLICY "Service role full access demo_github_publications" ON public.demo_github_publications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Publications are immutable records.
DROP TRIGGER IF EXISTS trg_demo_github_pubs_append_only ON public.demo_github_publications;
CREATE TRIGGER trg_demo_github_pubs_append_only
  BEFORE UPDATE OR DELETE ON public.demo_github_publications
  FOR EACH ROW EXECUTE FUNCTION public.v3_forbid_mutation();

-- Deterministic per-workspace PR numbering.
CREATE OR REPLACE FUNCTION public.v3_next_demo_pr_number(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  SELECT COALESCE(MAX(pr_number), 0) + 1 INTO v_next
  FROM demo_github_publications
  WHERE workspace_id = p_workspace_id;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_next_demo_pr_number FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_next_demo_pr_number TO service_role;
