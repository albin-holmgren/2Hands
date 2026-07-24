-- ============================================================================
-- v3 Slice 3 — Account Broker + Secret Broker storage
--
-- provider_manifests, provider_accounts, provider_connections,
-- provider_capability_grants, auth_runs, auth_events (append-only),
-- protected_secrets + secret_leases (private schema — no client access),
-- browser_sessions, browser_contexts (private), verification_expectations,
-- verification_events (append-only), terms_documents, consent_receipts
-- (append-only).
--
-- Contracts: specs/account-broker.types.ts (frozen).
-- ============================================================================

-- ============================================================================
-- 1. Private schema for secret material — NOT exposed through PostgREST.
--    supabase/config.toml api.schemas only exposes public/graphql_public/storage,
--    so nothing in `private` is reachable by anon/authenticated clients at all.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO service_role;

-- ============================================================================
-- 2. provider_manifests — versioned, reviewed provider policy
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('enabled', 'beta', 'allowlisted', 'disabled', 'coming_soon')),
  -- Full manifest document validated against provider-auth-manifest.schema.json.
  manifest JSONB NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, version)
);

DROP TRIGGER IF EXISTS trg_provider_manifests_touch ON public.provider_manifests;
CREATE TRIGGER trg_provider_manifests_touch
  BEFORE UPDATE ON public.provider_manifests
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

-- Manifests are global (not tenant rows): readable by all authenticated users.
ALTER TABLE public.provider_manifests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view manifests" ON public.provider_manifests;
CREATE POLICY "Authenticated can view manifests" ON public.provider_manifests
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service role full access manifests" ON public.provider_manifests;
CREATE POLICY "Service role full access manifests" ON public.provider_manifests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. provider_accounts and provider_connections
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  external_account_label TEXT,
  account_owner TEXT NOT NULL DEFAULT 'user' CHECK (account_owner IN ('user', 'workspace', '2hands')),
  billing_owner TEXT NOT NULL DEFAULT 'user' CHECK (billing_owner IN ('user', 'workspace', '2hands')),
  mode TEXT NOT NULL CHECK (mode IN
    ('2hands_managed_api', 'user_oauth', 'user_api_key', 'user_browser_session',
     'assisted_signup', 'enterprise_sso', 'unsupported')),
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'needs_reauth', 'revoked', 'error')),
  granted_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  granted_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Opaque references into private storage; never the material itself.
  token_ref TEXT,
  browser_context_ref TEXT,
  plan_metadata JSONB,
  terms_consent_receipt_id UUID,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_workspace
  ON public.provider_accounts(workspace_id, provider_id, status);

DROP TRIGGER IF EXISTS trg_provider_accounts_touch ON public.provider_accounts;
CREATE TRIGGER trg_provider_accounts_touch
  BEFORE UPDATE ON public.provider_accounts
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_account_id UUID NOT NULL REFERENCES public.provider_accounts(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'degraded', 'revoked')),
  health_checked_at TIMESTAMPTZ,
  health_detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_account_id, capability)
);

DROP TRIGGER IF EXISTS trg_provider_connections_touch ON public.provider_connections;
CREATE TRIGGER trg_provider_connections_touch
  BEFORE UPDATE ON public.provider_connections
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.provider_capability_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  provider_account_id UUID NOT NULL REFERENCES public.provider_accounts(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  mode TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_capability_grants_lookup
  ON public.provider_capability_grants(workspace_id, provider_account_id, capability);

-- ============================================================================
-- 4. auth_runs + auth_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auth_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  provider_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  selected_mode TEXT
    CHECK (selected_mode IS NULL OR selected_mode IN
      ('2hands_managed_api', 'user_oauth', 'user_api_key', 'user_browser_session',
       'assisted_signup', 'enterprise_sso', 'unsupported')),
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN
      ('created', 'selecting_method', 'awaiting_oauth', 'awaiting_secure_input',
       'browser_running', 'awaiting_email_verification', 'awaiting_user_takeover',
       'awaiting_terms', 'awaiting_payment', 'validating_session',
       'completed', 'failed', 'cancelled', 'expired')),
  browser_session_id UUID,
  verification_expectation_id UUID,
  provider_account_id UUID REFERENCES public.provider_accounts(id) ON DELETE SET NULL,
  safe_error JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_runs_workspace ON public.auth_runs(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_runs_task ON public.auth_runs(task_id) WHERE task_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_auth_runs_touch ON public.auth_runs;
CREATE TRIGGER trg_auth_runs_touch
  BEFORE UPDATE ON public.auth_runs
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_run_id UUID NOT NULL REFERENCES public.auth_runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  sequence BIGINT NOT NULL,
  actor_kind TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_kind IN ('user', '2hands', 'agent', 'connector', 'system')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Safe payload only: field IDs and state, never values/lengths/hashes.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (auth_run_id, sequence)
);

