// CUCURUCHO — CONTRIBUTION RELIABILITY PASS B.
//
// Focused regression for cross-import duplicate/conflict detection on
// the two flows that previously had none: Public Metrics and Rate
// Cards. None of this touches persistence semantics, DB-level
// uniqueness, campaign duplicate/fingerprint/supersede logic, the
// benchmark engine, RLS, migrations, or the dormant rate-card
// "superseded" lifecycle — this file proves that by (a) exercising the
// real, pure classification functions directly (none of
// lib/media/snapshotDuplicates.ts, lib/media/rateCardDuplicates.ts,
// lib/media/importSnapshots.ts, lib/media/importRateCards.ts carry
// "server-only" or touch Supabase), and (b) using readFileSync
// structural checks — this project's established convention
// (scripts/test-phase25-import-history.mts's own treatment of
// lib/import/duplicateActions.ts) — for the two new "use server"
// actions and the "use client" UI that can't run outside Next.js.

import { readFileSync, readdirSync } from "node:fs";
import { classifySnapshotFileDuplicates, classifySnapshotAgainstExisting, type SnapshotFileCandidate, type ExistingSnapshotSignature } from "../lib/media/snapshotDuplicates";
import { classifyRateCardFileDuplicates, classifyRateCardAgainstExisting, type RateCardFileCandidate, type ExistingRateCardSignature } from "../lib/media/rateCardDuplicates";
import { markSnapshotDuplicates, type ValidatedSnapshotRow } from "../lib/media/importSnapshots";
import { markRateCardDuplicates, type ValidatedRateCardRow } from "../lib/media/importRateCards";
import { areRateCardsCompatible } from "../lib/media/rateCardHistory";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`); }
}

function stripComments(src: string): string {
  return src.split("\n").filter((line) => {
    const t = line.trim();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  }).join("\n");
}

const snapshotActionSource = readFileSync(new URL("../app/contribute/public-metrics/duplicateActions.ts", import.meta.url), "utf8");
const rateCardActionSource = readFileSync(new URL("../app/contribute/rate-cards/duplicateActions.ts", import.meta.url), "utf8");
const publicMetricFlowSource = readFileSync(new URL("../app/contribute/public-metrics/PublicMetricImportFlow.tsx", import.meta.url), "utf8");
const rateCardFlowSource = readFileSync(new URL("../app/contribute/rate-cards/RateCardImportFlow.tsx", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");

// =========================================================================
// PUBLIC METRICS — SAME FILE
// =========================================================================
{
  const base: SnapshotFileCandidate = { platformKey: "olga", propertyKey: null, metricKey: "subscriber_count", observedAt: "2026-09-01", value: 1000 };

  // same identity + same value -> exact duplicate
  const exactRows: SnapshotFileCandidate[] = [base, { ...base }];
  const exactVerdicts = classifySnapshotFileDuplicates(exactRows);
  assertEqual(exactVerdicts.get(1), "exact_duplicate", "same identity + same value, within one file, classifies as exact_duplicate");
  assertTrue(!exactVerdicts.has(0), "the first occurrence of an exact duplicate pair is never itself flagged");

  // same identity + different value -> conflicting version
  const conflictingRows: SnapshotFileCandidate[] = [base, { ...base, value: 2000 }];
  const conflictingVerdicts = classifySnapshotFileDuplicates(conflictingRows);
  assertEqual(conflictingVerdicts.get(1), "conflicting_version", "same identity + different value, within one file, classifies as conflicting_version, never exact_duplicate");

  // different date -> legitimate new observation (no verdict at all)
  const differentDateRows: SnapshotFileCandidate[] = [base, { ...base, observedAt: "2026-09-02" }];
  const differentDateVerdicts = classifySnapshotFileDuplicates(differentDateRows);
  assertTrue(!differentDateVerdicts.has(1), "a different observed_at is a different identity entirely — never classified as exact_duplicate or conflicting_version");

  // markSnapshotDuplicates: behavioral — exact dup is blocked (status
  // "duplicate", same as before this pass), conflicting is NOT blocked
  // (status "conflicting", remains eligible for submission).
  const rows: ValidatedSnapshotRow[] = [
    { rowNumber: 2, platformKey: "olga", metricKey: "subscriber_count", value: 1000, observedAt: "2026-09-01", source: "youtube", sourceReference: null, status: "valid", errors: [] },
    { rowNumber: 3, platformKey: "olga", metricKey: "subscriber_count", value: 1000, observedAt: "2026-09-01", source: "youtube", sourceReference: null, status: "valid", errors: [] },
    { rowNumber: 4, platformKey: "olga", metricKey: "subscriber_count", value: 2500, observedAt: "2026-09-01", source: "youtube", sourceReference: null, status: "valid", errors: [] },
  ];
  const marked = markSnapshotDuplicates(rows);
  assertEqual(marked[1].status, "duplicate", "markSnapshotDuplicates: second row (same value as row 2) is an exact duplicate, excluded from submission exactly as before this pass");
  assertEqual(marked[2].status, "conflicting", "markSnapshotDuplicates: third row (different value, same identity as row 2) is a conflicting version, a NEW status distinct from duplicate");
  assertEqual(marked[0].status, "valid", "the first occurrence remains valid");
}

// =========================================================================
// PUBLIC METRICS — EXISTING DB ROWS
// =========================================================================
{
  const existing: ExistingSnapshotSignature[] = [
    { id: "existing-1", platformId: "platform-olga", propertyId: null, metricDefinitionId: "metric-subs", observedAt: "2026-09-01", value: 1000 },
  ];

  const exactMatch = classifySnapshotAgainstExisting({ platformId: "platform-olga", propertyId: null, metricDefinitionId: "metric-subs", observedAt: "2026-09-01", value: 1000 }, existing);
  assertEqual(exactMatch, { verdict: "exact_duplicate", matchedExistingIds: ["existing-1"] }, "classifySnapshotAgainstExisting: same identity + same value as an existing row -> exact_duplicate, naming the real existing row id");

  const conflictMatch = classifySnapshotAgainstExisting({ platformId: "platform-olga", propertyId: null, metricDefinitionId: "metric-subs", observedAt: "2026-09-01", value: 1500 }, existing);
  assertEqual(conflictMatch, { verdict: "conflicting_version", matchedExistingIds: ["existing-1"] }, "classifySnapshotAgainstExisting: same identity + different value -> conflicting_version, never exact_duplicate, never silently resolved");

  const noMatch = classifySnapshotAgainstExisting({ platformId: "platform-olga", propertyId: null, metricDefinitionId: "metric-views", observedAt: "2026-09-01", value: 1000 }, existing);
  assertEqual(noMatch, { verdict: "none", matchedExistingIds: [] }, "classifySnapshotAgainstExisting: a different metric is a different identity -> no collision at all");

  const noMatchEmpty = classifySnapshotAgainstExisting({ platformId: "platform-olga", propertyId: null, metricDefinitionId: "metric-subs", observedAt: "2026-09-01", value: 1000 }, []);
  assertEqual(noMatchEmpty, { verdict: "none", matchedExistingIds: [] }, "classifySnapshotAgainstExisting: no existing rows at all -> none, never a false collision claim");
}

// =========================================================================
// RATE CARDS — SAME FILE
// =========================================================================
{
  const base: RateCardFileCandidate = { platformId: "olga", propertyId: null, mediaFormatId: "branded_integration", currency: "USD", pricingUnit: "per_integration", validFrom: "2026-09-01", price: 2000 };

  // same identity + same validFrom + same price -> exact duplicate
  const exactRows: RateCardFileCandidate[] = [base, { ...base }];
  const exactVerdicts = classifyRateCardFileDuplicates(exactRows);
  assertEqual(exactVerdicts.get(1), "exact_duplicate", "same identity + same validFrom + same price classifies as exact_duplicate");

  // same identity + same validFrom + different price -> conflicting
  // version — THE WITHIN-FILE GAP THIS PASS CLOSES (the old key
  // included price itself, so this never even matched before).
  const conflictingRows: RateCardFileCandidate[] = [base, { ...base, price: 2500 }];
  const conflictingVerdicts = classifyRateCardFileDuplicates(conflictingRows);
  assertEqual(conflictingVerdicts.get(1), "conflicting_version", "same identity + same validFrom + DIFFERENT price now classifies as conflicting_version — previously silently passed through with zero information");

  // same identity + different validFrom -> legitimate history, no verdict
  const differentDateRows: RateCardFileCandidate[] = [base, { ...base, validFrom: "2026-10-01", price: 2500 }];
  const differentDateVerdicts = classifyRateCardFileDuplicates(differentDateRows);
  assertTrue(!differentDateVerdicts.has(1), "a different validFrom is a legitimate new history point — never classified as exact_duplicate or conflicting_version, exactly what resolvePreviousRateCardAndChange already treats as a normal price change over time");

  // Cross-check against the real, unmodified areRateCardsCompatible —
  // proves this module reuses the canonical identity rather than a
  // parallel one.
  assertTrue(areRateCardsCompatible(base, { ...base, price: 999, validFrom: "2099-01-01" }), "two candidates sharing platform/property/format/currency/pricingUnit remain areRateCardsCompatible regardless of price or validFrom — confirms classifyRateCardFileDuplicates's identity notion is exactly areRateCardsCompatible's, not a separate one");
  assertTrue(!areRateCardsCompatible(base, { ...base, currency: "ARS" }), "a different currency is NOT areRateCardsCompatible — confirms the identity still excludes currency mismatches, unchanged");

  // markRateCardDuplicates: behavioral.
  const rows: ValidatedRateCardRow[] = [
    { rowNumber: 2, platformKey: "olga", mediaFormatKey: "branded_integration", price: 2000, currency: "USD", pricingUnit: "per_integration", validFrom: "2026-09-01", validTo: null, source: "x", sourceReference: null, notes: null, status: "valid", errors: [] },
    { rowNumber: 3, platformKey: "olga", mediaFormatKey: "branded_integration", price: 2000, currency: "USD", pricingUnit: "per_integration", validFrom: "2026-09-01", validTo: null, source: "x", sourceReference: null, notes: null, status: "valid", errors: [] },
    { rowNumber: 4, platformKey: "olga", mediaFormatKey: "branded_integration", price: 2500, currency: "USD", pricingUnit: "per_integration", validFrom: "2026-09-01", validTo: null, source: "x", sourceReference: null, notes: null, status: "valid", errors: [] },
  ];
  const marked = markRateCardDuplicates(rows);
  assertEqual(marked[1].status, "duplicate", "markRateCardDuplicates: identical rate-card row within the same import still flagged as duplicate, never silently dropped (regression guard against the existing test-rate-cards.mts assertion)");
  assertEqual(marked[2].status, "conflicting", "markRateCardDuplicates: same identity + same validFrom + different price is now a conflicting version, no longer silently passed through as an independent valid row");
}

// =========================================================================
// RATE CARDS — EXISTING DB ROWS
// =========================================================================
{
  const existing: ExistingRateCardSignature[] = [
    { id: "existing-rc-1", platformId: "platform-olga", propertyId: null, mediaFormatId: "format-branded", currency: "USD", pricingUnit: "per_integration", validFrom: "2026-09-01", price: 2000 },
  ];

  const exactMatch = classifyRateCardAgainstExisting({ platformId: "platform-olga", propertyId: null, mediaFormatId: "format-branded", currency: "USD", pricingUnit: "per_integration", validFrom: "2026-09-01", price: 2000 }, existing);
  assertEqual(exactMatch, { verdict: "exact_duplicate", matchedExistingIds: ["existing-rc-1"] }, "classifyRateCardAgainstExisting: same identity + same validFrom + same price as an existing row -> exact_duplicate");

  const conflictMatch = classifyRateCardAgainstExisting({ platformId: "platform-olga", propertyId: null, mediaFormatId: "format-branded", currency: "USD", pricingUnit: "per_integration", validFrom: "2026-09-01", price: 2600 }, existing);
  assertEqual(conflictMatch, { verdict: "conflicting_version", matchedExistingIds: ["existing-rc-1"] }, "classifyRateCardAgainstExisting: same identity + same validFrom + different price -> conflicting_version, never overwritten or auto-chosen");

  const noMatch = classifyRateCardAgainstExisting({ platformId: "platform-olga", propertyId: null, mediaFormatId: "format-branded", currency: "USD", pricingUnit: "per_integration", validFrom: "2026-10-01", price: 2000 }, existing);
  assertEqual(noMatch, { verdict: "none", matchedExistingIds: [] }, "classifyRateCardAgainstExisting: a different validFrom against the same identity -> no collision at all, a legitimate new history point");
}

// =========================================================================
// GENERAL — batching / performance / security
// =========================================================================
{
  // Batched query architecture, no N+1.
  assertTrue(snapshotActionSource.includes('"use server"'), "checkSnapshotDuplicatesAction is a real server action");
  assertTrue(
    (snapshotActionSource.match(/\.from\("public_media_metric_snapshots"\)/g) ?? []).length === 1,
    "exactly ONE query against public_media_metric_snapshots per duplicate check — never one query per candidate row (no N+1)"
  );
  assertTrue(
    (snapshotActionSource.match(/\.from\("platforms"\)/g) ?? []).length === 1 && (snapshotActionSource.match(/\.from\("public_media_metric_definitions"\)/g) ?? []).length === 1,
    "the platform/metric key-to-id resolution is exactly one batched lookup each, not per-row"
  );

  assertTrue(rateCardActionSource.includes('"use server"'), "checkRateCardDuplicatesAction is a real server action");
  assertTrue(
    (rateCardActionSource.match(/\.from\("media_rate_cards"\)/g) ?? []).length === 1,
    "exactly ONE query against media_rate_cards per duplicate check — never one query per candidate row (no N+1)"
  );
  assertTrue(
    (rateCardActionSource.match(/\.from\("platforms"\)/g) ?? []).length === 1 && (rateCardActionSource.match(/\.from\("media_formats"\)/g) ?? []).length === 1,
    "the platform/format key-to-id resolution is exactly one batched lookup each, not per-row"
  );

  // Security: session-scoped client only, never admin/service-role; no
  // owner identity (submitted_by) ever selected or returned to the
  // browser.
  for (const src of [snapshotActionSource, rateCardActionSource]) {
    assertTrue(src.includes("createServerSupabaseClient()") && !src.includes("createAdminClient") && !src.includes("service_role") && !src.includes("SERVICE_ROLE"), "the duplicate check reads through the session-scoped client only — never a service-role client");
    // Checked against actual code only: both files' own comments
    // explicitly document "never submitted_by" to explain the
    // omission, which would false-positive a raw substring check.
    assertTrue(!stripComments(src).includes("submitted_by"), "the duplicate check never selects or exposes submitted_by — no owner identity ever reaches the browser");
  }

  // No overwrite / delete / supersede / valid_to behavior anywhere in
  // the new modules. Checked against code with comments stripped,
  // since both pure modules carry explanatory comments that
  // legitimately mention these words to document their absence.
  for (const src of [snapshotActionSource, rateCardActionSource]) {
    const code = stripComments(src);
    assertTrue(!code.includes(".update(") && !code.includes(".delete(") && !code.includes("valid_to") && !code.includes("superseded"), "the duplicate check modules never write — no .update(, .delete(, valid_to, or superseded anywhere in this file's code");
  }
  const snapshotDuplicatesSource = readFileSync(new URL("../lib/media/snapshotDuplicates.ts", import.meta.url), "utf8");
  const rateCardDuplicatesSource = readFileSync(new URL("../lib/media/rateCardDuplicates.ts", import.meta.url), "utf8");
  for (const src of [snapshotDuplicatesSource, rateCardDuplicatesSource]) {
    const code = stripComments(src);
    assertTrue(!code.includes(".update(") && !code.includes(".delete(") && !code.includes("valid_to") && !code.includes("superseded") && !code.includes("supersede"), "the pure classification modules never write, never reference valid_to/superseded/supersede in actual code");
  }

  // No migration: the highest migration file remains 0020 (observation
  // identity, Pass A's own baseline) — this pass adds zero new ones.
  const migrationFiles = readdirSync(new URL("../supabase/migrations/", import.meta.url));
  const highestMigration = migrationFiles.map((f) => parseInt(f.slice(0, 4), 10)).filter((n) => !isNaN(n)).sort((a, b) => b - a)[0];
  assertEqual(highestMigration, 20, "no new migration file was added by this pass — the highest-numbered migration is still 0020_observation_identity.sql");

  // Conflicting versions are never skippable; exact duplicates are.
  for (const src of [publicMetricFlowSource, rateCardFlowSource]) {
    assertTrue(src.includes('isExact && ('), "the Skip checkbox is gated behind isExact (verdict === \"exact_duplicate\") — a conflicting_version never renders a skip toggle");
    assertTrue(
      stripComments(src).includes('.filter((r) => (r.status === "valid" || r.status === "conflicting") && !skipRows.has(r.rowNumber))'),
      "the submission payload always includes conflicting rows (never silently dropped) and only ever excludes a \"valid\" row the user explicitly checked to skip"
    );
  }

  // Cross-DB check wiring + distinct exact/conflicting copy use.
  assertTrue(publicMetricFlowSource.includes("checkSnapshotDuplicatesAction(candidates)"), "PublicMetricImportFlow.tsx wires in the cross-DB duplicate check after validation");
  assertTrue(rateCardFlowSource.includes("checkRateCardDuplicatesAction(candidates)"), "RateCardImportFlow.tsx wires in the cross-DB duplicate check after validation");
  for (const src of [publicMetricFlowSource, rateCardFlowSource]) {
    assertTrue(src.includes('t("contribute.import.statusExactDuplicate")') && src.includes('t("contribute.import.statusConflictingVersion")'), "both labels are rendered, using two DISTINCT translation keys — the UI never calls a conflicting version a duplicate");
  }
  assertTrue(publicMetricFlowSource.includes('t("media.publicMetricConflictingVersion")'), "the Public Metrics flow renders its own flow-specific conflicting-version explanation");
  assertTrue(rateCardFlowSource.includes('t("media.rateCardConflictingVersion")'), "the Rate Cards flow renders its own flow-specific conflicting-version explanation");
}

// =========================================================================
// ES/EN PARITY — every new key this pass added exists exactly twice.
// =========================================================================
{
  const NEW_KEYS = [
    "statusExactDuplicate",
    "statusConflictingVersion",
    "exactDuplicateExplain",
    "confirmConflictingVersions",
    "publicMetricConflictingVersion",
    "rateCardConflictingVersion",
  ];
  for (const key of NEW_KEYS) {
    const count = (translationsSource.match(new RegExp(`\\b${key}:`, "g")) ?? []).length;
    assertEqual(count, 2, `the "${key}" key appears exactly twice in translations.ts (one ES, one EN)`);
  }

  // The exact-duplicate and conflicting-version copy must actually say
  // different things in BOTH locales, never reuse the same string.
  assertTrue(translationsSource.includes('statusExactDuplicate: "Duplicado exacto",') && translationsSource.includes('statusExactDuplicate: "Exact duplicate",'), "statusExactDuplicate has the exact prescribed Spanish label and an equivalent English one");
  assertTrue(translationsSource.includes('statusConflictingVersion: "Versión en conflicto",'), "statusConflictingVersion has a distinct Spanish label, never reusing \"Duplicado exacto\"");

  // The exact prescribed English copy from the brief, verbatim.
  assertTrue(
    translationsSource.includes("publicMetricConflictingVersion: \"A different value already exists for this metric and date. If you continue, the new value will be sent for review.\","),
    "media.publicMetricConflictingVersion's EN copy matches the brief's prescribed wording verbatim"
  );
  assertTrue(
    translationsSource.includes("rateCardConflictingVersion: \"A different price already exists for this rate and effective date. If you continue, the new price will be sent for review.\","),
    "media.rateCardConflictingVersion's EN copy matches the brief's prescribed wording verbatim"
  );
  // Scoped to only the lines this pass added (by key), not the whole
  // file: translations.ts already has pre-existing, unrelated campaign
  // supersede copy (e.g. supersededBenchmarkExplanation) that
  // legitimately uses "replaced"/"overwritten" — this pass must never
  // add new copy with that implication, but it doesn't touch that
  // existing copy either.
  const newKeyLines = NEW_KEYS.flatMap((key) => translationsSource.match(new RegExp(`^.*\\b${key}:.*$`, "gm")) ?? []);
  assertTrue(newKeyLines.length === 12, "found exactly 12 lines (6 keys x ES/EN) of newly-added copy to scope the overwrite-language check to");
  assertTrue(
    newKeyLines.every((line) => !line.includes("overwritten") && !line.includes("overwrite") && !line.includes("replaced")),
    "none of this pass's new conflicting-version copy implies an automatic overwrite or replacement"
  );
}

// =========================================================================
// PROTECTED AREAS — this pass must never touch campaign duplicate
// semantics, the campaign fingerprint/supersede system, migrations,
// RLS, or the dormant rate-card superseded lifecycle.
// =========================================================================
{
  const campaignDuplicatesSource = readFileSync(new URL("../lib/import/duplicates.ts", import.meta.url), "utf8");
  const campaignDuplicateActionsSource = readFileSync(new URL("../lib/import/duplicateActions.ts", import.meta.url), "utf8");
  const observationFingerprintSource = readFileSync(new URL("../lib/contribute/observationFingerprint.ts", import.meta.url), "utf8");
  assertTrue(campaignDuplicatesSource.includes("export type DuplicateVerdict = \"new\" | \"possible_duplicate\" | \"likely_duplicate\";"), "the campaign duplicate verdict type is byte-identical to before this pass — campaigns keep their own separate new/possible_duplicate/likely_duplicate vocabulary, never merged with Public Metrics/Rate Cards' exact_duplicate/conflicting_version/none");
  assertTrue(campaignDuplicateActionsSource.includes("createServerSupabaseClient") && campaignDuplicateActionsSource.includes("performance_datasets"), "lib/import/duplicateActions.ts (campaign cross-import check) is untouched by this pass");
  assertTrue(observationFingerprintSource.includes("FINGERPRINT_VERSION = \"v1\""), "the campaign observation fingerprint module is untouched by this pass");

  const importRateCardsSource = readFileSync(new URL("../lib/media/importRateCards.ts", import.meta.url), "utf8");
  assertTrue(!importRateCardsSource.includes('"superseded" as const') && !stripComments(importRateCardsSource).includes("status: \"superseded\""), "this pass never writes the dormant rate-card \"superseded\" status — that lifecycle remains unactivated, exactly as instructed");

  for (const src of [snapshotActionSource, rateCardActionSource, snapshotDuplicatesSourceCheck(), rateCardDuplicatesSourceCheck()]) {
    assertTrue(!src.includes("media_property_id:") || src.includes("propertyId: row.media_property_id as string | null") || src.includes("media_property_id\""), "media_property_id is only ever READ (for comparison), never written or reassigned a new meaning by this pass");
  }

  function snapshotDuplicatesSourceCheck(): string {
    return readFileSync(new URL("../lib/media/snapshotDuplicates.ts", import.meta.url), "utf8");
  }
  function rateCardDuplicatesSourceCheck(): string {
    return readFileSync(new URL("../lib/media/rateCardDuplicates.ts", import.meta.url), "utf8");
  }
}

console.log(`test-contribution-reliability-pass-b: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
