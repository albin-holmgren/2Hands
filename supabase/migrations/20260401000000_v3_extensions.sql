-- v3 Slice 2: required extensions.
-- pgvector was previously only implicit (memory_notes uses vector(1536));
-- make the dependency explicit so `supabase db reset` is deterministic.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
