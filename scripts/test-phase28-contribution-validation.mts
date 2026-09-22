// PHASE 28 — CONTRIBUTION VALIDATION & BENCHMARK ELIGIBILITY.
//
// Same convention as every other scripts/test-*.mts file in this
// project: real imports of the shipped pure modules, paired with
// readFileSync-based structural source-text checks for anything that
// requires a live database (RLS policies, grants, a real curator
// session) to actually exercise — there is no jsdom/React Testing
// Library configured here, and no local Postgres/PostgREST stack in
// this sandbox (scripts/e2e-fixture-test.mts is the one file in this
// project that needs a real DB and is not run here for that reason).

import { readFileSync } from "node:fs";
import {
  authorizeContributionReview,
  isValidContributionReviewTransition,
  isValidContributionReviewDecision,
} from "../lib/contribute/reviewRules";
import {
  tallyRealCampaignCountByBatch,
  resolveBatchDisplayCount,
} from "../lib/contribute/importBatchStatus";

let passed = 0;
let failed = 0;
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`); }
}
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

// -----------------------------------------------------------------------
// §1 Curator authorization (pure logic, real imports)
// -----------------------------------------------------------------------
assertEqual(authorizeContributionReview(false, false), { allowed: false, error: "not_authenticated" }, "signed-out caller is never authorized, regardless of is_curator");
assertEqual(authorizeContributionReview(true, false), { allowed: false, error: "not_authorized" }, "a signed-in non-curator is never authorized to review a contribution");
assertEqual(authorizeContributionReview(true, true), { allowed: true }, "a signed-in curator is authorized");

// -----------------------------------------------------------------------
// §2 Validation lifecycle: only "pending" may transition, only to
// "valid" or "excluded" — never re-review an already-decided row.
//
// POST-AUDIT REVISION: this pure function is no longer called by
// reviewActions.ts before the RPC (that would just reintroduce a
// check-then-act race) — it is kept and tested here as the DB-free
// SPEC of the transition rule that fn_review_contribution()'s own
// atomic UPDATE ... WHERE clause is required to implement. The
// migration-source assertions further below confirm the SQL actually
// matches this same rule.
// -----------------------------------------------------------------------
assertTrue(isValidContributionReviewTransition("pending", "valid"), "pending -> valid is a valid transition (approve for benchmarks)");
assertTrue(isValidContributionReviewTransition("pending", "excluded"), "pending -> excluded is a valid transition (reject from benchmarks)");
assertTrue(!isValidContributionReviewTransition("valid", "valid"), "an already-valid row can never be re-approved through this path");
assertTrue(!isValidContributionReviewTransition("valid", "excluded"), "valid -> excluded is forbidden: an approved row can never be silently rejected after the fact");
assertTrue(!isValidContributionReviewTransition("excluded", "valid"), "excluded -> valid is forbidden: an already-excluded (rejected) row can never be silently flipped back to valid");
assertTrue(!isValidContributionReviewTransition("valid", "pending" as never), "valid -> pending is forbidden: a decided row can never be reopened to pending");
assertTrue(!isValidContributionReviewTransition("excluded", "pending" as never), "excluded -> pending is forbidden: a decided row can never be reopened to pending");
assertTrue(!isValidContributionReviewTransition("flagged", "valid"), "a flagged row is a different state — not reviewable as if it were pending");
assertTrue(!isValidContributionReviewTransition("deleted", "excluded"), "a deleted row is never reviewable");

// -----------------------------------------------------------------------
// §2b Decision whitelist: cheap, DB-free rejection of a garbage
// `decision` value before ever calling the RPC (real input validation,
// since a server action is reachable as a plain network call, not just
// through the TypeScript-typed UI).
// -----------------------------------------------------------------------
assertTrue(isValidContributionReviewDecision("valid"), "'valid' is an accepted decision");
assertTrue(isValidContributionReviewDecision("excluded"), "'excluded' is an accepted decision");
assertTrue(!isValidContributionReviewDecision("pending"), "'pending' is a real validation_status value but never a valid RPC decision");
assertTrue(!isValidContributionReviewDecision("flagged"), "'flagged' is a real validation_status value but never a valid RPC decision");
assertTrue(!isValidContributionReviewDecision("deleted"), "'deleted' is a real validation_status value but never a valid RPC decision");
assertTrue(!isValidContributionReviewDecision("DROP TABLE performance_datasets"), "an arbitrary garbage string is rejected, not just enum-adjacent values");

// -----------------------------------------------------------------------
// §17 Phase 27's read-side fallback, now demoted to defensive-only:
// stored factual count is primary once persistence is fixed; the real
// linked-dataset tally only fills in for a genuine 0/legacy case.
// -----------------------------------------------------------------------
assertEqual(resolveBatchDisplayCount(3, 3), 3, "a correctly-finalized batch shows its own stored count");
assertEqual(resolveBatchDisplayCount(3, undefined), 3, "stored count alone is trusted even with no real-tally data at hand");
assertEqual(resolveBatchDisplayCount(0, 5), 5, "a legacy/still-broken batch (stored 0) falls back to the real linked-campaign tally");
assertEqual(resolveBatchDisplayCount(0, 0), 0, "a genuinely failed import (stored 0, zero real linked rows) is never inflated to a fake success");
assertEqual(resolveBatchDisplayCount(0, undefined), 0, "no real-tally data and a stored 0 stays honestly 0 — never fabricated");

const tally = tallyRealCampaignCountByBatch([
  { import_batch_id: "b1" },
  { import_batch_id: "b1" },
  { import_batch_id: "b2" },
  { import_batch_id: null },
  { import_batch_id: "b1", validation_status: "deleted" },
]);
assertEqual(tally.get("b1"), 2, "the real tally counts only non-deleted rows linked to a given batch");
assertEqual(tally.get("b2"), 1, "a second batch is tallied independently");
assertEqual(tally.get("b3"), undefined, "a batch with no linked rows has no entry at all — never a fabricated 0 vs. a real 0");

// -----------------------------------------------------------------------
// §3/§7 Migration 0019 (post-audit revision): owners lose UPDATE on
// performance_datasets entirely — no self-select WITH CHECK anywhere —
// and the only write path for validation_status/reviewed_by/
// reviewed_at is the fn_review_contribution() SECURITY DEFINER RPC.
// None of this touches 0001-0018 or the benchmark engine's own
// eligibility rule.
// -----------------------------------------------------------------------
const migrationSource = readFileSync(new URL("../supabase/migrations/0019_contribution_validation.sql", import.meta.url), "utf8");

assertTrue(migrationSource.includes('create policy "owners finalize own import batch" on import_batches'), "import_batches gets a real owner-scoped UPDATE policy (previously missing entirely)");
assertTrue(migrationSource.includes("grant update (success_count) on import_batches to authenticated"), "the import_batches UPDATE grant is narrowed to success_count only — never a blanket update capability");
assertTrue(migrationSource.includes("revoke update on import_batches from authenticated"), "the table-level update grant is explicitly revoked before being narrowed back down");

assertTrue(migrationSource.includes("add column reviewed_by uuid references auth.users(id)"), "performance_datasets gains reviewed_by, mirroring 0014's existing governance shape");
assertTrue(migrationSource.includes("add column reviewed_at timestamptz"), "performance_datasets gains reviewed_at");

// The external audit's core finding: no self-select subquery against
// performance_datasets from within its own RLS policy, anywhere.
assertTrue(
  !/select\s+d\.\w+\s+from\s+performance_datasets\s+d\s+where\s+d\.id\s*=\s*performance_datasets\.id/i.test(migrationSource),
  "no self-referential WITH CHECK subquery against performance_datasets exists anywhere in this migration"
);
assertTrue(
  migrationSource.includes('drop policy "owners update own datasets" on performance_datasets') &&
  !migrationSource.includes('create policy "owners update own datasets" on performance_datasets'),
  "the pre-existing owner UPDATE policy is dropped outright and never recreated — no product feature ever updates this table as its owner"
);
assertTrue(
  (migrationSource.match(/revoke update on performance_datasets from authenticated/g) ?? []).length === 1,
  "table-level UPDATE is revoked from authenticated on performance_datasets — no column-scoped grant reopens it"
);
assertTrue(
  !/grant update\s*\([^)]*\)\s*on performance_datasets/i.test(migrationSource),
  "no column-scoped UPDATE grant of any kind exists on performance_datasets for authenticated — the RPC is the only write path"
);

assertTrue(
  migrationSource.includes('drop policy "owners insert own datasets" on performance_datasets') &&
  migrationSource.includes("and validation_status = 'pending'\n    and reviewed_by is null\n    and reviewed_at is null"),
  "the owner INSERT policy is tightened so a direct client insert can never start a contribution as anything but pending/unreviewed"
);
assertTrue(
  migrationSource.includes('create policy "curators read pending contributions" on performance_datasets') &&
  migrationSource.includes("fn_is_curator(auth.uid()) and validation_status = 'pending'"),
  "curators get a SELECT policy scoped to pending rows only — never a standing window into every user's full contribution history"
);
assertTrue(!/select\s+\*|owner_user_id\s*,\s*email|join\s+profiles/i.test(migrationSource), "the curator SELECT policy never widens to owner identity/email — least-privilege, row visibility only");
assertTrue(
  !migrationSource.includes('create policy "curators review contribution validation"'),
  "the old bare curator UPDATE policy (using only fn_is_curator, no transition guard) is gone — replaced by the RPC"
);

// fn_review_contribution(): SECURITY DEFINER, explicit search_path,
// re-checks authorization and the decision whitelist itself, and its
// UPDATE's WHERE clause is the actual pending-only transition guard.
assertTrue(
  migrationSource.includes("create or replace function fn_review_contribution(") &&
  migrationSource.includes("security definer") &&
  migrationSource.includes("set search_path = public"),
  "fn_review_contribution is SECURITY DEFINER with an explicit search_path, matching fn_is_curator's own established pattern"
);
assertTrue(
  migrationSource.includes("v_caller uuid := auth.uid();") && migrationSource.includes("if v_caller is null then"),
  "the RPC derives the caller from auth.uid() server-side — never a client-supplied caller id parameter"
);
assertTrue(
  !/fn_review_contribution\([^)]*reviewed_by/i.test(migrationSource),
  "fn_review_contribution's own parameter list never includes reviewed_by — it is impossible for a caller to pass one"
);
assertTrue(
  !/fn_review_contribution\([^)]*reviewed_at/i.test(migrationSource),
  "fn_review_contribution's own parameter list never includes reviewed_at — it is impossible for a caller to pass one"
);
assertTrue(migrationSource.includes("if not fn_is_curator(v_caller) then"), "the RPC re-checks fn_is_curator(auth.uid()) itself — authorization does not rely on the caller having already been checked elsewhere");
assertTrue(migrationSource.includes("if p_decision <> 'valid' and p_decision <> 'excluded' then"), "the RPC explicitly whitelists valid/excluded — 'pending'/'flagged'/'deleted' are real enum values but rejected as decisions");
assertTrue(
  migrationSource.includes("where d.id = p_dataset_id") && migrationSource.includes("and d.validation_status = 'pending'"),
  "the RPC's own UPDATE only ever matches a row whose CURRENT status is pending — this single WHERE clause is what makes every forbidden transition (valid->excluded, excluded->valid, valid->pending, excluded->pending, re-review) impossible at once"
);
assertTrue(
  migrationSource.includes("reviewed_by = v_caller") && migrationSource.includes("reviewed_at = now()"),
  "reviewed_by/reviewed_at are always set from the server-derived caller id and clock, never from a parameter"
);
assertTrue(
  migrationSource.includes("if v_id is null then") && migrationSource.includes("raise exception 'invalid_transition'"),
  "a dataset that doesn't exist or isn't pending raises a distinct, safe error rather than silently succeeding or returning ambiguous emptiness"
);
assertTrue(
  migrationSource.includes("grant execute on function fn_review_contribution(uuid, validation_status) to authenticated") &&
  migrationSource.includes("revoke all on function fn_review_contribution(uuid, validation_status) from public"),
  "EXECUTE on the RPC is granted only to authenticated, after first revoking the default PUBLIC execute grant Postgres applies to new functions"
);

assertTrue(!/alter type validation_status add value/i.test(migrationSource), "no new enum value is added — 'excluded' (already documented as \"must never appear in any benchmark\") is reused for curator rejection");
assertTrue(!/^\s*update performance_datasets set validation_status/im.test(migrationSource), "the migration never bulk-rewrites existing rows outside the RPC's own per-call, per-row update — legacy pending rows stay pending, existing valid/excluded rows stay as they are (§12/§13)");
const migrationCodeOnly = migrationSource.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
assertTrue(!/0001|0002|0003|0004|0005|0006|0007|0008|0009|0010|0011|0012|0013|0014|0015|0016|0017|0018/.test(migrationCodeOnly), "no prior migration file (0001-0018) is edited outside of explanatory comments — this migration only adds to what already exists");

// -----------------------------------------------------------------------
// §9 Benchmark engine untouched: still the sole gate, still admin-client
// server-side aggregation only, never a bypass for a curator-approved row.
// -----------------------------------------------------------------------
const engineSource = readFileSync(new URL("../lib/benchmark/engine.ts", import.meta.url), "utf8");
assertTrue(engineSource.includes('.eq("validation_status", "valid")'), "the benchmark engine's eligibility rule is completely unchanged — still requires validation_status = 'valid'");
assertTrue(!/is_curator|fn_is_curator|validation_status.*pending/i.test(engineSource), "the benchmark engine has no special-cased curator bypass and no path that would ever include a pending/excluded row");

// -----------------------------------------------------------------------
// §4 Import-batch finalize is no longer a silent fire-and-forget.
// -----------------------------------------------------------------------
const bulkActionsSource = readFileSync(new URL("../app/contribute/bulk-actions.ts", import.meta.url), "utf8");
assertTrue(
  bulkActionsSource.includes("const { error: finalizeError } = await supabase.from(\"import_batches\").update({ success_count: imported }).eq(\"id\", batchId);") &&
  bulkActionsSource.includes('if (finalizeError) {\n      console.error("[bulk-import] batch finalization failed", finalizeError);'),
  "the batch-finalizing update now checks and logs its own error instead of being a silent fire-and-forget"
);

// -----------------------------------------------------------------------
// §5 Curator workflow: reuses the existing curation page/components —
// no second admin system.
// -----------------------------------------------------------------------
const curationViewSource = readFileSync(new URL("../app/curation/CurationView.tsx", import.meta.url), "utf8");
assertTrue(curationViewSource.includes('title={t("curation.contributionsTitle")}'), "the contribution review queue is a new Section on the SAME /curation page");
assertTrue(curationViewSource.includes("<ReviewRow"), "it reuses the existing ReviewRow component — no bespoke review UI");
assertTrue(
  curationViewSource.includes('onApprove={() => reviewContributionAction(c.id, "valid")}') &&
  curationViewSource.includes('onReject={() => reviewContributionAction(c.id, "excluded")}'),
  "approve maps to valid, reject maps to excluded — matching the pure transition rule exactly"
);
assertTrue(!/owner_user_id|\bemail\b/i.test(curationViewSource), "the curator UI never renders owner identity or email");

const curationPageSource = readFileSync(new URL("../app/curation/page.tsx", import.meta.url), "utf8");
assertTrue(curationPageSource.includes("getPendingContributionsQueue()") && curationPageSource.includes("Promise.all"), "the new queue is fetched in parallel with the existing governance queue — no sequential reads added");
assertTrue(curationPageSource.includes("if (!userId || !isCurator)"), "the existing server-side curator gate is untouched and still runs before either queue is fetched");

const reviewQueriesSource = readFileSync(new URL("../lib/contribute/reviewQueries.ts", import.meta.url), "utf8");
assertTrue(reviewQueriesSource.includes('.eq("validation_status", "pending")'), "the pending-contributions read is scoped to pending rows, relying on RLS as the real boundary");
const reviewQueriesCodeOnly = reviewQueriesSource.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
assertTrue(!/owner_user_id|profiles\(|auth\.users/.test(reviewQueriesCodeOnly), "the query never selects/joins owner identity — curators never see who submitted a contribution");

const reviewActionsSource = readFileSync(new URL("../lib/contribute/reviewActions.ts", import.meta.url), "utf8");
assertTrue(
  reviewActionsSource.includes('supabase.rpc("fn_review_contribution"') &&
  reviewActionsSource.includes("p_dataset_id: datasetId") &&
  reviewActionsSource.includes("p_decision: decision"),
  "the server action calls fn_review_contribution() via RPC instead of a direct .from(\"performance_datasets\").update(...)"
);
assertTrue(
  !reviewActionsSource.includes('.from("performance_datasets").update(') && !/\.from\("performance_datasets"\)\s*\n?\s*\.update\(/.test(reviewActionsSource),
  "the server action never issues a raw UPDATE on performance_datasets itself — the RPC is the only write path"
);
assertTrue(reviewActionsSource.includes("isValidContributionReviewDecision(decision)"), "the action rejects an invalid decision value before ever calling the RPC");
assertTrue(reviewActionsSource.includes("revalidatePath(\"/curation\")"), "the curator's own queue is revalidated after a decision, matching the existing governance action pattern");

// -----------------------------------------------------------------------
// §7/§15 Owner-facing status semantics: import success and benchmark
// eligibility are shown as two separate, distinctly-labeled facts.
// -----------------------------------------------------------------------
const contributionDetailSource = readFileSync(new URL("../app/account/contributions/[id]/ContributionDetail.tsx", import.meta.url), "utf8");
assertTrue(contributionDetailSource.includes('{t("contributions.importCompleted")}'), "the contribution detail page states plainly that the import completed");
assertTrue(contributionDetailSource.includes('{t("contributions.benchmarkStatusLabel")}:'), "the benchmark-eligibility pill is explicitly labeled as such, never left ambiguous");

const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");
assertTrue(translationsSource.includes('pending: "En revisión"') && translationsSource.includes('pending: "In review"'), "the benchmark-status pill's pending label reads as a review state, not an import action item, now that it's clearly scoped by the separate importCompleted line");
assertTrue(translationsSource.includes('valid: "Aprobada para benchmarks"') && translationsSource.includes('valid: "Approved for benchmarks"'), "approved contributions read as explicitly benchmark-approved, in both locales");
assertTrue(translationsSource.includes('excluded: "No incluida en benchmarks"') && translationsSource.includes('excluded: "Not included in benchmarks"'), "rejected contributions read as excluded from benchmarks specifically, never as a generic/alarming \"Excluded\"");
assertTrue(
  // PHASE 31 item 6 reworded this note ("Tus campañas quedaron en
  // revisión para su incorporación a benchmarks.") to match the same
  // "en revisión" wording used by the contribution-status labels above
  // — this assertion checks for the current, Phase-31-updated copy,
  // not the original Phase 28 wording it replaced.
  translationsSource.includes('benchmarkValidationPendingNote: "Tus campañas quedaron en revisión para su incorporación a benchmarks."') &&
  translationsSource.includes('benchmarkValidationPendingNote: "Your campaigns are in review for inclusion in benchmarks."'),
  "the import-success screen states the current, concise, non-alarming benchmark-pending note in both locales"
);

const contributeLandingSource = readFileSync(new URL("../app/contribute/ContributeLanding.tsx", import.meta.url), "utf8");
assertTrue(
  contributeLandingSource.includes('{result.imported > 0 && (') &&
  contributeLandingSource.includes('{t("contribute.import.benchmarkValidationPendingNote")}'),
  "the benchmark-pending note only ever appears alongside an actually-successful import, never framing a fully-failed import as if something succeeded"
);
assertTrue(contributeLandingSource.includes('{t("contribute.import.doneTitle")}'), "the import-success screen's own headline is completely untouched — a successful import still reads as a success");

console.log(`test-phase28-contribution-validation: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
