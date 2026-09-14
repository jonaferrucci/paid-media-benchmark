-- 0003_metrics.sql
-- Purpose: flexible metric registry + the Metric Definition Variant
-- mechanism required to mechanically prevent incompatible benchmark
-- comparisons (07-BENCHMARK-ENGINE-AND-STATISTICAL-RULES.md and
-- 06-DATABASE-AND-SUPABASE-ARCHITECTURE.md, both "Architecture Freeze V1").

create type metric_unit_type as enum (
  'currency',
  'percentage',
  'multiplier',
  'count'
);

-- ---------------------------------------------------------------------
-- metrics
-- ---------------------------------------------------------------------
create table metrics (
  id uuid primary key default gen_random_uuid(),
  internal_key text not null unique,
  display_label text not null,
  metric_kind metric_value_kind not null,
  unit_type metric_unit_type not null,
  benchmark_direction benchmark_direction not null,
  formula_identifier text,
  description text,
  benchmark_eligible boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column metrics.formula_identifier is
  'Free-text identifier for the derivation formula (e.g. '
  '"ad_spend / impressions * 1000" for CPM). Not evaluated by the '
  'database — documentation/reference only at this phase.';

comment on column metrics.benchmark_eligible is
  'Whether this metric may ever be surfaced as a benchmark statistic. '
  'Some base metrics (e.g. ad_spend) exist only to derive other metrics '
  'and are never benchmarked directly.';

-- ---------------------------------------------------------------------
-- metric_definition_variants
-- Required wherever a metric's definition differs by platform or
-- methodology (Video Views, CPV, VTR, CTR/click variants). A metric
-- with no meaningful variant (e.g. ad_spend) simply has no rows here,
-- and dataset_metric_values.metric_definition_variant_id stays null.
-- ---------------------------------------------------------------------
create table metric_definition_variants (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references metrics(id) on delete cascade,
  internal_key text not null,
  display_label text not null,
  description text,
  is_unknown_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (metric_id, internal_key)
);

comment on table metric_definition_variants is
  'Mechanical enforcement point for incompatible metric definitions. '
  'The benchmark engine (a later phase) must only group and compare '
  'dataset_metric_values sharing the same metric_definition_variant_id. '
  'is_unknown_default flags the "Unknown / Platform-Default" variant '
  'used when a platform does not disclose its exact definition — this '
  'must never be treated as equivalent to a named variant.';

-- Only one "unknown/platform-default" variant per metric.
create unique index idx_one_unknown_variant_per_metric
  on metric_definition_variants(metric_id)
  where is_unknown_default;

-- ---------------------------------------------------------------------
-- platform_metrics
-- Which metrics each platform supports, and whether they're required.
-- Avoids hardcoding platform/metric compatibility only in frontend code
-- (07-BENCHMARK-ENGINE-AND-STATISTICAL-RULES.md "Platform × Metric").
-- ---------------------------------------------------------------------
create table platform_metrics (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references platforms(id) on delete cascade,
  metric_id uuid not null references metrics(id) on delete cascade,
  required boolean not null default false,
  active boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, metric_id)
);

-- ---------------------------------------------------------------------
-- platform_metric_compatible_variants
-- Which metric_definition_variants are valid for a given
-- platform_metrics row (e.g. Meta's CPV may only ever use certain view
-- length variants). Optional — most platform/metric pairs will have no
-- rows here, meaning "all active variants for that metric are allowed"
-- until narrowed.
-- ---------------------------------------------------------------------
create table platform_metric_compatible_variants (
  id uuid primary key default gen_random_uuid(),
  platform_metric_id uuid not null references platform_metrics(id) on delete cascade,
  metric_definition_variant_id uuid not null references metric_definition_variants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (platform_metric_id, metric_definition_variant_id)
);

create index idx_metric_variants_metric on metric_definition_variants(metric_id);
create index idx_platform_metrics_platform on platform_metrics(platform_id);
create index idx_platform_metrics_metric on platform_metrics(metric_id);
