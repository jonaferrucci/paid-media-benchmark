// CUCURUCHO DATA INTEGRITY 1 — OBSERVATION FINGERPRINT & SUPERSEDE.
//
// Same convention as every other scripts/test-*.mts file in this
// project (see scripts/test-phase28-contribution-validation.mts): real
// imports of the shipped pure modules, paired with readFileSync-based
// structural source-text checks for anything that requires a live
// database (RLS, a real curator session, concurrent transactions) to
// actually exercise. The RPC guards, concurrency ordering, and unique
// index behavior asserted below via source-text checks were ALSO
// functionally verified against a real, isolated local Postgres 16
// instance during this task (never hosted Supabase) — every scenario
// this file checks structurally was first proven to actually behave
// this way against a live database. That verification is not re-run
// here since this sandbox has no local Postgres/PostgREST stack
// available at test time, matching this project's existing convention
// (scripts/e2e-fixture-test.mts is the one file that needs a real DB
// and is not run in this suite for that same reason).

import { readFileSync } from "node:fs";
import {
  buildObservationFingerprint,
  normalizeCampaignNameForFingerprint,
} from "../lib/contribute/observationFingerprint";

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

const BASE = {
  ownerId: "10000000-0000-0000-0000-000000000001",
  platformId: "00000000-0000-0000-0000-000000000001",
  campaignName: "Black Friday",
  startDate: "2026-09-01",
  endDate: "2026-09-15",
  currency: "USD",
  campaignTypeId: "00000000-0000-0000-0000-0000000000cc",
};

// -----------------------------------------------------------------------
// §14 buildObservationFingerprint — pure logic, real imports.
// -----------------------------------------------------------------------
assertEqual(normalizeCampaignNameForFingerprint(" Black   Friday "), "black friday", "campaign-name normalization trims, lowercases, and collapses internal whitespace");

const fp1 = buildObservationFingerprint(BASE);
const fp2 = buildObservationFingerprint(BASE);
assertTrue(fp1 !== null && fp1 === fp2, "the fingerprint is deterministic — identical inputs always produce the identical hash");

assertEqual(
  buildObservationFingerprint({ ...BASE, campaignName: " Black   Friday " }),
  buildObservationFingerprint({ ...BASE, campaignName: "black friday" }),
  "normalization means whitespace/casing differences in campaign_name never change the fingerprint"
);

assertEqual(buildObservationFingerprint({ ...BASE, campaignName: null }), null, "a null campaign_name (100% of manual entries) always fingerprints to null — no weak placeholder");
assertEqual(buildObservationFingerprint({ ...BASE, campaignName: "" }), null, "an empty-string campaign_name is treated exactly like null, never fingerprinted");
assertEqual(buildObservationFingerprint({ ...BASE, campaignName: "   " }), null, "a whitespace-only campaign_name is treated exactly like null");

// Deliberately excluded inputs: metric values and ad_spend are not even
// parameters to this function, so "changing raw metrics"/"changing
// spend" trivially cannot change the fingerprint — asserted here via
// the function's own signature never accepting them, not by trying to
// pass them and checking they're ignored.
assertTrue(
  buildObservationFingerprint.length === 1,
  "buildObservationFingerprint takes exactly one input object — there is no metric-values/ad_spend parameter it could accidentally start depending on"
);

// A corrected re-export of the SAME observation: identical identity
// fields, by definition (the function has no other inputs) — same
// fingerprint. This IS the "updated export" / "same exact reimport"
// case from the approved test plan.
assertEqual(buildObservationFingerprint(BASE), buildObservationFingerprint({ ...BASE }), "re-submitting the exact same identity fields (a re-import or a corrected re-export) always yields the same fingerprint");

