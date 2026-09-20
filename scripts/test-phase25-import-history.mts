// PHASE 25 — IMPORT HISTORY, CAMPAIGN PROVENANCE & DUPLICATE DETECTION.
//
// Focused tests for the new pure logic (lib/contribute/campaignType.ts,
// lib/import/duplicates.ts) plus structural source-text checks for the
// wiring into bulk-actions.ts, the duplicate-check server action, the
// review-screen UI, and the account/contributions pages — same real-
// import + readFileSync pattern already established by
// scripts/test-phase24-multiplatform-import.mts and
// scripts/test-phase26-workspace.mts (no jsdom/React Testing Library
// configured in this project).

import { readFileSync } from "node:fs";
import { resolveCampaignType } from "../lib/contribute/campaignType";
import { classifyDuplicate, buildRawSignature, type ExistingCampaignSignature } from "../lib/import/duplicates";

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

// ---------------------------------------------------------------------
// §5: campaign type resolution — ONLY Google's two real-fixture-
// confirmed values, never a guess for any other platform or value.
// ---------------------------------------------------------------------
{
  assertEqual(resolveCampaignType("google_ads", "Búsqueda"), "search", "Google's real ES 'Búsqueda' value resolves to 'search'");
  assertEqual(resolveCampaignType("google_ads", "Search"), "search", "Google's real EN 'Search' value resolves to 'search'");
  assertEqual(resolveCampaignType("google_ads", "Máximo rendimiento"), "performance_max", "Google's real ES 'Máximo rendimiento' value resolves to 'performance_max'");
  assertEqual(resolveCampaignType("google_ads", "Performance Max"), "performance_max", "Google's real EN 'Performance Max' value resolves to 'performance_max'");
  assertEqual(resolveCampaignType("google_ads", "Video"), null, "Google's 'Video' value is NEVER resolved — only header-level evidence exists for a video report, never confirmed per-row campaign-type values");
  assertEqual(resolveCampaignType("google_ads", "Some Unknown Type"), null, "an unrecognized Google campaign-type string resolves to null, never a guess");
  assertEqual(resolveCampaignType("google_ads", null), null, "a missing campaign-type value resolves to null");
  assertEqual(resolveCampaignType("meta_ads", "Búsqueda"), null, "a non-Google platform NEVER resolves a campaign type, even given a value that would match on Google — no cross-platform mapping");
  assertEqual(resolveCampaignType("tiktok_ads", "Standard"), null, "a platform with only a 'standard' campaign_types row never has anything real to resolve FROM");
}

// ---------------------------------------------------------------------
// §9: cross-import duplicate classification — conservative, multi-
// signal, deterministic. Never relies on filename (not even a field
// here); only ever returns new/possible_duplicate/likely_duplicate.
// ---------------------------------------------------------------------
{
  const existing: ExistingCampaignSignature[] = [
    {
      id: "existing-1",
      platformKey: "meta_ads",
      campaignName: "Hudson Summer Sale",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      adSpend: 1000,
      rawSignature: buildRawSignature({ impressions: 50000, clicks: 800 }),
    },
  ];

  const exactReupload = {
    platformKey: "meta_ads",
    campaignName: "Hudson Summer Sale",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    adSpend: 1000,
    rawSignature: buildRawSignature({ impressions: 50000, clicks: 800 }),
  };
  assertEqual(classifyDuplicate(exactReupload, existing).verdict, "likely_duplicate", "same platform, period, spend, name AND metric signature -> likely_duplicate");

  const sameNameDifferentSpend = { ...exactReupload, adSpend: 1200 };
  assertEqual(classifyDuplicate(sameNameDifferentSpend, existing).verdict, "possible_duplicate", "same name and period but a different spend figure -> possible_duplicate, never likely (data may have been corrected)");

  const sameSpendDifferentName = { ...exactReupload, campaignName: "Hudson Winter Sale", rawSignature: buildRawSignature({}) };
  assertEqual(classifyDuplicate(sameSpendDifferentName, existing).verdict, "possible_duplicate", "same platform/period/spend but a different name and no metric-signature match -> possible_duplicate, never likely");

  const differentPeriod = { ...exactReupload, startDate: "2026-07-01", endDate: "2026-07-31" };
  assertEqual(classifyDuplicate(differentPeriod, existing).verdict, "new", "a different date range against the same existing campaign is honestly 'new' — dates are a hard filter, never fuzzy-matched");

  const differentPlatform = { ...exactReupload, platformKey: "google_ads" };
  assertEqual(classifyDuplicate(differentPlatform, existing).verdict, "new", "the exact same name/period/spend on a DIFFERENT platform is never flagged — platform is never ignored");

  const genuinelyNew = { platformKey: "meta_ads", campaignName: "Brand New Campaign", startDate: "2026-08-01", endDate: "2026-08-31", adSpend: 500, rawSignature: buildRawSignature({ impressions: 1000 }) };
  assertEqual(classifyDuplicate(genuinelyNew, existing).verdict, "new", "a campaign sharing none of platform/period/spend/name/signature with anything existing is 'new'");

  assertEqual(classifyDuplicate(exactReupload, existing).matchedExistingIds, ["existing-1"], "a likely_duplicate verdict names the specific existing campaign(s) it matched, for the UI to reference");
}
{
  // buildRawSignature: order-independent, rounds floating point noise,
  // never includes ad_spend itself.
  assertEqual(buildRawSignature({ clicks: 10, impressions: 100 }), buildRawSignature({ impressions: 100, clicks: 10 }), "buildRawSignature is order-independent");
  assertEqual(buildRawSignature({ impressions: 100.001 }), buildRawSignature({ impressions: 100 }), "buildRawSignature rounds away floating-point noise between two exports of the same report");
  assertTrue(!buildRawSignature({ ad_spend: 100, impressions: 100 }).includes("ad_spend"), "buildRawSignature never folds in ad_spend — that's compared separately by classifyDuplicate");
}

