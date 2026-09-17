-- 0015_media_planning_scenarios.sql
-- Purpose: Phase 20 — persist a user's MEDIA PLANNING scenario
-- WORKFLOW (name, budget amount/currency, which opportunities were
-- selected, and the planner's manually-entered quantities), never any
-- derived commercial/audience value. This is the exact same
-- data-integrity principle already established by
-- 0011_saved_comparisons.sql for benchmark comparisons: the engine
-- (here, lib/planning/*) remains the sole source of truth for current
-- price/comparability/budget-fit; reopening a saved scenario always
-- re-fetches current rate cards/public signals and recalculates
-- (see app/planner/actions.ts's getScenarioAction) rather than
-- trusting anything stored here.
--
-- Schema-reuse note (Phase 20 §36): saved_comparisons was inspected
-- first. Its columns are specific to the benchmark-cohort shape
-- (platform/objective/vertical/country/audience_strategy/...) and have
-- no field for a set of opportunity identities or manual per-
-- opportunity quantities — reusing it would mean overloading unrelated
-- columns or bolting on a parallel jsonb column that doesn't fit its
-- existing CHECK constraints or its "comparison_type" semantics. A new,
-- minimal table mirroring the SAME ownership/RLS/updated_at pattern was
-- judged the safer, more honest option rather than distorting an
-- existing table's meaning.

create table media_planning_scenarios (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0 and char_length(name) <= 120),

  -- Nullable: a scenario can be saved before a budget is entered at all
  -- (the planner may just be comparing opportunities). No FX — a
  -- budget has exactly one currency, matching Phase 19B's controlled
  -- currency set (validated in application code, not a DB CHECK, same
  -- as media_rate_cards.currency).
  budget_amount numeric check (budget_amount is null or budget_amount >= 0),
  budget_currency text,

  -- [{ platformId, propertyId, mediaFormatId, quantity }] — identities
  -- only, plus the planner's own manually-entered quantity. Never a
  -- price, a comparability state, or any other derived value (see the
  -- header comment and lib/planning/scenario.ts's serializeScenario,
  -- which is the single place this shape is produced).
  opportunities jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table media_planning_scenarios is
  'Persists a user''s MEDIA PLANNING scenario WORKFLOW (name, budget,
   selected opportunity identities, manual quantities), never derived
   commercial/audience results. Reopening always re-runs the current
   lib/planning/* engine against fresh data — see Phase 20 §28/§29.';

create index idx_media_planning_scenarios_owner_updated
  on media_planning_scenarios (owner_user_id, updated_at desc);

-- Row Level Security — identical owner-scoped pattern to
-- saved_comparisons (0011) and performance_datasets (0007). No public
-- SELECT policy: a planning scenario is private workflow data, never
-- aggregated or exposed publicly (§35).
alter table media_planning_scenarios enable row level security;

create policy "owners read own planning scenarios" on media_planning_scenarios
  for select using (owner_user_id = auth.uid());
create policy "owners insert own planning scenarios" on media_planning_scenarios
  for insert with check (owner_user_id = auth.uid());
create policy "owners update own planning scenarios" on media_planning_scenarios
  for update using (owner_user_id = auth.uid());
create policy "owners delete own planning scenarios" on media_planning_scenarios
  for delete using (owner_user_id = auth.uid());

-- Keep updated_at accurate on in-place edits, reusing the same trigger
-- FUNCTION already created by 0011_saved_comparisons.sql (fn_touch_
-- saved_comparison_updated_at is generic — it only sets NEW.updated_at
-- — but is intentionally not renamed/shared here to avoid coupling two
-- otherwise-independent tables to one trigger function's lifecycle;
-- a new, identically-shaped function keeps each table's migration
-- self-contained and independently droppable).
create function fn_touch_media_planning_scenario_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_touch_media_planning_scenario_updated_at
  before update on media_planning_scenarios
  for each row execute function fn_touch_media_planning_scenario_updated_at();
