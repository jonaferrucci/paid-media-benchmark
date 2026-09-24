-- 0020_observation_identity.sql
-- Purpose: CUCURUCHO DATA INTEGRITY 1 — introduces a real OBSERVATION
-- identity layer on top of performance_datasets, so a re-imported or
-- corrected re-export of the SAME real-world campaign/period can be
-- recognized and superseded instead of silently counting as a second,
-- independent unit of `n` in the benchmark engine's sample size.
--
-- Approved design (see the CUCURUCHO DATA INTEGRITY 1 audit report):
--   - observation_fingerprint: a deterministic hash computed in
--     TypeScript (lib/contribute/observationFingerprint.ts), never in
--     SQL, from (owner_user_id, platform_id, normalized campaign_name,
--     start_date, end_date, original_currency, campaign_type_id). NULL
--     whenever campaign_name is null/empty (100% of manual entries,
--     and any bulk import row with no campaign-name column) — no weak
--     placeholder token, no "unnamed"/"manual" fallback. Two manual
--     contributions with no campaign name are never assumed related.
--   - V1 stays OWNER-SCOPED. No cross-user, no cross-organization
--     deduplication. That is a future, larger identity model.
--   - Never overwrite, never delete. An update is modeled as SUPERSEDE:
--     the new row becomes 'valid', the old row becomes 'superseded' —
--     both rows keep existing, linked in both directions.
--   - The ONLY write path for validation_status/reviewed_by/reviewed_at/
--     supersedes_dataset_id/superseded_by_dataset_id remains a
--     SECURITY DEFINER RPC, exactly like fn_review_contribution()
--     (migration 0019, NOT modified by this file). No table-level
--     UPDATE grant is added for `authenticated` on performance_datasets
--     — that capability was deliberately removed in 0019 and stays
--     removed.
--   - This migration is purely additive: new columns (all nullable),
--     one new enum value, two new indexes, one new partial unique
--     index, and two new SECURITY DEFINER functions. Nothing in
--     0001-0019 is altered, and no historical row's validation_status
--     is touched — every existing row gets observation_fingerprint =
--     null and is left exactly as it was (see the "no backfill" note
--     further down).
--
-- Benchmark engine impact: NONE required. lib/benchmark/engine.ts's
-- fetchEligibleDatasetIds already filters .eq("validation_status",
-- "valid") as an ALLOWLIST (not a "not excluded" blocklist) — a new
-- 'superseded' status value is therefore excluded from every benchmark
-- query (getMetricBenchmark, getBenchmarksForMetrics,
-- getHistoricalBenchmark) automatically, with zero code change, the
-- moment this migration adds the enum value.

-- ---------------------------------------------------------------------
-- A. New validation_status enum value.
--
-- Postgres will not let a freshly-added enum value be used in the same
-- transaction it was added in for certain DML uses. This is safe here
-- because 'superseded' is only ever referenced as a string literal
-- INSIDE the bodies of the two plpgsql functions created further down
-- in this same file — a plpgsql function body is opaque text at CREATE
-- time (only parsed/validated the first time it actually EXECUTES,
-- which will always be in a later, separate transaction) — never in a
-- plain SQL statement executed directly by this migration itself. No
-- CHECK constraint, DEFAULT, or direct UPDATE in this file references
-- 'superseded' either. Same reasoning 0001/0019 already document for
-- this exact Postgres restriction.
-- ---------------------------------------------------------------------
alter type validation_status add value 'superseded';

-- ---------------------------------------------------------------------
-- B. New columns on performance_datasets. All nullable — every existing
-- row is backward-compatible with no data migration required.
-- ---------------------------------------------------------------------
alter table performance_datasets
  add column observation_fingerprint text,
  add column supersedes_dataset_id uuid references performance_datasets(id),
  add column superseded_by_dataset_id uuid references performance_datasets(id);

comment on column performance_datasets.observation_fingerprint is
  'Deterministic, owner-scoped identity key for this observation — '
  'computed application-side by lib/contribute/observationFingerprint.ts '
  '(buildObservationFingerprint), never in SQL. NULL whenever the row '
  'has no campaign_name (all manual entries, and any bulk-import row '
  'with no campaign-name column) — a NULL fingerprint is never a weak '
  'placeholder and is never matched against anything. NOT globally '
  'unique — see idx_datasets_owner_fingerprint_valid below, which scopes '
  'uniqueness to (owner_user_id, observation_fingerprint) among VALID '
  'rows only. Populated going forward on every insert; NULL for every '
  'row that existed before this migration (see backfill note below).';