// ---------------------------------------------------------------------
// §4/§6: campaign_name / import_batches persistence wiring —
// structural checks against the actual source (no live Supabase in
// this sandbox to exercise end-to-end).
// ---------------------------------------------------------------------
const bulkActionsSource = readFileSync(new URL("../app/contribute/bulk-actions.ts", import.meta.url), "utf8");
assertTrue(bulkActionsSource.includes("campaign_name: row.campaignName"), "bulkSubmitContributionsAction persists campaign_name on every inserted row — no longer review-only");
assertTrue(bulkActionsSource.includes("import_batch_id: batchId"), "every inserted performance_datasets row is linked to its import_batches row");
assertTrue(bulkActionsSource.includes('.from("import_batches")\n      .insert('), "a real import_batches row is created for a bulk (non-manual) import");
assertTrue(bulkActionsSource.includes('if (dataSource !== "manual")'), "the manual single-entry wizard path never creates an import_batches row, per migration 0018's own comment");
assertTrue(bulkActionsSource.includes("owner_user_id: user.id") && bulkActionsSource.includes('.insert({\n        owner_user_id: user.id,\n        platform_id: batchPlatformId,'), "the import_batches row is scoped to the authenticated user — never a service-role/admin write");
assertTrue(bulkActionsSource.includes("resolveCampaignType(row.platform!, row.campaignType)"), "§5 campaign type resolution is wired into the persistence path, reusing the pure resolver — never reimplemented inline");
assertTrue(bulkActionsSource.includes("skipRowNumbers") && bulkActionsSource.includes("skipSet.has(r.rowNumber)"), "§10 duplicate-skip row numbers are honored — a skipped row is excluded from insertion");
assertTrue(bulkActionsSource.includes('await supabase.from("import_batches").update({ success_count: imported })'), "the batch's success_count is updated with the real outcome after the import loop finishes, never left as an up-front guess");

// ---------------------------------------------------------------------
// §9/§17: the cross-import duplicate check is a single batched,
// owner-scoped read — never an admin client, never a per-row query.
// ---------------------------------------------------------------------
const duplicateActionsSource = readFileSync(new URL("../lib/import/duplicateActions.ts", import.meta.url), "utf8");
assertTrue(duplicateActionsSource.includes('"use server"'), "checkImportDuplicatesAction is a real server action, never called with a client-side key");
assertTrue(duplicateActionsSource.includes("createServerSupabaseClient()") && !duplicateActionsSource.includes("createAdminClient") && !duplicateActionsSource.includes("service_role"), "the duplicate check reads through the session-scoped client only — RLS is the real boundary, never a service-role client");
assertTrue(
  (duplicateActionsSource.match(/\.from\("performance_datasets"\)/g) ?? []).length === 1,
  "exactly ONE query against performance_datasets per duplicate check — never one query per candidate row (no N+1)"
);
assertTrue(duplicateActionsSource.includes('.neq("validation_status", "deleted")'), "a deleted campaign is never treated as evidence of a duplicate");

