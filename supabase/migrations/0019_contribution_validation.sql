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
--       even though the app itself never does this.
--
-- REVISION (post-Phase-28 external RLS audit): the first version of
-- this migration tried to close (2) by keeping the owner UPDATE policy
-- alive and adding a WITH CHECK that self-joined performance_datasets
-- against itself to forbid changing validation_status/reviewed_by/
-- reviewed_at, plus a separate curator UPDATE policy + column grants.
-- The audit correctly flagged both:
--
--   - A self-select WITH CHECK against the very table being updated is
--     an unnecessary and fragile way to express "this column must not
--     change" when a grep of the whole codebase
--     (`.from("performance_datasets").update(...)`) shows there is
--     exactly ONE call site that ever updates this table — the curator
--     review action — and it is a NEW code path being added in this
--     same migration, not an existing owner-facing feature. There is
--     no product reason for an owner to have UPDATE on this table at
--     all. Least privilege means removing the capability, not building
--     a policy to defend a capability nothing uses.
--
--   - A bare `using (fn_is_curator(auth.uid()))` curator UPDATE policy
--     plus a column grant enforces WHO may write these columns, but
--     nothing at the database layer about WHAT transition is allowed —
--     a curator's raw update call could move a row from "valid" back
--     to "excluded", or from "excluded" back to "valid", or write an
--     arbitrary reviewed_by/reviewed_at, with only application code
--     (lib/contribute/reviewRules.ts) standing in the way. Every other
--     security-sensitive rule in this codebase treats application code
--     as a first check, never the only one.
--
-- Both are fixed the same way: remove the owner's UPDATE capability on
-- performance_datasets entirely (no policy, no grant — nothing to
-- self-select against), and replace the curator's raw UPDATE with a
-- single SECURITY DEFINER RPC, fn_review_contribution(), that is the
-- ONLY path from "pending" to "valid"/"excluded" and enforces the full
-- transition rule (source state must be 'pending'; destination must be
-- 'valid' or 'excluded'; reviewer identity and timestamp are always
-- server-derived, never client-supplied) inside a single atomic
-- UPDATE ... WHERE ... RETURNING, not just in a WITH CHECK expression.
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
--      granted. Unchanged from the original version of this migration
--      — the audit raised no issue with this half.
--
--   B. performance_datasets: owners lose UPDATE entirely (SELECT/
--      INSERT/DELETE are untouched — DELETE, in particular, already
--      exists from 0007 and is actively used by
--      app/account/contributions/actions.ts's deleteContributionAction,
--      so it is deliberately left alone); curators gain review power
--      ONLY through fn_review_contribution(), a SECURITY DEFINER
--      function reusing 0014's exact fn_is_curator() authorization
--      check — no second admin/authorization system, no raw table
--      grant for validation_status/reviewed_by/reviewed_at to
--      `authenticated` at all.
--
-- No enum value is added. validation_status already has 'excluded' —
-- unused anywhere in the application today except supabase/
-- test-fixtures.sql, whose own Scenario L comment already documents it
-- as a status that "must NEVER appear in any benchmark" alongside
-- pending/flagged/deleted. That is exactly a curator's "reject from
-- benchmarks" decision, so fn_review_contribution() and
-- reviewRules.ts's ContributionReviewDecision reuse it rather than
-- adding a brand-new enum member for "rejected" via ALTER TYPE (which
-- some Postgres versions refuse to let you use in the same transaction
-- it's added in) for a distinction the schema already expresses.
-- 'flagged' is left alone — still reserved, still unused by any code
-- path, still available for a future, genuinely distinct "needs
-- another look" state that isn't a curator's final decision either
-- way.
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
-- is never altered); every existing "excluded" row stays "excluded".

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
-- B. performance_datasets: real curator review via a SECURITY DEFINER
-- RPC, and owners lose UPDATE entirely (least privilege — no product
-- feature ever calls .from("performance_datasets").update(...) as the
-- owner; the only call site added by this phase is the curator RPC
-- below).
-- ---------------------------------------------------------------------
alter table performance_datasets
  add column reviewed_by uuid references auth.users(id),
  add column reviewed_at timestamptz;