comment on column performance_datasets.supersedes_dataset_id is
  'Set only on the NEW row of a curator-approved supersede, by '
  'fn_approve_superseding_contribution(). Points at the OLD row this '
  'one replaces. NULL for every normal (non-superseding) contribution.';

comment on column performance_datasets.superseded_by_dataset_id is
  'Set only on the OLD row of a curator-approved supersede, by '
  'fn_approve_superseding_contribution(). Points at the NEW row that '
  'replaced it. A row with this set is never eligible for benchmark '
  'aggregation (validation_status becomes ''superseded'' in the same '
  'atomic transaction) but is NEVER deleted — the owner can still see '
  'it, and the full audit trail survives in both directions.';

-- Defensive, cheap, table-level guards against the one self-referential
-- mistake a constraint can meaningfully catch. Bidirectional consistency
-- between supersedes_dataset_id and superseded_by_dataset_id (i.e. "if A
-- points at B, B must point back at A") is deliberately NOT enforced by
-- a constraint or trigger here — the only write path is the RPC below,
-- which sets both sides atomically in the same transaction, so a
-- complex cross-row CHECK/trigger would defend against a write path
-- that structurally cannot happen any other way. Per the approved design
-- note: no overengineering.
alter table performance_datasets
  add constraint chk_no_self_supersede check (supersedes_dataset_id is null or supersedes_dataset_id <> id),
  add constraint chk_no_self_superseded_by check (superseded_by_dataset_id is null or superseded_by_dataset_id <> id);

-- ---------------------------------------------------------------------
-- C. The core invariant: at most ONE 'valid' row per (owner,
-- fingerprint) at any time. Partial (only rows that matter: valid +
-- fingerprinted) and scoped by owner_user_id, never global — a global
-- constraint would wrongly conflate two different owners' campaigns
-- that happen to share a name/dates/currency/type (see the audit
-- report's Case E). owner_user_id is nullable (profiles can be deleted,
-- ON DELETE SET NULL) — Postgres treats NULL as distinct in a unique
-- index, so rows with a null owner simply aren't protected by this
-- invariant, which is an acceptable, narrow gap (no product path
-- creates an owner-less row today) rather than a reason to block on a
-- NOT NULL backfill this migration has no authority to perform.
-- ---------------------------------------------------------------------
create unique index idx_datasets_owner_fingerprint_valid
  on performance_datasets(owner_user_id, observation_fingerprint)
  where validation_status = 'valid' and observation_fingerprint is not null;

comment on index idx_datasets_owner_fingerprint_valid is
  'Enforces "at most one valid observation per owner+fingerprint" at '
  'the database layer — the last line of defense if the RPC below is '
  'ever bypassed or a rare concurrent-third-row race occurs (see that '
  'function''s own comment). Never global: scoped to owner_user_id, '
  'per the approved design''s explicit "V1 stays owner-scoped" rule.';

create index idx_datasets_supersedes on performance_datasets(supersedes_dataset_id) where supersedes_dataset_id is not null;
create index idx_datasets_superseded_by on performance_datasets(superseded_by_dataset_id) where superseded_by_dataset_id is not null;

-- ---------------------------------------------------------------------
-- D. fn_approve_superseding_contribution: the ONLY way a pending row
-- can be approved AS A REPLACEMENT for an existing valid observation.
-- A normal (non-superseding) approval keeps using the existing,
-- UNCHANGED fn_review_contribution() from migration 0019 — this
-- function is purely additive, a second, narrower entry point for the
-- one new case 0019 never had to handle.
--
-- SECURITY DEFINER, same authorization posture as fn_review_contribution:
--   1. auth.uid() read server-side — never a client-supplied caller id.
--   2. fn_is_curator(auth.uid()) must be true, or the call raises.
--   3. Both dataset ids must exist, NEW must be 'pending', OLD must be
--      'valid', both must share the same owner_user_id, and both must
--      carry the SAME non-null observation_fingerprint. Any mismatch
--      raises — a curator (or a compromised client) can never claim an
--      arbitrary supersede between two unrelated rows.
--   4. p_new_dataset_id = p_old_dataset_id raises 'self_supersede' —
--      a row can never supersede itself.
--
-- Concurrency: both rows are locked with SELECT ... FOR UPDATE, in a
-- fixed (least-id-first) order, BEFORE either is read or written, so
-- two concurrent supersede attempts touching an overlapping pair can
-- never interleave — the second call blocks until the first commits or
-- rolls back, then re-reads the now-current (already-decided) status
-- and correctly fails a guard above instead of racing.
--
-- Transaction order (per the approved design — this is the part that
-- makes the unique partial index above never fire spuriously): the OLD
-- row is updated to 'superseded' FIRST, freeing its
-- (owner_user_id, observation_fingerprint) slot in the unique index,
-- and ONLY THEN is the NEW row updated to 'valid'. If the second UPDATE
-- fails for any reason (including, in the rare case of a genuine THIRD
-- row racing in on the same fingerprint via some other path, a raw
-- unique_violation from the index itself), the exception aborts the
-- whole function and both UPDATEs roll back together — the OLD row is
-- never left 'superseded' with no 'valid' replacement.
--
-- Return contract: only the six columns a curator's UI genuinely needs
-- to update its own state (never metric values, owner details, campaign
-- name, or any raw import information) — same least-privilege posture
-- fn_review_contribution() already established.
-- ---------------------------------------------------------------------
create or replace function fn_approve_superseding_contribution(
  p_new_dataset_id uuid,
  p_old_dataset_id uuid
)
returns table (
  new_dataset_id uuid,
  old_dataset_id uuid,
  new_status validation_status,
  old_status validation_status,
  reviewed_by uuid,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_first_id uuid;
  v_second_id uuid;
  v_new record;
  v_old record;
  v_result_id uuid;
  v_result_status validation_status;
  v_result_reviewed_by uuid;
  v_result_reviewed_at timestamptz;
begin
  if v_caller is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not fn_is_curator(v_caller) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_new_dataset_id = p_old_dataset_id then
    raise exception 'self_supersede';
  end if;

  -- Lock both rows in a fixed global order (by id) before reading
  -- anything, so two concurrent calls can never deadlock or interleave.
  v_first_id := least(p_new_dataset_id, p_old_dataset_id);
  v_second_id := greatest(p_new_dataset_id, p_old_dataset_id);
  perform 1 from performance_datasets where id = v_first_id for update;
  perform 1 from performance_datasets where id = v_second_id for update;

  select id, validation_status, owner_user_id, observation_fingerprint
    into v_new
    from performance_datasets
    where id = p_new_dataset_id;

  select id, validation_status, owner_user_id, observation_fingerprint
    into v_old
    from performance_datasets
    where id = p_old_dataset_id;

  if v_new.id is null or v_old.id is null then
    raise exception 'invalid_transition';
  end if;

  if v_new.validation_status <> 'pending' then
    raise exception 'invalid_transition';
  end if;

  if v_old.validation_status <> 'valid' then
    raise exception 'invalid_transition';
  end if;

  if v_new.owner_user_id is distinct from v_old.owner_user_id then
    raise exception 'owner_mismatch';
  end if;

  if v_new.observation_fingerprint is null or v_old.observation_fingerprint is null then
    raise exception 'fingerprint_mismatch';
  end if;

  if v_new.observation_fingerprint <> v_old.observation_fingerprint then
    raise exception 'fingerprint_mismatch';
  end if;

  -- OLD first — see the function-level comment on why this order is
  -- required for the unique partial index to never spuriously reject
  -- the second update below.
  update performance_datasets
    set validation_status = 'superseded',
        superseded_by_dataset_id = p_new_dataset_id
    where id = p_old_dataset_id
      and validation_status = 'valid';

  if not found then
    raise exception 'invalid_transition';
  end if;

  update performance_datasets d
    set validation_status = 'valid',
        reviewed_by = v_caller,
        reviewed_at = now(),
        supersedes_dataset_id = p_old_dataset_id
    where d.id = p_new_dataset_id
      and d.validation_status = 'pending'
    returning d.id, d.validation_status, d.reviewed_by, d.reviewed_at
    into v_result_id, v_result_status, v_result_reviewed_by, v_result_reviewed_at;

  if v_result_id is null then
    raise exception 'invalid_transition';
  end if;

  return query select p_new_dataset_id, p_old_dataset_id, v_result_status, 'superseded'::validation_status, v_result_reviewed_by, v_result_reviewed_at;
end;
$$;

comment on function fn_approve_superseding_contribution is
  'Additive to fn_review_contribution() (0019), never a replacement — a '
  'normal approval still calls fn_review_contribution() unchanged. This '
  'is the ONLY path from pending to valid-as-a-replacement, and the '
  'ONLY writer of supersedes_dataset_id/superseded_by_dataset_id. Same '
  'SECURITY DEFINER + fn_is_curator() posture as fn_review_contribution, '
  'plus same-owner and same-fingerprint guards that make an arbitrary '
  'cross-campaign supersede impossible.';

revoke all on function fn_approve_superseding_contribution(uuid, uuid) from public;
grant execute on function fn_approve_superseding_contribution(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- E. fn_find_supersede_candidate: the minimal read-side mechanism the
-- curator review flow needs to distinguish "possible update/supersede"
-- from a normal approval (approved design §16/§17). This is a NECESSARY
-- addition beyond the single RPC named in the design brief: curators
-- have exactly ONE SELECT policy on performance_datasets ("curators
-- read pending contributions", migration 0019), scoped to
-- validation_status = 'pending' only — they have NO visibility into
-- 'valid' rows at all today, by design (least-privilege, so a curator
-- never gets a standing window into every user's approved history).
-- Without this function there would be no way for the review UI to
-- even know a matching valid row exists, let alone offer to supersede
-- it. SECURITY DEFINER exactly like fn_is_curator() itself, so its
-- internal SELECT can see 'valid' rows without widening any RLS policy.
--
-- Deliberately returns only the minimal safe fields a curator needs to
-- recognize the candidate (its id and period) — never owner_user_id,
-- never campaign_name, never metric values. owner_user_id is used
-- internally to scope the match and is never returned.
-- ---------------------------------------------------------------------
create or replace function fn_find_supersede_candidate(p_dataset_id uuid)
returns table (
  candidate_dataset_id uuid,
  candidate_start_date date,
  candidate_end_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_fingerprint text;
  v_owner uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not fn_is_curator(v_caller) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select d.observation_fingerprint, d.owner_user_id
    into v_fingerprint, v_owner
    from performance_datasets d
    where d.id = p_dataset_id
      and d.validation_status = 'pending';

  -- No fingerprint (or the row isn't pending / doesn't exist) means
  -- there is nothing to match against — return an empty result, never
  -- an error, since "no candidate" is the overwhelmingly common,
  -- entirely normal case for every first-time or manually-entered
  -- contribution.
  if v_fingerprint is null then
    return;
  end if;

  return query
    select d.id, d.start_date, d.end_date
    from performance_datasets d
    where d.owner_user_id is not distinct from v_owner
      and d.observation_fingerprint = v_fingerprint
      and d.validation_status = 'valid'
      and d.id <> p_dataset_id
    limit 1;
end;
$$;

comment on function fn_find_supersede_candidate is
  'Read-side counterpart to fn_approve_superseding_contribution, added '
  'because curators have no RLS visibility into valid performance_datasets '
  'rows at all (0019''s only curator SELECT policy is pending-scoped). '
  'Never returns owner identity, campaign name, or metric values — only '
  'enough for a curator to recognize "this looks like campaign X from '
  'Y-Z" before choosing supersede vs. a normal, independent approval.';

revoke all on function fn_find_supersede_candidate(uuid) from public;
grant execute on function fn_find_supersede_candidate(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- F. No backfill. Every row that existed before this migration keeps
-- observation_fingerprint = null, supersedes_dataset_id = null,
-- superseded_by_dataset_id = null, and its EXACT current
-- validation_status. No historical row is reclassified, invalidated,
-- or auto-superseded by this migration. A legacy-fingerprint backfill
-- (computing observation_fingerprint for pre-existing rows, purely as a
-- read-only collision report for curator review) is explicitly left for
-- a separate, future task — never bundled into a schema migration.
-- ---------------------------------------------------------------------
