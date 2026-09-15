-- 0011_saved_comparisons.sql
-- Purpose: Phase 14 — persist a user's benchmark comparison workflow
-- (which cohort/metric/input they were looking at), NOT benchmark
-- results themselves. The engine remains the sole source of truth for
-- percentile/median values; reopening a saved comparison re-runs the
-- existing, unmodified benchmark engine against current data (see
-- app/comparisons/actions.ts). This table stores only enough to
-- reconstruct the query, reusing the exact same field shape as
-- BenchmarkFormInput (app/benchmark/actions.ts) rather than inventing
-- a parallel taxonomy.

create table saved_comparisons (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0 and char_length(name) <= 120),
  comparison_type text not null check (comparison_type in ('single_metric', 'campaign')),

  -- Cohort dimensions, shared by both comparison types. Same field
  -- names as BenchmarkFormInput/BenchmarkQuery — no parallel taxonomy.
  platform text not null,
  objective text not null,
  vertical text not null,
  country text not null,
  audience_strategy text,
  funnel_stage text,
  business_model text,
  spend_band text,
  duration_band text,
  time_window text,

  -- Single-metric mode: one metric + the user's entered value.
  metric text,
  user_value numeric,

  -- Campaign mode: array of { metric, value } rows, matching
  -- CampaignExplorer's MetricRow shape exactly (app/benchmark/
  -- CampaignExplorer.tsx). Nullable — only populated for
  -- comparison_type = 'campaign'.
  campaign_rows jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table saved_comparisons is
  'Persists a user''s benchmark comparison WORKFLOW (cohort + input),
   never benchmark result values. Reopening always re-runs the current
   benchmark engine — see Phase 14 item 4 (data integrity principle).';

create index idx_saved_comparisons_owner_updated
  on saved_comparisons (owner_user_id, updated_at desc);

-- Row Level Security — identical owner-scoped pattern to
-- performance_datasets in 0007_row_level_security.sql. No public
-- SELECT policy: saved comparisons are private workflow data, never
-- aggregated or exposed publicly.
alter table saved_comparisons enable row level security;

create policy "owners read own saved comparisons" on saved_comparisons
  for select using (owner_user_id = auth.uid());
create policy "owners insert own saved comparisons" on saved_comparisons
  for insert with check (owner_user_id = auth.uid());
create policy "owners update own saved comparisons" on saved_comparisons
  for update using (owner_user_id = auth.uid());
create policy "owners delete own saved comparisons" on saved_comparisons
  for delete using (owner_user_id = auth.uid());

-- Keep updated_at accurate on every UPDATE (rename, duplicate-as-new-
-- row doesn't need this — only in-place edits like rename do).
create function fn_touch_saved_comparison_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_touch_saved_comparison_updated_at
  before update on saved_comparisons
  for each row execute function fn_touch_saved_comparison_updated_at();