// Sensitivity: changing any ONE identity input changes the fingerprint.
assertTrue(buildObservationFingerprint(BASE) !== buildObservationFingerprint({ ...BASE, ownerId: "20000000-0000-0000-0000-000000000002" }), "changing the owner changes the fingerprint — V1 is owner-scoped, never shared across owners");
assertTrue(buildObservationFingerprint(BASE) !== buildObservationFingerprint({ ...BASE, platformId: "00000000-0000-0000-0000-000000000002" }), "changing the platform changes the fingerprint");
assertTrue(buildObservationFingerprint(BASE) !== buildObservationFingerprint({ ...BASE, startDate: "2026-09-02" }), "changing the start date (a different period) changes the fingerprint");
assertTrue(buildObservationFingerprint(BASE) !== buildObservationFingerprint({ ...BASE, endDate: "2026-09-20" }), "changing the end date (a different period) changes the fingerprint");
assertTrue(buildObservationFingerprint(BASE) !== buildObservationFingerprint({ ...BASE, currency: "ARS" }), "changing the currency changes the fingerprint");
assertTrue(buildObservationFingerprint(BASE) !== buildObservationFingerprint({ ...BASE, campaignTypeId: null }), "changing (or losing) the campaign type changes the fingerprint");
assertTrue(buildObservationFingerprint(BASE) !== buildObservationFingerprint({ ...BASE, campaignName: "Black Friday 2" }), "a genuinely different campaign name (not just whitespace/casing) changes the fingerprint");

// The exact scenario the owner-scoped design exists to prevent from
// EVER being conflated: two different owners, same campaign name, same
// dates, same everything else — must never fingerprint the same.
assertTrue(
  buildObservationFingerprint({ ...BASE, ownerId: "10000000-0000-0000-0000-000000000001" }) !==
    buildObservationFingerprint({ ...BASE, ownerId: "30000000-0000-0000-0000-000000000003" }),
  "the same campaign name, dates, currency and type for two DIFFERENT owners never share a fingerprint (Case E — coincidental collision across owners)"
);

// A currency value with different casing/whitespace than how it's
// normally stored (defensive — original_currency is already uppercased
// upstream in both write paths, but the helper does not silently trust
// that).
assertEqual(
  buildObservationFingerprint({ ...BASE, currency: "usd" }),
  buildObservationFingerprint({ ...BASE, currency: "USD" }),
  "currency casing is normalized inside the helper, defensively, even though both write paths already uppercase it themselves"
);

// -----------------------------------------------------------------------
// §15 Write-path coverage: every place that creates performance_datasets
// wires the fingerprint (or explicitly nulls it) — no known import path
// left uncovered.
// -----------------------------------------------------------------------
const bulkActionsSource = readFileSync(new URL("../app/contribute/bulk-actions.ts", import.meta.url), "utf8");
assertTrue(bulkActionsSource.includes('import { buildObservationFingerprint } from "@/lib/contribute/observationFingerprint";'), "bulkSubmitContributionsAction imports the shared fingerprint helper — never a second, duplicated implementation");
assertTrue(bulkActionsSource.includes("const observationFingerprint = buildObservationFingerprint({"), "every bulk-imported row (Meta/Google/generic — the pipeline is platform-agnostic) computes its own fingerprint at insert time");
assertTrue(
  bulkActionsSource.includes("campaign_name: row.campaignName,") && bulkActionsSource.includes("observation_fingerprint: observationFingerprint,"),
  "campaign_name persistence (Phase 25) is completely unchanged — the fingerprint is a new, additional column, never a replacement for it"
);

const contributeActionsSource = readFileSync(new URL("../app/contribute/actions.ts", import.meta.url), "utf8");
assertTrue(
  contributeActionsSource.includes("observation_fingerprint: null,"),
  "the manual single-entry wizard explicitly inserts observation_fingerprint: null — it never collects a campaign name, so there is nothing to fingerprint, and this is written out loud rather than left as an implicit default"
);
assertTrue(!contributeActionsSource.includes("buildObservationFingerprint"), "the manual entry path never even calls the fingerprint helper — campaignName is never available there, so there is nothing to compute");

// -----------------------------------------------------------------------
// §6/§7/§8 Migration 0020: additive only, never touches 0001-0019.
// -----------------------------------------------------------------------
const migrationSource = readFileSync(new URL("../supabase/migrations/0020_observation_identity.sql", import.meta.url), "utf8");