comment on column performance_datasets.reviewed_by is
  'Phase 28: which curator approved ("valid") or rejected ("excluded") '
  'this contribution for benchmark eligibility. Null until reviewed. '
  'Written ONLY by fn_review_contribution() — never directly settable '
  'by any client, owner or curator alike; there is no UPDATE grant on '
  'this column for the authenticated role.';
comment on column performance_datasets.reviewed_at is
  'Phase 28: when a curator last reviewed this contribution. Null '
  'until reviewed. Same write boundary as reviewed_by.';

-- The pre-existing owner UPDATE policy (0007, "owners update own
-- datasets") is dropped outright, not replaced. No product feature in
-- this codebase ever updates a performance_datasets row as its owner
-- (verified: the only .from("performance_datasets").update(...) call
-- site anywhere in app/ or lib/ is the curator path this migration
-- adds) — so rather than build a policy to defend a capability nothing
-- uses, the capability itself is removed. This also permanently closes
-- the self-approval gap without any self-referential WITH CHECK
-- subquery: RLS fails closed once no UPDATE policy exists for a role at
-- all (the same "fails closed" guarantee 0007 already documents), and
-- the REVOKE below removes the underlying privilege as a second,
-- independent layer, so even a future, mistakenly-permissive policy
-- addition could not resurrect this without also re-granting UPDATE.
drop policy "owners update own datasets" on performance_datasets;
revoke update on performance_datasets from authenticated;

comment on table performance_datasets is
  'Phase 28: no role holds UPDATE on this table. The only supported '
  'write path for validation_status/reviewed_by/reviewed_at is the '
  'fn_review_contribution() SECURITY DEFINER RPC, which enforces the '
  'full pending-only transition rule inside one atomic statement. '
  'Owners retain their pre-existing SELECT ("owners read own '
  'datasets"), INSERT (tightened below to pending/unreviewed only), '
  'and DELETE ("owners delete own datasets", used by '
  'app/account/contributions/actions.ts) policies — none of those are '
  'affected by this change.';

-- Tighten the pre-existing owner INSERT policy (0007) so a direct
-- client insert — bypassing app/contribute/actions.ts / bulk-
-- actions.ts entirely, which is what RLS must defend against, not just
-- the app's own UI — can never start a contribution as anything but
-- "pending" with no reviewer set. Every real insert path already sends
-- exactly this today, so this is a no-op for legitimate use and a hard
-- close for the bypass case.
drop policy "owners insert own datasets" on performance_datasets;
create policy "owners insert own datasets" on performance_datasets
  for insert with check (
    owner_user_id = auth.uid()
    and validation_status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

-- Curators need to SEE pending contributions to review them — no
-- SELECT policy on performance_datasets has ever covered another
-- owner's rows (0007's only SELECT policy is "owners read own
-- datasets"). Scoped to validation_status = 'pending' only: a curator
-- needs the review queue, never a standing window into every user's
-- entire historical (valid/excluded/flagged) contribution history —
-- least-privilege, and never exposes owner email/identity (this
-- policy governs row visibility only; the application query never
-- joins profiles/auth.users for this read — see
-- lib/contribute/reviewQueries.ts). This policy does no self-select
-- and is unaffected by the audit's finding.
create policy "curators read pending contributions" on performance_datasets
  for select using (fn_is_curator(auth.uid()) and validation_status = 'pending');

-- ---------------------------------------------------------------------
-- fn_review_contribution: the ONLY path from "pending" to "valid" or
-- "excluded". SECURITY DEFINER, owned by the migration-running role
-- (the same role fn_is_curator() and fn_handle_new_user() already run
-- as — 0009/0014), so its internal UPDATE bypasses RLS the same
-- documented way fn_is_curator() already bypasses RLS to read
-- profiles.is_curator. Because of that, authorization is NOT optional
-- application logic sitting on top of a permissive grant here — it is
-- the only gate that exists, enforced inside the function body:
--
--   1. auth.uid() is read server-side from the verified JWT — never a
--      client-supplied "caller id" argument.
--   2. fn_is_curator(auth.uid()) must be true, or the call raises.
--   3. p_decision is typed as the validation_status enum (so it can
--      never be an arbitrary string) AND explicitly restricted to
--      'valid'/'excluded' in the body (so 'pending'/'flagged'/'deleted'
--      — valid enum members, but never valid RPC arguments — still
--      raise).
--   4. The UPDATE's own WHERE clause requires the row's CURRENT
--      validation_status to be 'pending'. This is what makes every
--      forbidden transition impossible in one place, without having to
--      enumerate each one: valid -> excluded, excluded -> valid,
--      valid -> pending, excluded -> pending, and re-approving/
--      re-rejecting an already-decided row all fail identically,
--      because none of them start from 'pending'.
--   5. reviewed_by and reviewed_at are ALWAYS set from auth.uid() and
--      now() inside the function — they are not parameters, so there
--      is no argument a caller could pass to spoof either one.
--   6. Zero matching rows (dataset missing, or not pending) raises
--      'invalid_transition' rather than silently succeeding or
--      returning an empty/ambiguous result.
--
-- Returns only the four columns the caller needs to update its own UI
-- state — never the full row (which would leak owner_user_id,
-- campaign_name, etc. to a curator who has no business seeing them,
-- matching the same least-privilege boundary reviewQueries.ts's read
-- side already applies).
create or replace function fn_review_contribution(
  p_dataset_id uuid,
  p_decision validation_status
)
returns table (
  id uuid,
  validation_status validation_status,
  reviewed_by uuid,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_id uuid;
  v_status validation_status;
  v_reviewed_by uuid;
  v_reviewed_at timestamptz;
begin
  if v_caller is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not fn_is_curator(v_caller) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_decision <> 'valid' and p_decision <> 'excluded' then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  update performance_datasets d
  set validation_status = p_decision,
      reviewed_by = v_caller,
      reviewed_at = now()
  where d.id = p_dataset_id
    and d.validation_status = 'pending'
  returning d.id, d.validation_status, d.reviewed_by, d.reviewed_at
  into v_id, v_status, v_reviewed_by, v_reviewed_at;

  if v_id is null then
    -- No explicit errcode here: RAISE EXCEPTION's own default SQLSTATE
    -- (raise_exception) already applies when none is given, and every
    -- other branch above uses a specific, meaningful SQLSTATE instead.
    raise exception 'invalid_transition';
  end if;

  return query select v_id, v_status, v_reviewed_by, v_reviewed_at;
end;
$$;

comment on function fn_review_contribution is
  'Phase 28 (post-audit revision): the ONLY way validation_status/'
  'reviewed_by/reviewed_at on performance_datasets ever change after '
  'insert. SECURITY DEFINER so its internal UPDATE bypasses RLS (same '
  'sanctioned-bypass pattern as fn_is_curator/fn_handle_new_user) — '
  'authorization (fn_is_curator), the decision whitelist (valid/'
  'excluded only), and the pending-only transition guard are all '
  'enforced inside this function, not left to a table grant or an RLS '
  'policy. Never grant table-level UPDATE on validation_status/'
  'reviewed_by/reviewed_at to authenticated alongside this function — '
  'that would reopen exactly the gap this migration closes.';

-- No table-level UPDATE grant of any kind on performance_datasets for
-- `authenticated` — not even a column-scoped one. The RPC above is the
-- only write path, and EXECUTE on it is a separate privilege from
-- table UPDATE, granted narrowly here:
revoke all on function fn_review_contribution(uuid, validation_status) from public;
grant execute on function fn_review_contribution(uuid, validation_status) to authenticated;

create index idx_datasets_reviewed_by on performance_datasets(reviewed_by) where reviewed_by is not null;