DROP TRIGGER IF EXISTS trg_auth_events_append_only ON public.auth_events;
CREATE TRIGGER trg_auth_events_append_only
  BEFORE UPDATE OR DELETE ON public.auth_events
  FOR EACH ROW EXECUTE FUNCTION public.v3_forbid_mutation();

-- ============================================================================
-- 5. Auth-run state machine enforcement
-- ============================================================================

CREATE OR REPLACE FUNCTION public.v3_is_legal_auth_transition(p_from TEXT, p_to TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_from
    WHEN 'created' THEN p_to IN ('selecting_method', 'failed', 'cancelled', 'expired')
    WHEN 'selecting_method' THEN p_to IN
      ('awaiting_oauth', 'awaiting_secure_input', 'browser_running',
       'awaiting_email_verification', 'awaiting_user_takeover', 'awaiting_terms',
       'awaiting_payment', 'validating_session', 'failed', 'cancelled', 'expired')
    WHEN 'awaiting_oauth' THEN p_to IN
      ('validating_session', 'awaiting_email_verification', 'awaiting_user_takeover',
       'awaiting_terms', 'failed', 'cancelled', 'expired')
    WHEN 'awaiting_secure_input' THEN p_to IN
      ('browser_running', 'awaiting_email_verification', 'validating_session',
       'awaiting_user_takeover', 'failed', 'cancelled', 'expired')
    WHEN 'browser_running' THEN p_to IN
      ('awaiting_secure_input', 'awaiting_email_verification', 'awaiting_user_takeover',
       'awaiting_terms', 'awaiting_payment', 'validating_session', 'failed', 'cancelled', 'expired')
    WHEN 'awaiting_email_verification' THEN p_to IN
      ('browser_running', 'validating_session', 'awaiting_user_takeover', 'failed', 'cancelled', 'expired')
    WHEN 'awaiting_user_takeover' THEN p_to IN
      ('browser_running', 'awaiting_email_verification', 'awaiting_terms',
       'awaiting_payment', 'validating_session', 'failed', 'cancelled', 'expired')
    WHEN 'awaiting_terms' THEN p_to IN
      ('awaiting_payment', 'browser_running', 'validating_session', 'failed', 'cancelled', 'expired')
    WHEN 'awaiting_payment' THEN p_to IN
      ('awaiting_user_takeover', 'validating_session', 'failed', 'cancelled', 'expired')
    WHEN 'validating_session' THEN p_to IN ('completed', 'awaiting_email_verification',
      'awaiting_user_takeover', 'failed', 'cancelled', 'expired')
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION public.v3_transition_auth_run(
  p_auth_run_id UUID,
  p_expected_status TEXT,
  p_new_status TEXT,
  p_event_type TEXT DEFAULT NULL,
  p_actor_kind TEXT DEFAULT 'system',
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (auth_run_id UUID, old_status TEXT, new_status TEXT, event_sequence BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row auth_runs%ROWTYPE;
  v_seq BIGINT;
BEGIN
  SELECT * INTO v_row FROM auth_runs a WHERE a.id = p_auth_run_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'v3_transition_auth_run: run % not found', p_auth_run_id;
  END IF;
  IF v_row.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'v3_transition_auth_run: stale transition for %: expected %, found %',
      p_auth_run_id, p_expected_status, v_row.status;
  END IF;
  IF NOT v3_is_legal_auth_transition(v_row.status, p_new_status) THEN
    RAISE EXCEPTION 'v3_transition_auth_run: illegal transition % -> %', v_row.status, p_new_status;
  END IF;

  UPDATE auth_runs
  SET status = p_new_status,
      safe_error = CASE WHEN p_new_status = 'failed' THEN COALESCE(p_payload->'safeError', safe_error) ELSE safe_error END
  WHERE id = p_auth_run_id;

  SELECT COALESCE(MAX(sequence), 0) + 1 INTO v_seq FROM auth_events WHERE auth_events.auth_run_id = p_auth_run_id;
  INSERT INTO auth_events (auth_run_id, workspace_id, type, sequence, actor_kind, payload)
  VALUES (p_auth_run_id, v_row.workspace_id,
          COALESCE(p_event_type, 'auth.' || p_new_status), v_seq, p_actor_kind, COALESCE(p_payload, '{}'::jsonb));

  RETURN QUERY SELECT p_auth_run_id, v_row.status, p_new_status, v_seq;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_transition_auth_run FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_transition_auth_run TO service_role;

-- ============================================================================
-- 6. Protected secrets + leases (private schema; no PostgREST exposure)
-- ============================================================================

CREATE TABLE IF NOT EXISTS private.protected_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_ref TEXT NOT NULL UNIQUE,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  auth_run_id UUID,
  request_id TEXT NOT NULL,
  field_kind TEXT NOT NULL
    CHECK (field_kind IN ('username', 'email', 'password', 'otp', 'magic_link', 'api_key')),
  retention TEXT NOT NULL DEFAULT 'ephemeral'
    CHECK (retention IN ('ephemeral', 'session', 'durable_user_opt_in')),
  key_id TEXT NOT NULL,
  salt_hex TEXT NOT NULL,
  nonce_hex TEXT NOT NULL,
  ciphertext_hex TEXT NOT NULL,
  -- AAD context (safe metadata; participates in authentication).
  aad_context JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  destroyed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_protected_secrets_run ON private.protected_secrets(auth_run_id);
CREATE INDEX IF NOT EXISTS idx_protected_secrets_expiry ON private.protected_secrets(expires_at)
  WHERE destroyed_at IS NULL;

CREATE TABLE IF NOT EXISTS private.secret_leases (
  id TEXT PRIMARY KEY,
  secret_ref TEXT NOT NULL REFERENCES private.protected_secrets(secret_ref) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  task_id UUID,
  auth_run_id UUID NOT NULL,
  provider_id TEXT NOT NULL,
  browser_session_id UUID NOT NULL,
  allowed_origins JSONB NOT NULL,
  field_semantic TEXT NOT NULL
    CHECK (field_semantic IN ('username', 'email', 'password', 'otp', 'api_key')),
  purpose TEXT NOT NULL CHECK (purpose IN ('login', 'signup', 'verification', 'api_key_setup')),
  maximum_uses INTEGER NOT NULL DEFAULT 1 CHECK (maximum_uses = 1),
  uses INTEGER NOT NULL DEFAULT 0,
  nonce TEXT NOT NULL,
  signature TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Atomic single-use consumption: returns TRUE exactly once per lease.
CREATE OR REPLACE FUNCTION public.v3_consume_secret_lease(p_lease_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE private.secret_leases
  SET uses = uses + 1, consumed_at = NOW()
  WHERE id = p_lease_id
    AND uses < maximum_uses
    AND expires_at > NOW();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_consume_secret_lease FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_consume_secret_lease TO service_role;

-- Destroy ephemeral secrets after use/expiry (cron-safe).
CREATE OR REPLACE FUNCTION public.v3_destroy_expired_secrets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE private.protected_secrets
  SET ciphertext_hex = '', salt_hex = '', nonce_hex = '', destroyed_at = NOW()
  WHERE destroyed_at IS NULL AND expires_at <= NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_destroy_expired_secrets FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_destroy_expired_secrets TO service_role;

-- ============================================================================
-- 7. Browser sessions and contexts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.browser_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  auth_run_id UUID REFERENCES public.auth_runs(id) ON DELETE SET NULL,
  provider_id TEXT NOT NULL,
  browser_provider TEXT NOT NULL,
  provider_session_ref TEXT,
  purpose TEXT NOT NULL DEFAULT 'authentication',
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('starting', 'running', 'awaiting_takeover', 'stopped', 'failed', 'expired')),
  -- Recording is architecturally disabled for auth sessions.
  recording_disabled BOOLEAN NOT NULL DEFAULT TRUE CHECK (recording_disabled = TRUE),
  live_view_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_browser_sessions_touch ON public.browser_sessions;
CREATE TRIGGER trg_browser_sessions_touch
  BEFORE UPDATE ON public.browser_sessions
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

-- Encrypted persistent browser contexts (cookies/storage state) — private.
CREATE TABLE IF NOT EXISTS private.browser_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_ref TEXT NOT NULL UNIQUE,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  provider_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  salt_hex TEXT NOT NULL,
  nonce_hex TEXT NOT NULL,
  ciphertext_hex TEXT NOT NULL,
  aad_context JSONB NOT NULL,
  validated_at TIMESTAMPTZ,
  destroyed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id, provider_id)
);

-- ============================================================================
-- 8. Verification expectations + events
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.verification_expectations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_run_id UUID NOT NULL REFERENCES public.auth_runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  target_email TEXT NOT NULL,
  allowed_sender_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject_hints JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_types JSONB NOT NULL DEFAULT '["otp"]'::jsonb,
  not_before TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  maximum_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  use_policy TEXT NOT NULL DEFAULT 'ask_each_time'
    CHECK (use_policy IN ('manual', 'ask_each_time', 'automatic_if_policy_allows')),
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'candidate_found', 'approved', 'consumed', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_verification_expectations_touch ON public.verification_expectations;
CREATE TRIGGER trg_verification_expectations_touch
  BEFORE UPDATE ON public.verification_expectations
  FOR EACH ROW EXECUTE FUNCTION public.v3_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expectation_id UUID NOT NULL REFERENCES public.verification_expectations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  -- Safe metadata only: sender domain, subject hash, decision — never codes/links.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_verification_events_append_only ON public.verification_events;
CREATE TRIGGER trg_verification_events_append_only
  BEFORE UPDATE OR DELETE ON public.verification_events
  FOR EACH ROW EXECUTE FUNCTION public.v3_forbid_mutation();

-- ============================================================================
-- 9. Terms documents + consent receipts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.terms_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id TEXT NOT NULL,
  terms_url TEXT,
  privacy_url TEXT,
  version_label TEXT,
  content_hash TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, content_hash)
);