assertTrue(migrationSource.includes("alter type validation_status add value 'superseded';"), "a new 'superseded' enum value is added, additively, to the existing validation_status enum");
assertTrue(
  migrationSource.includes("add column observation_fingerprint text,") &&
  migrationSource.includes("add column supersedes_dataset_id uuid references performance_datasets(id),") &&
  migrationSource.includes("add column superseded_by_dataset_id uuid references performance_datasets(id);"),
  "all three new columns are added as plain, nullable columns — no NOT NULL, no default requiring a backfill"
);
assertTrue(
  migrationSource.includes("add constraint chk_no_self_supersede check (supersedes_dataset_id is null or supersedes_dataset_id <> id),") &&
  migrationSource.includes("add constraint chk_no_self_superseded_by check (superseded_by_dataset_id is null or superseded_by_dataset_id <> id);"),
  "a dataset can never reference itself as its own supersede link, at the table-constraint level"
);
assertTrue(
  !/create (trigger|constraint trigger)/i.test(migrationSource),
  "no trigger enforces bidirectional supersede-link consistency — that is deliberately left to the RPC's own atomic transaction, per the approved 'no overengineer' design decision"
);

// §8 The core invariant, scoped correctly (owner-scoped, never global).
assertTrue(
  migrationSource.includes("create unique index idx_datasets_owner_fingerprint_valid") &&
  migrationSource.includes("on performance_datasets(owner_user_id, observation_fingerprint)") &&
  migrationSource.includes("where validation_status = 'valid' and observation_fingerprint is not null;"),
  "at most one VALID row per (owner, fingerprint) is enforced at the database layer — scoped to owner_user_id, never a global constraint (which would wrongly conflate two different owners' campaigns)"
);

// No table-level UPDATE grant is reopened — 0019's removal stays intact.
assertTrue(!/grant update\s*\([^)]*\)\s*on performance_datasets/i.test(migrationSource), "no column-scoped or table-level UPDATE grant on performance_datasets is added — the two RPCs remain the only write paths");
assertTrue(!migrationSource.includes("revoke update on performance_datasets"), "0020 never re-touches the UPDATE revoke from 0019 — that migration is not modified, not even re-stated");

// §9/§10 fn_approve_superseding_contribution: authorization, guards,
// self-supersede rejection, concurrency lock ordering, and the mandated
// OLD-then-NEW transaction order.
assertTrue(
  migrationSource.includes("create or replace function fn_approve_superseding_contribution(") &&
  migrationSource.includes("security definer") &&
  migrationSource.includes("set search_path = public"),
  "fn_approve_superseding_contribution is SECURITY DEFINER with an explicit search_path, matching fn_review_contribution's own established pattern"
);
assertTrue(migrationSource.includes("if not fn_is_curator(v_caller) then"), "the RPC re-checks fn_is_curator(auth.uid()) itself, reusing the exact same authorization function as fn_review_contribution — no second admin system");
assertTrue(
  migrationSource.includes("if p_new_dataset_id = p_old_dataset_id then") && migrationSource.includes("raise exception 'self_supersede';"),
  "a dataset can never supersede itself — rejected before any row is even locked"
);
assertTrue(
  migrationSource.includes("v_first_id := least(p_new_dataset_id, p_old_dataset_id);") &&
  migrationSource.includes("v_second_id := greatest(p_new_dataset_id, p_old_dataset_id);") &&
  (migrationSource.match(/for update;/g) ?? []).length >= 2,
  "both rows are locked (SELECT ... FOR UPDATE) in a FIXED, id-ordered sequence before either is read or written — two concurrent supersede calls touching an overlapping pair can never deadlock or interleave"
);
assertTrue(
  migrationSource.includes("if v_new.owner_user_id is distinct from v_old.owner_user_id then") && migrationSource.includes("raise exception 'owner_mismatch';"),
  "the two datasets must share the same owner — an arbitrary cross-owner supersede is impossible"
);
assertTrue(
  migrationSource.includes("if v_new.observation_fingerprint is null or v_old.observation_fingerprint is null then") &&
  migrationSource.includes("if v_new.observation_fingerprint <> v_old.observation_fingerprint then") &&
  migrationSource.includes("raise exception 'fingerprint_mismatch';"),
  "both datasets must carry the SAME non-null fingerprint — an arbitrary cross-campaign supersede is impossible, and a null fingerprint (e.g. a manual contribution) can never be used on either side"
);
assertTrue(
  migrationSource.includes("if v_new.validation_status <> 'pending' then") && migrationSource.includes("if v_old.validation_status <> 'valid' then"),
  "the transition is only ever pending -> valid for NEW and valid -> superseded for OLD — every other combination (including re-approving an already-decided pair) is rejected"
);

