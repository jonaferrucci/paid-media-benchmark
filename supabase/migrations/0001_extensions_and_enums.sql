-- 0001_extensions_and_enums.sql
-- Purpose: enable required extensions and define shared enum types used
-- across later migrations. Kept separate from table creation so enum
-- changes (ALTER TYPE ... ADD VALUE) are easy to track independently.

create extension if not exists pgcrypto;

-- Validation lifecycle for a submitted performance dataset.
-- See 05-DATA-SUBMISSION-AND-VALIDATION.md — "Benchmark Eligibility".
create type validation_status as enum (
  'pending',
  'valid',
  'flagged',
  'excluded',
  'deleted'
);

-- Where a performance dataset originated.
create type data_source_type as enum (
  'manual',
  'csv',
  'api',
  'admin_import',
  'other'
);

-- Benchmark directionality per metric — mirrors
-- 07-BENCHMARK-ENGINE-AND-STATISTICAL-RULES.md "Percentiles and
-- Directionality". 'contextual' means the engine must never auto-score
-- the metric as better/worse (e.g. Frequency, Reach).
create type benchmark_direction as enum (
  'lower_is_better',
  'higher_is_better',
  'contextual'
);

create type metric_value_kind as enum (
  'base',
  'derived'
);

-- Gender targeting values a submitted dataset may report.
create type gender_targeting_type as enum (
  'all',
  'female',
  'male',
  'platform_defined',
  'not_specified'
);

-- Geographic scope of the targeted audience within a dataset.
create type geographic_scope_type as enum (
  'national',
  'regional',
  'state_province',
  'city',
  'local_radius',
  'multiple_regions',
  'international',
  'other'
);

-- Performance scope: what slice of the account a dataset represents.
create type performance_scope_type as enum (
  'full_account',
  'campaign_group',
  'individual_campaign',
  'mixed',
  'other'
);
