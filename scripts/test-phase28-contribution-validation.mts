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
// -----------------------------------------------------------------------
assertTrue(isValidContributionReviewTransition("pending", "valid"), "pending -> valid is a valid transition (approve for benchmarks)");
assertTrue(isValidContributionReviewTransition("pending", "excluded"), "pending -> excluded is a valid transition (reject from benchmarks)");
assertTrue(!isValidContributionReviewTransition("valid", "valid"), "an already-valid row can never be re-approved through this path");
assertTrue(!isValidContributionReviewTransition("valid", "excluded"), "an already-valid row can never be rejected after the fact through this path");
assertTrue(!isValidContributionReviewTransition("excluded", "valid"), "an already-excluded (rejected) row can never be silently flipped back to valid");
assertTrue(!isValidContributionReviewTransition("flagged", "valid"), "a flagged row is a different state — not reviewable as if it were pending");
assertTrue(!isValidContributionReviewTransition("deleted", "excluded"), "a deleted row is never reviewable");

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
// §3/§7 Migration 0019: RLS/grants close the self-validation gap for
// real, on both the UPDATE and INSERT paths, without touching 0001-0018
// or the benchmark engine's own eligibility rule.
// -----------------------------------------------------------------------
const migrationSource = readFileSync(new URL("../supabase/migrations/0019_contribution_validation.sql", import.meta.url), "utf8");

assertTrue(migrationSource.includes('create policy "owners finalize own import batch" on import_batches'), "import_batches gets a real owner-scoped UPDATE policy (previously missing entirely)");
assertTrue(migrationSource.includes("grant update (success_count) on import_batches to authenticated"), "the import_batches UPDATE grant is narrowed to success_count only — never a blanket update capability");
assertTrue(migrationSource.includes("revoke update on import_batches from authenticated"), "the table-level update grant is explicitly revoked before being narrowed back down");

assertTrue(migrationSource.includes("add column reviewed_by uuid references auth.users(id)"), "performance_datasets gains reviewed_by, mirroring 0014's existing governance shape");
assertTrue(migrationSource.includes("add column reviewed_at timestamptz"), "performance_datasets gains reviewed_at");

assertTrue(
  migrationSource.includes('drop policy "owners update own datasets" on performance_datasets') &&
  migrationSource.includes("validation_status = (select d.validation_status from performance_datasets d where d.id = performance_datasets.id)"),
  "the pre-existing owner UPDATE policy is replaced with one whose WITH CHECK forbids changing validation_status on the owner's own row"
);
assertTrue(
  migrationSource.includes("reviewed_by is not distinct from (select d.reviewed_by from performance_datasets d where d.id = performance_datasets.id)"),
  "the same owner UPDATE policy also forbids the owner setting reviewed_by themselves"
);
assertTrue(
  migrationSource.includes('drop policy "owners insert own datasets" on performance_datasets') &&
  migrationSource.includes("and validation_status = 'pending'\n    and reviewed_by is null\n    and reviewed_at is null"),
  "the owner INSERT policy is tightened so a direct client insert can never start a contribution as anything but pending/unreviewed"
);
assertTrue(
  migrationSource.includes('create policy "curators review contribution validation" on performance_datasets') &&
  migrationSource.includes("using (fn_is_curator(auth.uid()))"),
  "curators get their own UPDATE policy reusing fn_is_curator — no second authorization system"
);
assertTrue(
  migrationSource.includes('create policy "curators read pending contributions" on performance_datasets') &&
  migrationSource.includes("fn_is_curator(auth.uid()) and validation_status = 'pending'"),
  "curators get a SELECT policy scoped to pending rows only — never a standing window into every user's full contribution history"
);
assertTrue(!/select\s+\*|owner_user_id\s*,\s*email|join\s+profiles/i.test(migrationSource), "the curator SELECT policy never widens to owner identity/email — least-privilege, row visibility only");

assertTrue(!/alter type validation_status add value/i.test(migrationSource), "no new enum value is added — 'excluded' (already documented as \"must never appear in any benchmark\") is reused for curator rejection");
assertTrue(!/update performance_datasets set validation_status/i.test(migrationSource), "the migration never bulk-rewrites existing rows — legacy pending rows stay pending, existing valid rows stay valid (§12/§13)");
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
assertTrue(reviewActionsSource.includes('.eq("validation_status", "pending")'), "the review update itself also filters on pending — a non-pending row's update matches zero rows, defense-in-depth beyond the pure-function check");
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
  translationsSource.includes("benchmarkValidationPendingNote:") &&
  translationsSource.includes("Las campañas fueron importadas correctamente. Su incorporación a los benchmarks está pendiente de validación."),
  "the import-success screen states the exact concise, non-alarming benchmark-pending note the spec calls for"
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