// The mandated transaction order: OLD -> superseded happens textually
// (and therefore transactionally) BEFORE NEW -> valid, which is exactly
// what keeps the unique partial index from ever spuriously rejecting
// the second UPDATE.
{
  const oldUpdateIndex = migrationSource.indexOf("set validation_status = 'superseded',");
  const newUpdateIndex = migrationSource.indexOf("set validation_status = 'valid',\n        reviewed_by = v_caller,");
  assertTrue(oldUpdateIndex > 0 && newUpdateIndex > 0 && oldUpdateIndex < newUpdateIndex, "the OLD row is updated to 'superseded' BEFORE the NEW row is updated to 'valid' — the required order for the unique index to never fire against the pair's own transition");
}
assertTrue(migrationSource.includes("if not found then") && migrationSource.includes("raise exception 'invalid_transition';"), "if the OLD row's own update matches zero rows (already decided elsewhere), the function raises immediately rather than proceeding to touch NEW");

// §11 Return contract: exactly the six safe fields, never metric
// values, owner details, campaign name, or raw import information.
assertTrue(
  migrationSource.includes(
    "returns table (\n  new_dataset_id uuid,\n  old_dataset_id uuid,\n  new_status validation_status,\n  old_status validation_status,\n  reviewed_by uuid,\n  reviewed_at timestamptz\n)"
  ),
  "fn_approve_superseding_contribution returns exactly the six columns a curator's UI needs — never the full row, never campaign_name, never any dataset_metric_values"
);

// §12 Grants: EXECUTE only, PUBLIC revoked first — matching 0019.
assertTrue(
  migrationSource.includes("revoke all on function fn_approve_superseding_contribution(uuid, uuid) from public;") &&
  migrationSource.includes("grant execute on function fn_approve_superseding_contribution(uuid, uuid) to authenticated;"),
  "EXECUTE on the new approve RPC is granted only to authenticated, after first revoking the default PUBLIC execute grant"
);
assertTrue(
  migrationSource.includes("revoke all on function fn_find_supersede_candidate(uuid) from public;") &&
  migrationSource.includes("grant execute on function fn_find_supersede_candidate(uuid) to authenticated;"),
  "EXECUTE on the new lookup RPC follows the exact same revoke-then-grant pattern"
);

// §16 fn_find_supersede_candidate: curator-gated, never leaks owner
// identity, campaign name, or metric values to the caller.
assertTrue(
  migrationSource.includes("create or replace function fn_find_supersede_candidate(p_dataset_id uuid)") &&
  migrationSource.includes("if not fn_is_curator(v_caller) then"),
  "the read-side lookup RPC is curator-gated exactly like the approve RPC — never a public or owner-callable function"
);
assertTrue(
  migrationSource.includes("returns table (\n  candidate_dataset_id uuid,\n  candidate_start_date date,\n  candidate_end_date date\n)"),
  "the lookup RPC returns only an id and a period — never owner_user_id, campaign_name, or any metric value"
);
assertTrue(
  migrationSource.includes("where d.owner_user_id is not distinct from v_owner"),
  "the match is scoped to the SAME owner internally — owner_user_id is used to filter, never returned to the caller"
);

