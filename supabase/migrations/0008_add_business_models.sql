-- 0008_add_business_models.sql
-- Purpose: implement the Business Model dimension, approved as its own
-- normalized dimension separate from Vertical, Audience, Objective, and
-- Platform — per 02-DATA-DIMENSIONS-AND-TAXONOMIES.md "Business Model"
-- and Phase 2.2. Purely additive: does not modify 0001-0007.

-- ---------------------------------------------------------------------
-- business_models
-- Same shape/conventions as the other controlled-vocabulary tables in
-- 0002_taxonomies.sql (internal_key + display_order, not the looser
-- "key"/"sort_order" naming from the Phase 2.2 request, to stay
-- consistent with the rest of the schema).
-- ---------------------------------------------------------------------
create table business_models (
  id uuid primary key default gen_random_uuid(),
  internal_key text not null unique,
  display_label text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table business_models is
  'Business Model is a dimension independent of Vertical, Audience, '
  'Objective, and Platform — see 02-DATA-DIMENSIONS-AND-TAXONOMIES.md '
  '"Business Model". Example: Vertical = Automotive, Business Model = '
  'Lead Generation, Audience = Remarketing — all three vary '
  'independently.';

-- ---------------------------------------------------------------------
-- performance_datasets.business_model_id
-- Nullable: whether Business Model is UI-required stays a submission-
-- layer decision for a later phase, not a database constraint now.
-- Not wired into any benchmark or relaxation logic in this migration —
-- see comment below and the Phase 2.2 report ("Benchmark Role").
-- ---------------------------------------------------------------------
alter table performance_datasets
  add column business_model_id uuid references business_models(id);

comment on column performance_datasets.business_model_id is
  'Contextual benchmark dimension, available but NOT protected and NOT '
  'part of the approved cohort relaxation order '
  '(benchmark_settings.relaxation_order) as of Phase 2.2. Adding it to '
  'that order is a separate, not-yet-approved decision — see '
  '07-BENCHMARK-ENGINE-AND-STATISTICAL-RULES.md.';

create index idx_datasets_business_model on performance_datasets(business_model_id);

-- ---------------------------------------------------------------------
-- RLS: same pattern as every other reference/taxonomy table — public
-- read of active rows, no public write.
-- ---------------------------------------------------------------------
alter table business_models enable row level security;

create policy "public read active business_models" on business_models
  for select using (active = true);
