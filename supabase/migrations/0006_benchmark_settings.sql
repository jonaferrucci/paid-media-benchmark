-- 0006_benchmark_settings.sql
-- Purpose: configuration STORAGE for the future benchmark engine.
-- No benchmark calculation logic is implemented in this phase — only
-- the settings foundation described in 07-BENCHMARK-ENGINE-AND-
-- STATISTICAL-RULES.md and 09-ADMIN-AND-DATA-GOVERNANCE.md
-- "Benchmark Settings" (both Architecture Freeze V1, approved).

create table benchmark_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null,
  description text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

comment on table benchmark_settings is
  'Key/value benchmark engine configuration. A single global row per '
  'setting_key is sufficient for the MVP; per-segment overrides (e.g. a '
  'higher sample threshold when Age + Gender are both present) can be '
  'added later as additional rows or a richer setting_value shape '
  'without a schema migration, per the approved configuration '
  'architecture.';

-- Seed the three MVP-required settings. Actual seed DATA (taxonomies,
-- metrics, etc.) lives in supabase/seed.sql, but these three rows are
-- part of the schema's required initial state, not sample content, so
-- they're seeded here in the migration itself.

insert into benchmark_settings (setting_key, setting_value, description) values
(
  'minimum_sample_size',
  '{"default": 10}',
  'Global default minimum valid observations required before a benchmark result is shown. Future per-segment overrides may extend this shape, e.g. {"default": 10, "overrides": [{"dimensions": ["vertical","audience_strategy"], "minimum": 15}]}.'
),
(
  'relaxation_order',
  '["age", "gender", "funnel_stage", "audience_strategy", "campaign_type", "spend_range", "duration_band"]',
  'Approved order in which the benchmark engine may offer progressively broader cohorts, one dimension at a time, when the exact cohort is below the minimum sample size. Never applied silently — the UI must always state which dimension was relaxed.'
),
(
  'protected_dimensions',
  '{"always": ["platform", "vertical", "time_window"], "default_protected": ["country"], "strongly_protected": ["objective"]}',
  'Dimensions the benchmark engine must never relax automatically. "default_protected" (Country) may become configurable in a future version; "strongly_protected" (Objective) requires explicit user action to broaden, per approved architecture.'
);