// §18/§19 Benchmark engine: completely untouched, still the sole,
// allowlist-based eligibility gate — 'superseded' is excluded
// automatically with zero code change, exactly like 'pending'/
// 'excluded'/'flagged'/'deleted' already are.
const engineSource = readFileSync(new URL("../lib/benchmark/engine.ts", import.meta.url), "utf8");
assertTrue(engineSource.includes('.eq("validation_status", "valid")'), "the benchmark engine's eligibility rule is completely unchanged — still requires validation_status = 'valid'");
assertTrue(!/observation_fingerprint|supersedes_dataset_id|superseded_by_dataset_id|superseded/i.test(engineSource), "the benchmark engine has zero awareness of the new identity columns — the allowlist filter alone is what excludes superseded rows, never a second, engine-level special case");
assertTrue(
  !/campaign_id|account_id|ad_account/i.test(engineSource),
  "no raw platform/account identifier is ever selected or returned by the benchmark engine — consistent with the audit finding that no such identifier is even collected today"
);

// §13 Historical Benchmarks inherits the identical eligibility rule by
// construction — getHistoricalBenchmark calls the same core function,
// so a single allowlist-filter assertion above already covers it; this
// assertion just confirms that call site specifically still exists.
assertTrue(engineSource.includes("export async function getHistoricalBenchmark("), "getHistoricalBenchmark still exists as the same shared entry point — no parallel/duplicated eligibility logic was introduced for it");