CREATE TABLE IF NOT EXISTS public.consent_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  auth_run_id UUID REFERENCES public.auth_runs(id) ON DELETE SET NULL,
  provider_account_id UUID REFERENCES public.provider_accounts(id) ON DELETE SET NULL,
  terms_document_id UUID REFERENCES public.terms_documents(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'terms' CHECK (kind IN ('terms', 'payment', 'data_sharing')),
  summary TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_consent_receipts_append_only ON public.consent_receipts;
CREATE TRIGGER trg_consent_receipts_append_only
  BEFORE UPDATE OR DELETE ON public.consent_receipts
  FOR EACH ROW EXECUTE FUNCTION public.v3_forbid_mutation();

-- ============================================================================
-- 10. RLS for the public account-broker tables
-- ============================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'provider_accounts', 'provider_connections', 'provider_capability_grants',
    'auth_runs', 'auth_events', 'browser_sessions',
    'verification_expectations', 'verification_events', 'consent_receipts'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Members can view workspace %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Members can view workspace %s" ON public.%I FOR SELECT TO authenticated
         USING (user_belongs_to_workspace(auth.uid(), workspace_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Service role full access %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Service role full access %s" ON public.%I FOR ALL TO service_role
         USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- terms_documents are global reference data.
ALTER TABLE public.terms_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view terms documents" ON public.terms_documents;
CREATE POLICY "Authenticated can view terms documents" ON public.terms_documents
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service role full access terms documents" ON public.terms_documents;
CREATE POLICY "Service role full access terms documents" ON public.terms_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Private-schema tables: enable RLS as defense in depth even though the
-- schema is not exposed and has no client grants.
ALTER TABLE private.protected_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.secret_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.browser_contexts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only protected_secrets" ON private.protected_secrets;
CREATE POLICY "Service role only protected_secrets" ON private.protected_secrets
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role only secret_leases" ON private.secret_leases;
CREATE POLICY "Service role only secret_leases" ON private.secret_leases
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role only browser_contexts" ON private.browser_contexts;
CREATE POLICY "Service role only browser_contexts" ON private.browser_contexts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON ALL TABLES IN SCHEMA private TO service_role;