// ---------------------------------------------------------------------
// §10/§13: the review screen shows a per-row duplicate banner with an
// explicit Skip toggle (never auto-reject), and the success screen
// shows a benchmark-readiness summary reusing the existing coverage
// helper.
// ---------------------------------------------------------------------
const contributeLandingSource = readFileSync(new URL("../app/contribute/ContributeLanding.tsx", import.meta.url), "utf8");
assertTrue(contributeLandingSource.includes("checkImportDuplicatesAction(candidates)"), "the review step kicks off the cross-import duplicate check");
assertTrue(contributeLandingSource.includes('t("contribute.import.duplicateWarning")'), "a suspected duplicate renders the explicit 'may already have been imported' banner");
assertTrue(
  contributeLandingSource.includes('t("contribute.import.duplicateSkipToggle")') && contributeLandingSource.includes("skipRows"),
  "each suspected row has its own explicit Skip toggle — never a single blanket accept/reject for the whole file"
);
assertTrue(!contributeLandingSource.includes("auto_reject") && !contributeLandingSource.includes("autoReject"), "no auto-reject path exists — a suspected duplicate is never silently dropped");
assertTrue(
  contributeLandingSource.includes("computeDataCoverage(") && contributeLandingSource.includes('t("contribute.import.benchmarkReadySummaryLabel")'),
  "§13 the import success screen shows a benchmark-readiness summary, reusing the existing coverage helper rather than a new formula"
);
assertTrue(
  contributeLandingSource.includes("sourceFilename: fileName || null") && contributeLandingSource.includes("exportProfileId: exportProfile?.profileId"),
  "confirmImport passes real file/provenance metadata through to the persistence layer"
);

// ---------------------------------------------------------------------
// §7/§14: compact import history under Account/Contributions, backed
// by the real import_batches table.
// ---------------------------------------------------------------------
const contributionsListSource = readFileSync(new URL("../app/account/contributions/ContributionsList.tsx", import.meta.url), "utf8");
assertTrue(contributionsListSource.includes("batches.map((b)"), "the contributions page renders one line per real import batch");
assertTrue(contributionsListSource.includes("d.campaign_name ?? t(\"contributions.unnamedCampaign\")"), "a campaign's real name is shown when present, falling back to a plain neutral placeholder otherwise — never fabricated from other fields");

const importBatchStatusSource = readFileSync(new URL("../lib/contribute/importBatchStatus.ts", import.meta.url), "utf8");
assertTrue(
  importBatchStatusSource.includes('"completed"') && importBatchStatusSource.includes('"partial"') && importBatchStatusSource.includes('"needsAttention"'),
  "§7 the three factual batch statuses (Completed/Partial/Needs attention) are all implemented — never a numeric score"
);

const contributionsPageSource = readFileSync(new URL("../app/account/contributions/page.tsx", import.meta.url), "utf8");
assertTrue(
  (contributionsPageSource.match(/createServerSupabaseClient\(\)/g) ?? []).length >= 1 && !contributionsPageSource.includes("createAdminClient"),
  "the contributions list page reads through the session-scoped client only"
);
assertTrue(
  (contributionsPageSource.match(/await supabase\s*\n?\s*\.from/g) ?? []).length <= 2,
  "import history is fetched with a small, constant number of queries (the campaign list + the batch list) — never one query per batch or per campaign"
);

// ---------------------------------------------------------------------
// §15: contribution detail shows campaign name/type/source; §16:
// owner-scoped delete reuses the existing DB-level RLS policy.
// ---------------------------------------------------------------------
const contributionDetailSource = readFileSync(new URL("../app/account/contributions/[id]/ContributionDetail.tsx", import.meta.url), "utf8");
assertTrue(contributionDetailSource.includes("dataset.campaignName ??"), "the detail page's title shows the real campaign name when present");
assertTrue(contributionDetailSource.includes("deleteContributionAction(dataset.id)"), "the detail page wires up the real delete action");
assertTrue(
  contributionDetailSource.includes("confirmingDelete") && contributionDetailSource.includes('t("contributions.deleteConfirmButton")'),
  "§16 delete is a two-step confirm, never a single click"
);