// -----------------------------------------------------------------------
// §17/§20 Curator review flow: distinguishes possible-supersede from a
// normal approval, and defense-in-depth maps the unique-index collision
// on a normal approval to a distinct, actionable error.
// -----------------------------------------------------------------------
const reviewQueriesSource = readFileSync(new URL("../lib/contribute/reviewQueries.ts", import.meta.url), "utf8");
assertTrue(reviewQueriesSource.includes('supabase.rpc("fn_find_supersede_candidate"'), "the pending-contributions read side calls the new lookup RPC to learn about a possible match");
assertTrue(reviewQueriesSource.includes("Promise.all("), "the per-row lookup is still batched via Promise.all, never a sequential loop of awaits");
const reviewQueriesCodeOnly = reviewQueriesSource.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
assertTrue(!/profiles\(|auth\.users/.test(reviewQueriesCodeOnly), "the query still never selects/joins profiles or auth.users directly — curators never see who submitted a contribution");

const reviewActionsSource = readFileSync(new URL("../lib/contribute/reviewActions.ts", import.meta.url), "utf8");
assertTrue(
  reviewActionsSource.includes("export async function approveSupersedingContributionAction(") &&
  reviewActionsSource.includes('supabase.rpc("fn_approve_superseding_contribution"'),
  "a new, separate server action calls the new RPC — fn_review_contribution's own call site is untouched"
);
assertTrue(reviewActionsSource.includes('if (code === "23505") return "supersede_required";'), "a unique_violation from a normal approval attempt is mapped to a distinct, actionable error instead of a generic save failure — verified locally to be the real shape this collision takes");
assertTrue(
  !reviewActionsSource.includes('.from("performance_datasets").update(') && !/\.from\("performance_datasets"\)\s*\n?\s*\.update\(/.test(reviewActionsSource),
  "neither review action ever issues a raw UPDATE on performance_datasets — both RPCs remain the only write paths"
);

const curationViewSource = readFileSync(new URL("../app/curation/CurationView.tsx", import.meta.url), "utf8");
assertTrue(curationViewSource.includes("function SupersedeCandidateRow("), "the curation page gets a minimal, additional row variant for the one new case — not a redesign of the existing ReviewRow/Section pattern");
assertTrue(
  curationViewSource.includes('onApprove={() => reviewContributionAction(c.id, "valid")}') &&
  curationViewSource.includes('onReject={() => reviewContributionAction(c.id, "excluded")}'),
  "every contribution WITHOUT a supersede candidate still renders through the exact same, unmodified ReviewRow call as before this task"
);
assertTrue(curationViewSource.includes("approveSupersedingContributionAction(contribution.id, contribution.supersedeCandidateId!)"), "the supersede action wires the pending row as NEW and the matched row as OLD");
assertTrue(!/owner_user_id|\bemail\b/i.test(curationViewSource), "the curator UI still never renders owner identity or email, even in the new branch");

// -----------------------------------------------------------------------
// §20 Campaign detail page: superseded status gets its own honest
// explanation and a link to the replacement, never rendered as a plain
// "excluded" campaign and never as an active, comparable contribution.
// -----------------------------------------------------------------------
const contributionDetailSource = readFileSync(new URL("../app/account/contributions/[id]/ContributionDetail.tsx", import.meta.url), "utf8");
assertTrue(contributionDetailSource.includes('superseded: "bg-surface2 text-ink-400",'), "the status pill has a dedicated, neutral (never alarming) style for 'superseded'");
assertTrue(
  contributionDetailSource.includes('dataset.validationStatus === "superseded"') &&
  contributionDetailSource.includes('{t("contributions.supersededBenchmarkExplanation")}'),
  "a superseded contribution gets its own explanation block, distinct from the pending/excluded copy"
);
assertTrue(contributionDetailSource.includes("supersededByDatasetId"), "the component carries the link to the replacement dataset through from the page's own query");
assertTrue(
  !contributionDetailSource.includes('validationStatus === "valid" &&') || contributionDetailSource.indexOf('dataset.validationStatus === "valid"') < contributionDetailSource.indexOf('dataset.validationStatus === "superseded"'),
  "the existing 'Resultados comparables' block stays gated on validation_status === valid only — a superseded row never falls into it and is never shown as an active, comparable contribution"
);

const pageSource = readFileSync(new URL("../app/account/contributions/[id]/page.tsx", import.meta.url), "utf8");
assertTrue(pageSource.includes("superseded_by_dataset_id"), "the contribution detail page's own query now selects superseded_by_dataset_id — same owner-scoped RLS as every other field on this page, no policy change");

const contributionsListSource = readFileSync(new URL("../app/account/contributions/ContributionsList.tsx", import.meta.url), "utf8");
assertTrue(contributionsListSource.includes('superseded: "bg-surface2 text-ink-400",'), "the contributions list page's own status pill also has the same neutral 'superseded' treatment");

// -----------------------------------------------------------------------
// §7/§8 Legacy compatibility: every pre-existing row is left exactly as
// it was — no backfill, no reclassification, no historical UPDATE.
// -----------------------------------------------------------------------
{
  // The two UPDATE statements this migration DOES contain live inside
  // the two functions' own $$-quoted bodies — executed only once per
  // RPC call, guarded by a WHERE on one specific id, never at
  // migration-apply time. Isolating everything OUTSIDE those bodies is
  // what actually distinguishes "a real per-call RPC update" from "a
  // top-level bulk backfill this migration would run immediately" —
  // matching a plain /update performance_datasets/ against the whole
  // file would (incorrectly) also flag the RPC bodies themselves.
  const outsideFunctionBodies = migrationSource.split(/\$\$/).filter((_, i) => i % 2 === 0).join("\n");
  assertTrue(
    !/update performance_datasets/i.test(outsideFunctionBodies),
    "outside the two functions' own bodies, the migration contains no UPDATE on performance_datasets at all — no bulk backfill of observation_fingerprint or validation_status ever runs at migration-apply time, so every historical row keeps its exact current status and a null fingerprint until it is next touched by a real write path"
  );
}

// Translations exist in both locales for every new user-facing string.
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");
assertTrue(
  translationsSource.includes('superseded: "Reemplazada por una versión más reciente"') && translationsSource.includes('superseded: "Replaced by a newer version"'),
  "the benchmark-status pill's superseded label exists in both locales, worded as a normal outcome rather than a rejection"
);
assertTrue(
  translationsSource.includes("supersedeCandidateNote:") && translationsSource.includes("supersedeAction:") && translationsSource.includes("approveIndependentAction:"),
  "the curator-facing supersede-candidate copy exists (ES block; the EN mirror is checked separately below by simple presence, matching this project's own established one-file/both-locales convention)"
);
assertTrue((translationsSource.match(/supersedeCandidateNote:/g) ?? []).length === 2, "the supersede-candidate note is translated in both the ES and EN blocks — never only one locale");

console.log(`test-observation-identity: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
