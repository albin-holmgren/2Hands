-- ============================================================================
-- v3 Slice 3 — Secure Input challenges + demo inbox fixture
--
-- private.secure_input_challenges: short-lived server challenge keypairs for
-- the isolated Secure Input flow. The challenge secret key is envelope-
-- encrypted at rest; the private schema is not exposed through PostgREST, so
-- all access goes through the SECURITY DEFINER helpers below (service_role
-- execute only), mirroring migration 20260401000003 §6/§10.
--
-- public.demo_inbox: deterministic fake-provider inbox fixture for the demo
-- auth flow. Clearly non-sensitive demo data; authenticated users may SELECT.
-- ============================================================================

-- ============================================================================
-- 1. private.secure_input_challenges
-- ============================================================================

CREATE TABLE IF NOT EXISTS private.secure_input_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL UNIQUE,
  auth_run_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  challenge_public_key_hex TEXT NOT NULL,
  -- Envelope-encrypted challenge secret key (StoredCiphertext JSON), never
  -- the raw key material.
  challenge_secret_key_hex TEXT NOT NULL,
  field_specs JSONB NOT NULL,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_secure_input_challenges_run
  ON private.secure_input_challenges(auth_run_id);
CREATE INDEX IF NOT EXISTS idx_secure_input_challenges_expiry
  ON private.secure_input_challenges(expires_at)
  WHERE consumed_at IS NULL;

-- Service-role-only, like the other private tables (defense in depth — the
-- schema itself is not exposed and has no anon/authenticated grants).
ALTER TABLE private.secure_input_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only secure_input_challenges" ON private.secure_input_challenges;
CREATE POLICY "Service role only secure_input_challenges" ON private.secure_input_challenges
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON private.secure_input_challenges TO service_role;

-- ============================================================================
-- 2. SECURITY DEFINER helpers — the private schema is not in PostgREST's
--    exposed schema list, so server routes reach it through these functions.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.v3_create_secure_input_challenge(
  p_request_id TEXT,
  p_auth_run_id UUID,
  p_workspace_id UUID,
  p_user_id UUID,
  p_challenge_public_key_hex TEXT,
  p_challenge_secret_key_hex TEXT,
  p_field_specs JSONB,
  p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO private.secure_input_challenges
    (request_id, auth_run_id, workspace_id, user_id,
     challenge_public_key_hex, challenge_secret_key_hex, field_specs, expires_at)
  VALUES
    (p_request_id, p_auth_run_id, p_workspace_id, p_user_id,
     p_challenge_public_key_hex, p_challenge_secret_key_hex, p_field_specs, p_expires_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_create_secure_input_challenge FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_create_secure_input_challenge TO service_role;

CREATE OR REPLACE FUNCTION public.v3_load_secure_input_challenge(p_request_id TEXT)
RETURNS TABLE (
  id UUID,
  request_id TEXT,
  auth_run_id UUID,
  workspace_id UUID,
  user_id UUID,
  challenge_public_key_hex TEXT,
  challenge_secret_key_hex TEXT,
  field_specs JSONB,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT c.id, c.request_id, c.auth_run_id, c.workspace_id, c.user_id,
         c.challenge_public_key_hex, c.challenge_secret_key_hex, c.field_specs,
         c.consumed_at, c.expires_at, c.created_at
  FROM private.secure_input_challenges c
  WHERE c.request_id = p_request_id;
$$;

REVOKE ALL ON FUNCTION public.v3_load_secure_input_challenge FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_load_secure_input_challenge TO service_role;

-- Atomic single-use consumption: returns TRUE exactly once per challenge.
CREATE OR REPLACE FUNCTION public.v3_consume_secure_input_challenge(p_request_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE private.secure_input_challenges
  SET consumed_at = NOW()
  WHERE request_id = p_request_id
    AND consumed_at IS NULL
    AND expires_at > NOW();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_consume_secure_input_challenge FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_consume_secure_input_challenge TO service_role;

-- Store one envelope-encrypted protected secret; returns the row id.
CREATE OR REPLACE FUNCTION public.v3_insert_protected_secret(
  p_secret_ref TEXT,
  p_workspace_id UUID,
  p_user_id UUID,
  p_auth_run_id UUID,
  p_request_id TEXT,
  p_field_kind TEXT,
  p_retention TEXT,
  p_key_id TEXT,
  p_salt_hex TEXT,
  p_nonce_hex TEXT,
  p_ciphertext_hex TEXT,
  p_aad_context JSONB,
  p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO private.protected_secrets
    (secret_ref, workspace_id, user_id, auth_run_id, request_id, field_kind,
     retention, key_id, salt_hex, nonce_hex, ciphertext_hex, aad_context, expires_at)
  VALUES
    (p_secret_ref, p_workspace_id, p_user_id, p_auth_run_id, p_request_id, p_field_kind,
     p_retention, p_key_id, p_salt_hex, p_nonce_hex, p_ciphertext_hex, p_aad_context, p_expires_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.v3_insert_protected_secret FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v3_insert_protected_secret TO service_role;

-- ============================================================================
-- 3. public.demo_inbox — deterministic fake-provider inbox (demo fixture)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.demo_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email TEXT NOT NULL,
  from_domain TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  kind TEXT CHECK (kind IN ('otp', 'magic_link', 'other')) DEFAULT 'other',
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_inbox_recipient
  ON public.demo_inbox(to_email, created_at DESC);

ALTER TABLE public.demo_inbox ENABLE ROW LEVEL SECURITY;
-- Demo fixture, clearly non-sensitive: any authenticated user may read.
DROP POLICY IF EXISTS "Authenticated can view demo inbox" ON public.demo_inbox;
CREATE POLICY "Authenticated can view demo inbox" ON public.demo_inbox
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service role full access demo inbox" ON public.demo_inbox;
CREATE POLICY "Service role full access demo inbox" ON public.demo_inbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);
