-- Extensions used by the default Postgres search/FTS and locale-insensitive
-- lookups (docs/PROJECT_SPEC.md §3.3). `unaccent` may be unavailable on some
-- managed hosts (e.g. certain Neon/Supabase plans) — the search provider must
-- degrade gracefully without it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
  RAISE NOTICE 'unaccent extension unavailable; continuing without it';
END $$;
