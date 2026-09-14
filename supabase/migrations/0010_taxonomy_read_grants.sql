-- 0010_taxonomy_read_grants.sql
-- Purpose: Phase 9 production-blocker investigation. Every prior
-- migration relies entirely on Supabase's own default project-level
-- privilege configuration (which normally grants baseline SELECT on
-- all `public` schema tables to `anon`/`authenticated` automatically)
-- rather than an explicit GRANT anywhere in this repository. That
-- assumption is standard and almost always correct for Supabase
-- projects, but it was never verified against the hosted staging
-- project specifically, and could not be proven or disproven through
-- static code inspection alone.
--
-- This migration is DEFENSIVE, not a confirmed root-cause fix. The
-- confirmed root cause of the Phase 9 taxonomy-loading production bug
-- was an application-layer error-swallowing bug (every taxonomy field
-- did `X.data ?? []`, silently converting ANY Supabase error into an
-- indistinguishable empty array -- fixed in
-- lib/contribute/taxonomies.ts). This migration additionally closes a
-- plausible, low-risk gap in case a missing base GRANT was ALSO
-- contributing, without needing hosted access to confirm it either
-- way.
--
-- Safety: this can never weaken access. RLS policies (0007, 0008)
-- still gate which ROWS are visible -- this only ensures the querying
-- role is allowed to attempt a SELECT on the TABLE at all, which is a
-- precondition RLS depends on, not a replacement for it. Every table
-- granted here already has a "public read active rows" RLS policy
-- with no restrictive `to` clause (defaults to PUBLIC). If Supabase's
-- default privileges already cover this, these GRANTs are no-ops.

grant usage on schema public to anon, authenticated;

grant select on
  platforms,
  campaign_types,
  objectives,
  verticals,
  audience_strategies,
  funnel_stages,
  countries,
  business_models,
  metrics,
  metric_definition_variants,
  platform_metrics,
  platform_metric_compatible_variants,
  benchmark_settings
to anon, authenticated;
