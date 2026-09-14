-- 0005_dataset_metric_values.sql
-- Purpose: raw metric values submitted for a dataset. Preserves
-- originally submitted values; normalized values (e.g. currency
-- conversion) are stored separately and never overwrite this table.

create table dataset_metric_values (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references performance_datasets(id) on delete cascade,
  metric_id uuid not null references metrics(id),

  -- Nullable: many metrics have no meaningful variant. When a variant
  -- is required for the metric (see is_unknown_default convention),
  -- application/ingestion logic should populate the "Unknown /
  -- Platform-Default" row rather than leaving this null and assuming
  -- equivalence to another platform's definition.
  metric_definition_variant_id uuid references metric_definition_variants(id),

  raw_numeric_value numeric not null,

  created_at timestamptz not null default now(),

  -- Prevent duplicate raw submissions for the same dataset/metric/variant.
  unique (dataset_id, metric_id, metric_definition_variant_id)
);

comment on table dataset_metric_values is
  'Raw submitted metric values. The benchmark engine (later phase) must '
  'only group and compare rows sharing the same metric_id AND the same '
  'metric_definition_variant_id — this is the mechanical enforcement '
  'point described in 07-BENCHMARK-ENGINE-AND-STATISTICAL-RULES.md.';

-- Postgres treats NULL as distinct in unique constraints, so the
-- constraint above would NOT catch two rows for the same dataset/metric
-- both left null. This partial unique index closes that gap for
-- metrics that have no variant at all.
create unique index idx_dataset_metric_values_no_variant
  on dataset_metric_values(dataset_id, metric_id)
  where metric_definition_variant_id is null;

-- ---------------------------------------------------------------------
-- normalized_metric_values
-- Approved normalized values (e.g. currency-normalized spend) computed
-- from a raw value. Raw values in dataset_metric_values are never
-- overwritten — see 06-DATABASE-AND-SUPABASE-ARCHITECTURE.md
-- "Currency Normalization".
-- ---------------------------------------------------------------------
create table normalized_metric_values (
  id uuid primary key default gen_random_uuid(),
  dataset_metric_value_id uuid not null references dataset_metric_values(id) on delete cascade,
  normalized_value numeric not null,
  normalization_currency text check (char_length(normalization_currency) = 3),
  exchange_rate_source text,
  exchange_rate_date date,
  created_at timestamptz not null default now(),
  unique (dataset_metric_value_id)
);

comment on table normalized_metric_values is
  'Currency-normalized values only, at this phase. Exchange rate '
  'methodology is a later implementation concern — this table exists '
  'so normalization never requires overwriting dataset_metric_values.';

create index idx_dataset_metric_values_dataset on dataset_metric_values(dataset_id);
create index idx_dataset_metric_values_metric on dataset_metric_values(metric_id);
