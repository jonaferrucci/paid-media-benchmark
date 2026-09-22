-- 0019_contribution_validation.sql
-- Purpose: Phase 28 — close two real, verified production gaps found
-- during Phase 27's UI-polish investigation (re-verified here against
-- the actual schema/RLS/application code, not just Phase 27's report):
--
--   (1) import_batches (migration 0018) has SELECT/INSERT RLS policies
--       only. The finalizing `.update({ success_count: imported })`
--       call in app/contribute/bulk-actions.ts is therefore silently
--       blocked by RLS's default-deny, permanently leaving
--       success_count at its initial insert-time value of 0 for every
--       bulk import.
--
--   (2) performance_datasets.validation_status never transitions away
--       from "pending" anywhere in the application (app/contribute/
--       actions.ts and app/contribute/bulk-actions.ts always insert
--       "pending"; nothing ever calls .update() on it). Worse: the
--       pre-existing "owners update own datasets" policy (0007) is
--       broad (USING owner_user_id = auth.uid(), no WITH CHECK) and
--       this project relies on Supabase's default privilege grants
--       (confirmed by 0010's own comment) for base table access — so
--       an owner COULD, today, set their own contribution's
--       validation_status to "valid" via a direct client update call,
--       even though the app itself never does this. A successful
--       import and benchmark-eligibility approval are different
--       decisions (see the governance principle below), and only the
--       second should ever require a curator.
--
-- Two scoped changes, both additive/behavioral, neither touching
-- 0001-0018:
--
--   A. import_batches gets a real, owner-scoped UPDATE policy, and the
--      column-level grant is narrowed to success_count only — the one
--      field the import workflow genuinely cannot know until its
--      per-row loop finishes. row_count/skipped_count/review_count are
--      already known before the loop starts (see bulk-actions.ts) and
--      are never written again, so no broader update capability is
--      granted (§3's "do not give unrestricted update permission if
--      avoidable").
--
--   B. performance_datasets gains real curator review, reusing the
--      EXACT governance shape 0014 already established for
--      media_rate_cards / public_media_metric_snapshots / platforms
--      (profiles.is_curator + fn_is_curator, reviewed_by/reviewed_at,
--      a curator-only policy) — no second admin/authorization system.
--      The pre-existing owner UPDATE policy is tightened with a WITH
--      CHECK so an owner's own update can never change
--      validation_status/reviewed_by/reviewed_at, however permissive
--      this project's default column grants are; a bare curator-only
--      policy ALONE would not have closed this (Postgres RLS combines
--      multiple permissive UPDATE policies with OR at the row level —
--      it does not let one policy restrict which COLUMNS another
--      matching policy may write). The pre-existing owner INSERT
--      policy is tightened the same way, so a direct client insert
--      can never start a contribution anywhere but "pending" either.
--
-- No enum value is added. validation_status already has 'excluded' —
-- unused anywhere in the application today except supabase/
-- test-fixtures.sql, whose own Scenario L comment already documents it
-- as a status that "must NEVER appear in any benchmark" alongside
-- pending/flagged/deleted. That is exactly a curator's "reject from
-- benchmarks" decision, so reviewRules.ts's ContributionReviewDecision
-- reuses it rather than requiring `alter type validation_status add
-- value 'rejected'` (which some Postgres versions refuse to let you
-- use in the same transaction it's added in) for a distinction the
-- schema already expresses. 'flagged' is left alone — still reserved,
-- still unused by any code path, still available for a future,
-- genuinely distinct "needs another look" state that isn't a curator's
-- final decision either way.
--
-- Nothing here changes the benchmark engine's own eligibility rule
-- (lib/benchmark/engine.ts's fetchEligibleDatasetIds, still
-- .eq("validation_status", "valid")) — a curator-approved row becomes
-- eligible through that exact same, untouched query the moment its
-- status flips. No bypass, no second read path, no admin-client
-- shortcut.
--
-- No data is rewritten by this migration. Every existing "pending" row
-- stays "pending" (queued for a curator, never bulk-approved); every
-- existing "valid" row stays "valid" (historical benchmark eligibility
-- is never altered).

-- ---------------------------------------------------------------------
-- A. import_batches: finalize success_count for real.
-- ---------------------------------------------------------------------
create policy "owners finalize own import batch" on import_batches
  for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

comment on policy "owners finalize own import batch" on import_batches is
  'Phase 28: lets app/contribute/bulk-actions.ts persist the REAL final '
  'success_count once its per-row import loop finishes (previously '
  'silently blocked — no update policy existed at all on this table). '
  'Scoped to success_count only via the column grant below.';

-- This project relies on Supabase's default privilege grants for base
-- table access (0010's own comment) rather than an explicit prior
-- GRANT here — the REVOKE below is what actually narrows it, matching
-- 0014's "column-level grants ... as a second layer of defense beyond
-- the application code" pattern.
revoke update on import_batches from authenticated;
grant update (success_count) on import_batches to authenticated;

-- ---------------------------------------------------------------------
-- B. performance_datasets: real curator review, reusing 0014's exact
-- governance shape.
-- ---------------------------------------------------------------------
alter table performance_datasets
  add column reviewed_by uuid references auth.users(id),
  add column reviewed_at timestamptz;

comment on column performance_datasets.reviewed_by is
  'Phase 28: which curator approved ("valid") or rejected ("excluded") '
  'this contribution for benchmark eligibility. Null until reviewed. '
  'Never settable by the owner themselves — see the tightened '
  '"owners update own datasets" / "owners insert own datasets" '
  'policies below.';
comment on column performance_datasets.reviewed_at is
  'Phase 28: when a curator last reviewed this contribution. Null '
  'until reviewed.';

-- Tighten the pre-existing owner UPDATE policy (0007) so an owner's
-- own update — whatever columns a future feature might legitimately
-- let them edit — can never change validation_status, reviewed_by, or
-- reviewed_at. The WITH CHECK compares the proposed new row against
-- the row's own currently-stored value via a by-id self-select (a
-- policy's WITH CHECK has no "OLD.column" syntax; this is the standard
-- way to express "this column must not change" in Postgres RLS).
drop policy "owners update own datasets" on performance_datasets;
create policy "owners update own datasets" on performance_datasets
  for update using (owner_user_id = auth.uid())
  with check (
    owner_user_id = auth.uid()
    and validation_status = (select d.validation_status from performance_datasets d where d.id = performance_datasets.id)
    and reviewed_by is not distinct from (select d.reviewed_by from performance_datasets d where d.id = performance_datasets.id)
    and reviewed_at is not distinct from (select d.reviewed_at from performance_datasets d where d.id = performance_datasets.id)
  );

-- Same tightening for INSERT (0007): a direct client insert — bypassing
-- app/contribute/actions.ts / bulk-actions.ts entirely, which is what
-- RLS must defend against, not just the app's own UI — can never start
-- a contribution as anything but "pending" with no reviewer set. Every
-- real insert path already sends exactly this today, so this is a
-- no-op for legitimate use and a hard close for the bypass case.
drop policy "owners insert own datasets" on performance_datasets;
create policy "owners insert own datasets" on performance_datasets
  for insert with check (
    owner_user_id = auth.uid()
    and validation_status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

-- The curator-only counterpart — same bare shape as 0014's three
-- existing "curators update ... status" policies (no additional WITH
-- CHECK there either; the pending-only transition is enforced by the
-- pure function in lib/contribute/reviewRules.ts plus the server
-- action's own .eq("validation_status", "pending") on the update call,
-- exactly mirroring lib/media/governanceActions.ts's established
-- pattern — RLS is defense-in-depth here, not the only check).
create policy "curators review contribution validation" on performance_datasets
  for update using (fn_is_curator(auth.uid()));

-- Curators also need to SEE pending contributions to review them — no
-- SELECT policy on performance_datasets has ever covered another
-- owner's rows (0007's only SELECT policy is "owners read own
-- datasets"). Scoped to validation_status = 'pending' only: a curator
-- needs the review queue, never a standing window into every user's
-- entire historical (valid/excluded/flagged) contribution history —
-- least-privilege, and never exposes owner email/identity (this
-- policy governs row visibility only; the application query never
-- joins profiles/auth.users for this read — see
-- lib/contribute/reviewQueries.ts).
create policy "curators read pending contributions" on performance_datasets
  for select using (fn_is_curator(auth.uid()) and validation_status = 'pending');

grant update (validation_status, reviewed_by, reviewed_at) on performance_datasets to authenticated;

comment on policy "curators review contribution validation" on performance_datasets is
  'Phase 28: a curator may transition a pending contribution to '
  '"valid" (approved for benchmarks) or "excluded" (rejected — kept, '
  'still owner-visible, never deleted, never eligible). See '
  'lib/contribute/reviewRules.ts for the pure pending-only transition '
  'check the server action runs before ever reaching this policy.';

create index idx_datasets_reviewed_by on performance_datasets(reviewed_by) where reviewed_by is not null;
