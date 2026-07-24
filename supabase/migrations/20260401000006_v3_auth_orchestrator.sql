-- ============================================================================
-- v3 Slice 3 — Auth orchestrator RPCs for the private secret schema
--
-- The `private` schema is not exposed through PostgREST (config.toml
-- api.schemas), so even the service-role client cannot touch
-- private.secret_leases / private.protected_secrets / private.browser_contexts
-- directly. The deterministic login orchestrator goes through these
-- SECURITY DEFINER functions instead — service_role only, and every function
-- returns/accepts envelope material and safe metadata, never plaintext.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Persist a signed one-time secret-injection lease.
--    The signature/nonce are computed in the control plane (signLease);
--    this row is what makes the lease single-use via v3_consume_secret_lease.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.v3_insert_secret_lease(
  p_lease_id TEXT,
  p_secret_ref TEXT,
  p_workspace_id UUID,
  p_user_id UUID,
  p_task_id UUID,
  p_auth_run_id UUID,
  p_provider_id TEXT,
  p_browser_session_id UUID,
  p_allowed_origins JSONB,
  p_field_semantic TEXT,
  p_purpose TEXT,
  p_nonce TEXT,
  p_signature TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  INSERT INTO private.secret_leases (
    id, secret_ref, workspace_id, user_id, task_id, auth_run_id, provider_id,
    browser_session_id, allowed_origins, field_semantic, purpose,
    maximum_uses, uses, nonce, signature, expires_at
  ) VALUES (
    p_lease_id, p_secret_ref, p_workspace_id, p_user_id, p_task_id,
    p_auth_run_id, p_provider_id, p_browser_session_id, p_allowed_origins,
    p_field_semantic, p_purpose, 1, 0, p_nonce, p_signature, p_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.v3_insert_secret_lease FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_insert_secret_lease TO service_role;

-- ----------------------------------------------------------------------------
-- 2. List live secret refs for an auth run (safe metadata only — refs and
--    field kinds, no envelope material).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.v3_list_auth_run_secret_refs(p_auth_run_id UUID)
RETURNS TABLE (secret_ref TEXT, field_kind TEXT, retention TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT s.secret_ref, s.field_kind, s.retention, s.expires_at
  FROM private.protected_secrets s
  WHERE s.auth_run_id = p_auth_run_id
    AND s.destroyed_at IS NULL
    AND s.expires_at > NOW()
  ORDER BY s.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.v3_list_auth_run_secret_refs FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_list_auth_run_secret_refs TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Load one live protected secret envelope by ref (ciphertext + AAD context;
--    decryption happens only inside the trusted injector boundary).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.v3_load_protected_secret(p_secret_ref TEXT)
RETURNS TABLE (
  secret_ref TEXT,
  workspace_id UUID,
  user_id UUID,
  auth_run_id UUID,
  request_id TEXT,
  field_kind TEXT,
  retention TEXT,
  key_id TEXT,
  salt_hex TEXT,
  nonce_hex TEXT,
  ciphertext_hex TEXT,
  aad_context JSONB,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT s.secret_ref, s.workspace_id, s.user_id, s.auth_run_id, s.request_id,
         s.field_kind, s.retention, s.key_id, s.salt_hex, s.nonce_hex,
         s.ciphertext_hex, s.aad_context, s.expires_at
  FROM private.protected_secrets s
  WHERE s.secret_ref = p_secret_ref
    AND s.destroyed_at IS NULL
    AND s.expires_at > NOW();
$$;

REVOKE ALL ON FUNCTION public.v3_load_protected_secret FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_load_protected_secret TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Store an encrypted browser context (storage state) after a validated
--    login. One live context per (workspace, user, provider); re-login
--    replaces it in place.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.v3_store_browser_context(
  p_context_ref TEXT,
  p_workspace_id UUID,
  p_user_id UUID,
  p_provider_id TEXT,
  p_key_id TEXT,
  p_salt_hex TEXT,
  p_nonce_hex TEXT,
  p_ciphertext_hex TEXT,
  p_aad_context JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
BEGIN
  INSERT INTO private.browser_contexts (
    context_ref, workspace_id, user_id, provider_id,
    key_id, salt_hex, nonce_hex, ciphertext_hex, aad_context,
    validated_at, destroyed_at, updated_at
  ) VALUES (
    p_context_ref, p_workspace_id, p_user_id, p_provider_id,
    p_key_id, p_salt_hex, p_nonce_hex, p_ciphertext_hex, p_aad_context,
    NOW(), NULL, NOW()
  )
  ON CONFLICT (workspace_id, user_id, provider_id) DO UPDATE SET
    context_ref = EXCLUDED.context_ref,
    key_id = EXCLUDED.key_id,
    salt_hex = EXCLUDED.salt_hex,
    nonce_hex = EXCLUDED.nonce_hex,
    ciphertext_hex = EXCLUDED.ciphertext_hex,
    aad_context = EXCLUDED.aad_context,
    validated_at = NOW(),
    destroyed_at = NULL,
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.v3_store_browser_context FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_store_browser_context TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Destroy the ephemeral protected secrets of a terminal auth run
--    (mirrors v3_destroy_expired_secrets, but keyed by run instead of expiry;
--    durable_user_opt_in secrets are left for their own retention window).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.v3_destroy_auth_run_secrets(p_auth_run_id UUID)
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
  WHERE auth_run_id = p_auth_run_id
    AND retention = 'ephemeral'
    AND destroyed_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_destroy_auth_run_secrets FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_destroy_auth_run_secrets TO service_role;
