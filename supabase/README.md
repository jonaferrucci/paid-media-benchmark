# Supabase — Phase 2 Foundation

This directory contains the production-ready database foundation approved
in Architecture Freeze V1. It does **not** implement the benchmark engine,
production authentication, or API integrations — those are later phases.

## Setup (real project)

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and fill in your project's URL, anon
   key, and service role key.
3. Link the CLI to your project: `npx supabase link --project-ref <ref>`
4. Push the migrations: `npx supabase db push`
5. Apply the seed data: `npx supabase db execute -f supabase/seed.sql`
   (or include it in your db push flow per your team's convention)

## Migration order

Migrations are numbered and must be applied in order:

```
0001_extensions_and_enums.sql       Extensions + shared enum types
0002_taxonomies.sql                 platforms, campaign_types, objectives,
                                     verticals, audience_strategies,
                                     funnel_stages, countries
0003_metrics.sql                    metrics, metric_definition_variants,
                                     platform_metrics,
                                     platform_metric_compatible_variants
0004_performance_datasets.sql       profiles, organizations,
                                     organization_members,
                                     performance_datasets,
                                     fn_normalized_monthly_spend()
0005_dataset_metric_values.sql      dataset_metric_values,
                                     normalized_metric_values
0006_benchmark_settings.sql         benchmark_settings (+ 3 seeded rows)
0007_row_level_security.sql         RLS enabled + policies on every table
0008_add_business_models.sql        business_models taxonomy,
                                     performance_datasets.business_model_id
                                     (Phase 2.2, purely additive)
```

`seed.sql` (repo root of this directory) is reference/taxonomy data only —
platforms, objectives, verticals, audience strategies, funnel stages,
countries, metrics, metric definition variants, and platform/metric
compatibility. It contains **no** fake performance observations; the
frontend's mock benchmark numbers (`lib/mock/*.ts`) remain entirely
separate and are unaffected by this database.

## How this was actually tested in this environment

This sandbox has no Docker, so `supabase start` (the full local stack) and
`supabase gen types typescript` (which also needs a Docker helper
container) could not run. Instead:

- A real PostgreSQL 16 server was installed and run directly (not via the
  Supabase CLI's Docker-based local stack).
- A minimal `auth` schema and `auth.users` stub table were created, plus a
  SQL stub of `auth.uid()` matching Supabase's real implementation
  (reads `request.jwt.claim.sub` from the session), so RLS policies could
  be tested exactly as they'll behave against a real Supabase project.
- All 7 migrations were applied in order against this real database with
  zero errors.
- `seed.sql` was applied with zero errors.
- Verified with live queries, not just read by eye:
  - The YouTube mapping produces zero `platforms` rows containing
    "youtube" and one `campaign_types` row (`video_youtube`) scoped to
    `google_ads`.
  - Every metric with variants has exactly one `is_unknown_default` row
    (enforced by a partial unique index, not just convention).
  - `fn_normalized_monthly_spend()` returns the correct value for normal
    input and `null` (not a divide-by-zero error) for zero duration.
  - `objectives` contains separate `awareness` and `reach` rows.
  - RLS actually blocks: a low-privilege role with no session sees 0
    `performance_datasets` rows and 0 rows belonging to a different
    simulated user, but the correct 1 row when the session matches the
    true owner — and public taxonomy tables remain readable throughout.
  - Constraint enforcement: an `end_date` before `start_date`, a
    `max_age` below `min_age`, and a duplicate `(dataset_id, metric_id)`
    with no variant were all correctly rejected by the database.

What this does **not** verify: Supabase-specific behavior outside plain
PostgreSQL (Supabase Auth's actual JWT issuance/verification, Realtime,
Storage, the hosted API gateway's PostgREST layer, or `supabase db push`
against a real hosted project). Those require either Docker locally or an
actual Supabase project and should be smoke-tested before Phase 3 relies
on them.

## Regenerating TypeScript types for real

`lib/supabase/database.types.ts` is hand-written in this phase (Docker
unavailable here). Once Docker or a live project is available:

```bash
npx supabase gen types typescript --db-url "<connection-string>" > lib/supabase/database.types.ts
# or, against a linked hosted project:
npx supabase gen types typescript --project-id <ref> > lib/supabase/database.types.ts
```
