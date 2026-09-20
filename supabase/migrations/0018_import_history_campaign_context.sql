-- 0018_import_history_campaign_context.sql
-- Purpose: Phase 25 — make imported campaign data identifiable,
-- traceable and reviewable, without touching benchmark methodology,
-- the adaptive import parser, or any existing table's meaning.
--
-- Two additive changes only:
--   1. performance_datasets.campaign_name — was review-only (never
--      persisted, see the CanonicalField "campaign_name" comment in
--      lib/import/types.ts) and stays identity/provenance metadata
--      only: never a benchmark cohort dimension, never exposed by the
--      public benchmark engine (lib/benchmark/engine.ts already never
--      selects/returns anything beyond its typed BenchmarkResult, so no
--      change is needed there for this to stay private).
--   2. import_batches — a lightweight, metadata-only record of one
--      completed upload (never the uploaded file itself), so "what did
--      I import, from which file, how many campaigns" has a real
--      answer instead of the same-day/same-platform heuristic Phase 26
--      used as a stand-in.
--
-- No existing column, table, index or RLS policy from 0001-0017 is
-- modified. Both new columns/rows are nullable/backfill-safe: every
-- historical row keeps working with campaign_name = null and
-- import_batch_id = null (a manual/older contribution simply has no
-- batch to point at — never a fabricated one).

-- ---------------------------------------------------------------------
-- import_batches
-- One row per completed upload attempt (manual single-entry
-- contributions never create one — see app/contribute/bulk-actions.ts,
-- unchanged for that path). Metadata only: no file bytes, ever.
-- ---------------------------------------------------------------------
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references profiles(id) on delete cascade,

  -- The platform this batch's rows were imported for. Nullable only
  -- because a generic/unrecognized-platform CSV (Phase 16 fallback,
  -- §15 of Phase 24) may not resolve to a single platform_id — never
  -- guessed.
  platform_id uuid references platforms(id),

  data_source data_source_type not null,

  -- Human-usable provenance (§8) — the file name as the user named it,
  -- and which recognized export FAMILY lib/import/platformExports.ts's
  -- classifyExportProfile assigned (its ExportProfileId, e.g.
  -- 'meta_campaign_report', 'generic_campaign_report') — never a raw
  -- internal id as primary UI, and never a fabricated profile when
  -- detection itself was inconclusive.
  source_filename text,
  export_profile text,

  row_count integer not null default 0,
  success_count integer not null default 0,
  skipped_count integer not null default 0,
  review_count integer not null default 0,

  created_at timestamptz not null default now()
);

comment on table import_batches is
  'Metadata-only record of one completed bulk import (never the '
  'uploaded file itself). Counts are a snapshot of what happened at '
  'import time and are never retroactively recalculated if a resulting '
  'campaign is later deleted — see performance_datasets.import_batch_id.';

create index idx_import_batches_owner on import_batches(owner_user_id, created_at desc);

alter table import_batches enable row level security;

-- Same owner-scoped pattern as every other private table (0007, 0011,
-- 0015). No public SELECT policy — import history is never public.
-- No UPDATE/DELETE policy: a batch is a historical record of what
-- happened, not a mutable object (§16 — never casually add broad
-- update/delete permissions). Deleting the resulting campaigns
-- (performance_datasets, already owner-delete-able per 0007) does not
-- retroactively edit or remove the batch record itself.
create policy "owners read own import batches" on import_batches
  for select using (owner_user_id = auth.uid());
create policy "owners insert own import batches" on import_batches
  for insert with check (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- performance_datasets additions
-- ---------------------------------------------------------------------
alter table performance_datasets
  add column campaign_name text,
  add column import_batch_id uuid references import_batches(id) on delete set null;

comment on column performance_datasets.campaign_name is
  'Identity/provenance only — the real-world campaign name from the '
  'source export, exactly as imported. NEVER a benchmark cohort '
  'dimension and never returned by the public benchmark engine '
  '(lib/benchmark/engine.ts), which already only ever returns a typed, '
  'aggregated BenchmarkResult. Visible only to the owning user, via the '
  'existing owner-scoped RLS below.';

comment on column performance_datasets.import_batch_id is
  'Which import_batches row produced this campaign, when it came from '
  'a bulk import. Null for a manual single-entry contribution, or for '
  'any row imported before this migration existed.';

-- Supports the duplicate-detection query (owner''s own recent rows for
-- a given platform and date range) added in Phase 25 without a full
-- table scan — a genuinely new access pattern, not covered by the
-- existing idx_datasets_owner/idx_datasets_platform/idx_datasets_dates
-- single-column indexes.
create index idx_datasets_owner_platform_dates
  on performance_datasets(owner_user_id, platform_id, start_date, end_date);

create index idx_datasets_import_batch on performance_datasets(import_batch_id);
