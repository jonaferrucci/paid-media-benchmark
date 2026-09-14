-- 0004_performance_datasets.sql
-- Purpose: the core contributed-dataset entity, plus the minimal
-- profiles/organizations scaffolding from 06-DATABASE-AND-SUPABASE-
-- ARCHITECTURE.md needed to give performance_datasets a sensible owner
-- reference now, without implementing production authentication.
-- Creating these tables is schema readiness, not an auth feature —
-- profiles rows will simply have no real signups until Phase 3.

-- ---------------------------------------------------------------------
-- profiles
-- One row per authenticated user (Supabase Auth), created later by a
-- trigger on auth.users in Phase 3. Kept separate from auth.users so
-- application-specific fields never need to touch the auth schema.
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- organizations / organization_members
-- Future-ready, intentionally minimal. Not exposed in the Phase 1.5 UI.
-- ---------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type organization_role as enum ('owner', 'admin', 'analyst', 'contributor', 'viewer');

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role organization_role not null default 'contributor',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- ---------------------------------------------------------------------
-- performance_datasets
-- One submitted block of advertising performance for a specific
-- context and time period. Brand is intentionally NOT a field —
-- 00-PROJECT-OVERVIEW.md "Privacy": Brand is never a benchmark dimension.
-- ---------------------------------------------------------------------
create table performance_datasets (
  id uuid primary key default gen_random_uuid(),

  -- Ownership (nullable until Phase 3 wires up real auth flows).
  owner_user_id uuid references profiles(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,

  -- Cohort dimensions.
  platform_id uuid not null references platforms(id),
  campaign_type_id uuid references campaign_types(id),
  objective_id uuid not null references objectives(id),
  vertical_id uuid not null references verticals(id),
  country_id uuid not null references countries(id),
  audience_strategy_id uuid references audience_strategies(id),
  funnel_stage_id uuid references funnel_stages(id),

  performance_scope performance_scope_type not null default 'full_account',

  -- Time window is a QUERY concept applied later by the benchmark
  -- engine (Current Year / Last 3-6-12 Months / Custom) — never stored
  -- on the dataset itself. Only exact dates are preserved here.
  -- See 07-BENCHMARK-ENGINE-AND-STATISTICAL-RULES.md "Time Window".
  start_date date not null,
  end_date date not null,

  -- Currency: original value only. No live conversion at this phase.
  original_currency text not null check (char_length(original_currency) = 3),

  -- Audience detail preserved structurally (not a single free-text field).
  min_age integer,
  max_age integer,
  gender_targeting gender_targeting_type not null default 'not_specified',
  geographic_scope geographic_scope_type,
  potential_audience_size bigint,

  data_source data_source_type not null default 'manual',
  validation_status validation_status not null default 'pending',
  review_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_dates_consistent check (end_date >= start_date),
  constraint chk_age_range check (
    (min_age is null and max_age is null)
    or (min_age is not null and max_age is not null and max_age >= min_age)
  )
);

comment on column performance_datasets.performance_scope is
  'What slice of the account this dataset represents (full account, '
  'campaign group, individual campaign, mixed, other).';

comment on table performance_datasets is
  'Raw submitted performance data. NEVER exposed directly to public '
  'frontend clients — see RLS policies in '
  '0007_row_level_security.sql and 08-AUTHENTICATION-SECURITY-AND-'
  'PRIVACY.md "Public Data".';

-- ---------------------------------------------------------------------
-- Derived/contextual fields.
-- duration_days, year, month, quarter, and normalized_monthly_spend are
-- GENERATED columns: always in sync with start_date/end_date, computed
-- once and indexable, never silently drifting from a hand-maintained
-- application-layer copy. Advertising spend itself lives in
-- dataset_metric_values (it's a metric, like any other), so the spend
-- normalization formula is implemented as a helper function applied at
-- query/materialization time rather than a generated column here — see
-- fn_normalized_monthly_spend below and 0006 for how it's used.
-- ---------------------------------------------------------------------
alter table performance_datasets
  add column duration_days integer
    generated always as (end_date - start_date + 1) stored,
  add column year integer
    generated always as (extract(year from start_date)::integer) stored,
  add column month integer
    generated always as (extract(month from start_date)::integer) stored,
  add column quarter integer
    generated always as (extract(quarter from start_date)::integer) stored;

-- ---------------------------------------------------------------------
-- Spend-band normalization formula (Architecture Freeze V1, APPROVED
-- FOR MVP): Normalized Monthly Spend = Advertising Spend / Duration
-- Days * 30. Implemented as a pure SQL function rather than a stored
-- column, since spend is a metric value (in dataset_metric_values),
-- not a column on performance_datasets — this avoids a circular
-- dependency between the two tables while keeping one canonical
-- formula definition. Used only for spend-band classification;
-- callers must never treat its result as a replacement for raw spend.
-- ---------------------------------------------------------------------
create function fn_normalized_monthly_spend(
  raw_spend numeric,
  duration_days integer
) returns numeric
language sql
immutable
as $$
  select case
    when duration_days is null or duration_days <= 0 then null
    else raw_spend / duration_days * 30
  end;
$$;

comment on function fn_normalized_monthly_spend is
  'Normalized Monthly Spend = Advertising Spend / Duration Days * 30. '
  'Spend-band classification only — never overwrites or replaces the '
  'raw submitted spend value. See 02-DATA-DIMENSIONS-AND-TAXONOMIES.md '
  '"Spend Range" (Architecture Freeze V1, approved formula).';

create index idx_datasets_platform on performance_datasets(platform_id);
create index idx_datasets_vertical on performance_datasets(vertical_id);
create index idx_datasets_country on performance_datasets(country_id);
create index idx_datasets_objective on performance_datasets(objective_id);
create index idx_datasets_audience on performance_datasets(audience_strategy_id);
create index idx_datasets_validation_status on performance_datasets(validation_status);
create index idx_datasets_dates on performance_datasets(start_date, end_date);
create index idx_datasets_owner on performance_datasets(owner_user_id);
