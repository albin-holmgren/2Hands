-- v3 Slice 2 hotfix — fresh-database signups were broken.
--
-- 20260121000002 created create_user_settings() inserting user_settings with
-- only user_id; 20260217000001+ made user_settings.workspace_id NOT NULL but
-- never updated the trigger. On any clean `supabase db reset`, every signup
-- fails with "null value in column workspace_id".
--
-- Fix: the trigger now ensures the personal workspace exists first (reusing
-- ensure_personal_workspace) and scopes the settings row to it.

CREATE OR REPLACE FUNCTION public.create_user_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  -- Creates the personal workspace + membership when missing; returns its id.
  BEGIN
    v_workspace_id := ensure_personal_workspace(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    v_workspace_id := NULL;
  END;

  -- Both tables carry NOT NULL workspace_id since the workspace-scoping
  -- migrations; skip (rather than abort signup) if no workspace resolves.
  IF v_workspace_id IS NOT NULL THEN
    INSERT INTO public.user_settings (user_id, workspace_id)
    VALUES (NEW.id, v_workspace_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.notification_preferences (user_id, workspace_id)
    VALUES (NEW.id, v_workspace_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