const deleteActionSource = readFileSync(new URL("../app/account/contributions/actions.ts", import.meta.url), "utf8");
assertTrue(deleteActionSource.includes('.eq("owner_user_id", user.id)'), "the delete action scopes to the authenticated owner even though RLS is the real boundary — defense in depth, never a bare id-only delete");
assertTrue(!deleteActionSource.includes("createAdminClient") && !deleteActionSource.includes("service_role"), "delete never uses a service-role/admin client — RLS's owner-scoped DELETE policy is the real permission");

// ---------------------------------------------------------------------
// §20: migration 0018 structural sanity (already verified live against
// a throwaway local Postgres instance — see this task's final response
// for that verification's own account; this is a fast, repeatable
// regression check of the same file).
// ---------------------------------------------------------------------
const migrationSource = readFileSync(new URL("../supabase/migrations/0018_import_history_campaign_context.sql", import.meta.url), "utf8");
assertTrue(migrationSource.includes("create table import_batches"), "migration 0018 creates the import_batches table");
assertTrue(migrationSource.includes("add column campaign_name text") && migrationSource.includes("add column import_batch_id uuid"), "migration 0018 adds both new performance_datasets columns");
assertTrue(
  migrationSource.includes('create policy "owners read own import batches"') && migrationSource.includes('create policy "owners insert own import batches"'),
  "import_batches has owner-scoped SELECT and INSERT policies"
);
assertTrue(
  !migrationSource.includes('for update') && !migrationSource.includes('for delete'),
  "§16 import_batches deliberately has NO update/delete policy — it's an immutable historical record"
);
assertTrue(
  !/alter\s+table\s+(?!import_batches|performance_datasets)/i.test(migrationSource.replace(/--.*$/gm, "")),
  "no table other than import_batches/performance_datasets is ever altered by this migration"
);

// ---------------------------------------------------------------------
// §16/§24: Phase 26's homepage Workspace "Recent imports" now reads
// the REAL import_batches table — the same-day/same-platform
// approximation (groupRecentImports) is no longer used here (it's
// still exported from coverage.ts, unchanged, and still exercised
// directly by scripts/test-phase26-workspace.mts).
// ---------------------------------------------------------------------
const workspaceActionsSource = readFileSync(new URL("../lib/contribute/workspaceActions.ts", import.meta.url), "utf8");
assertTrue(workspaceActionsSource.includes('.from("import_batches")'), "getWorkspaceSummaryAction reads the real import_batches table for its recent-imports section");
assertTrue(!workspaceActionsSource.includes("groupRecentImports("), "the same-day/same-platform approximation is no longer CALLED now that a real batch identity exists (the helper itself is only mentioned in an explanatory comment)");
assertTrue(
  (workspaceActionsSource.match(/await Promise\.all\(\[/g) ?? []).length === 1,
  "recent-imports, coverage/gaps, comparisons and plans are still fetched in one batched Promise.all — never sequentially"
);

const coverageSource = readFileSync(new URL("../lib/contribute/coverage.ts", import.meta.url), "utf8");
assertTrue(coverageSource.includes("export function groupRecentImports"), "groupRecentImports itself is left in place, unmodified — Phase 26 is not rewritten, only reconciled where a real alternative now exists");

// ---------------------------------------------------------------------
// §17: a small, honest import-batch detail view — owner-scoped, no
// admin client, never a complex administration screen.
// ---------------------------------------------------------------------
const importBatchPageSource = readFileSync(new URL("../app/account/contributions/imports/[id]/page.tsx", import.meta.url), "utf8");
assertTrue(
  importBatchPageSource.includes("createServerSupabaseClient()") && !importBatchPageSource.includes("createAdminClient") && !importBatchPageSource.includes("service_role"),
  "the import-batch detail page reads through the session-scoped client only — RLS is the real ownership boundary"
);
assertTrue(importBatchPageSource.includes('.eq("import_batch_id", params.id)'), "the campaigns shown are exactly the ones this batch produced, via the real FK — never a heuristic guess");

console.log(`test-phase25-import-history: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
