// CUCURUCHO INTELLIGENCE 3 — MULTI-CAMPAIGN COMPARISON.
//
// Same convention as every other scripts/test-*.mts file in this
// project (see scripts/test-observation-identity.mts): real imports of
// the shipped pure modules (lib/benchmark/campaignComparison.ts) paired
// with readFileSync-based structural source-text checks for whatever
// requires a live database (RLS, real cohort/benchmark queries) or a
// real browser (actual 375px rendering) to genuinely exercise. No live
// DB, no jsdom — matching this project's established methodology.

import { readFileSync } from "node:fs";
import {
  MIN_COMPARISON_CAMPAIGNS,
  MAX_COMPARISON_CAMPAIGNS,
  parseComparisonIds,
  buildCampaignCohortKey,
  groupCampaignsByCohort,
  isCurrencyDenominatedUnit,
  distinctCurrencies,
  isMixedCurrencyRow,
  type CampaignForGrouping,
} from "../lib/benchmark/campaignComparison";

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

// -----------------------------------------------------------------------
// Constants: the locked 2-5 product decision.
// -----------------------------------------------------------------------
assertEqual(MIN_COMPARISON_CAMPAIGNS, 2, "the locked minimum is exactly 2 campaigns");
assertEqual(MAX_COMPARISON_CAMPAIGNS, 5, "the locked maximum is exactly 5 campaigns");

// A pool of distinct, UUID-shaped ids to build test cases from.
const ID = [
  "10000000-0000-0000-0000-000000000001",
  "10000000-0000-0000-0000-000000000002",
  "10000000-0000-0000-0000-000000000003",
  "10000000-0000-0000-0000-000000000004",
  "10000000-0000-0000-0000-000000000005",
  "10000000-0000-0000-0000-000000000006",
];

// -----------------------------------------------------------------------
// §parseComparisonIds — minimum 2 campaigns enforced.
// -----------------------------------------------------------------------
assertEqual(parseComparisonIds(null), { ok: false, error: "too_few" }, "a null ids param is rejected as too_few, never treated as 0 valid campaigns silently proceeding");
assertEqual(parseComparisonIds(""), { ok: false, error: "too_few" }, "an empty ids param is too_few");
assertEqual(parseComparisonIds(ID[0]), { ok: false, error: "too_few" }, "exactly one valid campaign id is still too_few — 1 is not a comparison");
assertEqual(parseComparisonIds(`${ID[0]},not-a-uuid,also garbage`), { ok: false, error: "too_few" }, "garbage/non-UUID-shaped ids are dropped before counting, so 1 real id plus junk is still too_few (never counted as 2+)");

// -----------------------------------------------------------------------
// §parseComparisonIds — maximum 5 campaigns, rejected server-side, never
// silently truncated.
// -----------------------------------------------------------------------
{
  const fiveIds = ID.slice(0, 5).join(",");
  const result = parseComparisonIds(fiveIds);
  assertTrue(result.ok === true && result.ids.length === 5, "exactly 5 distinct valid ids is accepted (the maximum, inclusive)");
}
{
  const sixIds = ID.slice(0, 6).join(",");
  const result = parseComparisonIds(sixIds);
  assertEqual(result, { ok: false, error: "too_many" }, "6 distinct valid ids is rejected outright as too_many — the server never silently truncates to the first 5");
}
{
  const twoIds = ID.slice(0, 2).join(",");
  const result = parseComparisonIds(twoIds);
  assertTrue(result.ok === true && result.ids.length === 2, "exactly 2 distinct valid ids is accepted (the minimum, inclusive)");
}

// -----------------------------------------------------------------------
// §parseComparisonIds — duplicated URL ids are deduplicated, not counted
// twice toward the 2-5 range.
// -----------------------------------------------------------------------
{
  const dupedButOnlyOneUnique = `${ID[0]}, ${ID[0]},${ID[0]}`;
  const result = parseComparisonIds(dupedButOnlyOneUnique);
  assertEqual(result, { ok: false, error: "too_few" }, "the same id repeated three times in the URL collapses to 1 unique campaign — still too_few, never counted as 3");
}
{
  // 5 unique ids, one of them repeated an extra time in the URL: still
  // exactly 5 unique campaigns, not rejected as 6.
  const withADuplicate = [...ID.slice(0, 5), ID[0]].join(",");
  const result = parseComparisonIds(withADuplicate);
  assertTrue(result.ok === true && result.ids.length === 5, "duplicated ids in the URL are deduplicated BEFORE the max-5 check — 5 unique ids plus one repeat is still exactly 5, never rejected as 6");
}
{
  // Whitespace/casing variance around otherwise-identical ids.
  const result = parseComparisonIds(`  ${ID[0]} , ${ID[1]}  `);
  assertTrue(result.ok === true && result.ids.length === 2, "surrounding whitespace around each id is trimmed before validation/dedup");
}

// -----------------------------------------------------------------------
// §buildCampaignCohortKey / §groupCampaignsByCohort — same cohort, 2
// campaigns.
// -----------------------------------------------------------------------
const COHORT_A = { platformKey: "meta", objectiveKey: "conversions", verticalKey: "ecommerce", countryKey: "AR" };
const COHORT_B = { platformKey: "google_ads", objectiveKey: "traffic", verticalKey: "fintech", countryKey: "MX" };

assertEqual(buildCampaignCohortKey(COHORT_A), "meta|conversions|ecommerce|AR", "a full cohort tuple builds a deterministic, joined key");
assertEqual(buildCampaignCohortKey({ ...COHORT_A, countryKey: null }), null, "a cohort missing even one dimension (country here) never gets a key — no partial/synthetic cohort");
assertEqual(buildCampaignCohortKey({ platformKey: null, objectiveKey: null, verticalKey: null, countryKey: null }), null, "a campaign with no taxonomy at all never gets a cohort key");

{
  const campaigns: CampaignForGrouping[] = [
    { id: ID[0], ...COHORT_A },
    { id: ID[1], ...COHORT_A },
  ];
  const { groups, ungroupedCampaignIds } = groupCampaignsByCohort(campaigns);
  assertEqual(groups.length, 1, "2 campaigns sharing the exact same cohort tuple produce exactly ONE group — this is what lets the orchestration layer call getBenchmarksForMetrics only once for both, i.e. benchmark reuse across same-cohort campaigns");
  assertEqual(groups[0].campaignIds.sort(), [ID[0], ID[1]].sort(), "the single group contains both campaign ids");
  assertEqual(ungroupedCampaignIds, [], "no campaign is left ungrouped when both have a full, matching cohort");
}

// -----------------------------------------------------------------------
// §groupCampaignsByCohort — multiple cohort grouping (different
// cohorts get separate market contexts, never blended/averaged).
// -----------------------------------------------------------------------
{
  const campaigns: CampaignForGrouping[] = [
    { id: ID[0], ...COHORT_A },
    { id: ID[1], ...COHORT_A },
    { id: ID[2], ...COHORT_B },
  ];
  const { groups, ungroupedCampaignIds } = groupCampaignsByCohort(campaigns);
  assertEqual(groups.length, 2, "3 campaigns spanning 2 distinct cohort tuples produce exactly 2 groups — one getBenchmarksForMetrics call per DISTINCT cohort, never per campaign");
  const groupForA = groups.find((g) => g.campaignIds.includes(ID[0]));
  const groupForB = groups.find((g) => g.campaignIds.includes(ID[2]));
  assertTrue(!!groupForA && groupForA.campaignIds.length === 2, "both campaign A-cohort members land in the same group");
  assertTrue(!!groupForB && groupForB.campaignIds.length === 1, "the single campaign B-cohort member gets its own separate group, never merged with cohort A");
  assertEqual(ungroupedCampaignIds, [], "every campaign here has a full cohort, so none is ungrouped");
}

// -----------------------------------------------------------------------
// §groupCampaignsByCohort — 5 campaigns (the maximum), mixed full/
// partial cohorts.
// -----------------------------------------------------------------------
{
  const campaigns: CampaignForGrouping[] = [
    { id: ID[0], ...COHORT_A },
    { id: ID[1], ...COHORT_A },
    { id: ID[2], ...COHORT_B },
    { id: ID[3], ...COHORT_B },
    { id: ID[4], platformKey: "meta", objectiveKey: null, verticalKey: "ecommerce", countryKey: "AR" }, // missing objective
  ];
  const { groups, ungroupedCampaignIds } = groupCampaignsByCohort(campaigns);
  assertEqual(groups.length, 2, "5 selected campaigns (the max) with 2 distinct full cohorts still produce exactly 2 groups");
  assertEqual(ungroupedCampaignIds, [ID[4]], "the one campaign missing a taxonomy dimension is excluded from every group — it never gets a synthetic/partial cohort, and never silently joins a group it doesn't fully match");
}

// -----------------------------------------------------------------------
// §isCurrencyDenominatedUnit / §distinctCurrencies / §isMixedCurrencyRow
// — currency rules, driven by the metric's real unit_type, never a
// hardcoded metric-key list.
// -----------------------------------------------------------------------
assertTrue(isCurrencyDenominatedUnit("currency"), "unit_type 'currency' (cpm/cpc/cpv/cpe/cpa/cpl) is currency-denominated");
assertTrue(!isCurrencyDenominatedUnit("percentage"), "unit_type 'percentage' (ctr/acos/tacos) is currency-neutral");
assertTrue(!isCurrencyDenominatedUnit("multiplier"), "unit_type 'multiplier' (frequency/roas) is currency-neutral");
assertTrue(!isCurrencyDenominatedUnit("count"), "unit_type 'count' (reach) is currency-neutral");

assertEqual(distinctCurrencies(["USD", "USD", "ARS", null, undefined]), ["USD", "ARS"], "distinctCurrencies dedupes and drops null/undefined, preserving first-seen order");
assertEqual(distinctCurrencies(["USD"]), ["USD"], "a single currency stays a single-element list");
assertEqual(distinctCurrencies([]), [], "no currencies present yields an empty list");

assertTrue(isMixedCurrencyRow("currency", ["USD", "ARS"]), "a currency-denominated metric (e.g. CPM) with 2 different currencies present is mixed — no FX, never presented as directly comparable");
assertTrue(!isMixedCurrencyRow("currency", ["USD", "USD"]), "a currency-denominated metric where every campaign happens to use the SAME currency is never flagged mixed");
assertTrue(!isMixedCurrencyRow("currency", ["USD"]), "only one currency present at all can never be 'mixed'");
assertTrue(!isMixedCurrencyRow("percentage", ["USD", "ARS"]), "a currency-neutral ratio (CTR) is never flagged mixed, no matter how many currencies are in play — it remains comparable");
assertTrue(!isMixedCurrencyRow("multiplier", ["USD", "ARS"]), "a currency-neutral ratio (ROAS/frequency) is never flagged mixed either");

// -----------------------------------------------------------------------
// Structural checks — everything below requires the real orchestration
// (RLS-scoped Supabase query, the engine's batching call) or a real
// browser (375px rendering) to genuinely exercise, so it is checked via
// source-text structure exactly like every other scripts/test-*.mts
// file in this project.
// -----------------------------------------------------------------------
const pageSource = readFileSync(new URL("../app/account/contributions/compare/page.tsx", import.meta.url), "utf8");
const matrixSource = readFileSync(new URL("../app/account/contributions/compare/ComparisonMatrix.tsx", import.meta.url), "utf8");
const notEnoughSource = readFileSync(new URL("../app/account/contributions/compare/NotEnoughCampaigns.tsx", import.meta.url), "utf8");
const contributionsListSource = readFileSync(new URL("../app/account/contributions/ContributionsList.tsx", import.meta.url), "utf8");
const engineSource = readFileSync(new URL("../lib/benchmark/engine.ts", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");

// ---------------------------------------------------------------------
// Security: RLS-scoped user client only, never the admin client — an
// unauthorized/missing/nonexistent id is never distinguished from a
// real one it can't read, and never leaked.
// ---------------------------------------------------------------------
assertTrue(pageSource.includes("createServerSupabaseClient()"), "the compare page queries through the RLS-scoped user client, exactly like the sibling [id]/page.tsx");
assertTrue(!pageSource.includes("createAdminClient"), "the compare page never imports or uses the admin client for campaign ownership reads");
assertTrue(!/from ["']@\/lib\/supabase\/admin["']/.test(pageSource), "no import of lib/supabase/admin exists in the compare page at all");
assertTrue(
  pageSource.includes("if (rows.length < 2)") && pageSource.includes('return <NotEnoughCampaigns reason="unavailable" />'),
  "fewer than 2 real, RLS-readable rows coming back (someone else's id, a nonexistent id, or a stale link, in any combination) renders ONE neutral safe state — never a per-id error that would leak which ids were unreadable"
);
assertTrue(
  !/\.single\(\)/.test(pageSource) && !/for \(const id of parsed\.ids\)/.test(pageSource),
  "the page never loops per-id with its own .single() ownership check — it is one batched .in(\"id\", ids) query, so a bad id simply doesn't come back rather than being individually flagged"
);

// ---------------------------------------------------------------------
// No campaign × metric N+1: exactly one getBenchmarksForMetrics call
// site, made once per DISTINCT cohort group (never per campaign), plus
// Reach's own pre-existing per-eligible-campaign getMetricBenchmark
// call (which is not a regression — [id]/page.tsx already pays this
// exact cost for a single campaign).
// ---------------------------------------------------------------------
assertEqual((pageSource.match(/getBenchmarksForMetrics\(/g) ?? []).length, 1, "exactly one call site for getBenchmarksForMetrics in the compare page");
assertTrue(
  /for \(const group of groups\) \{[\s\S]{0,600}await getBenchmarksForMetrics\(/.test(pageSource),
  "the one getBenchmarksForMetrics call site sits inside the per-cohort-GROUP loop, not a per-campaign loop — one call per distinct cohort among the 2-5 selected campaigns"
);
assertTrue(
  /for \(const c of perCampaign\) \{[\s\S]{0,900}await getMetricBenchmark\(/.test(pageSource),
  "Reach's own getMetricBenchmark call is scoped to its existing per-campaign spend/duration-band methodology, never batched with the other metrics — matching [id]/page.tsx's own precedent, not a new N+1"
);
assertTrue(
  pageSource.includes('const unionMetrics = Array.from(new Set(membersMetrics)).filter((m) => m !== "reach");'),
  "metrics are unioned (deduplicated) across a cohort group's members before the single batched call — fully shared metrics and partially shared metrics both collapse to one call with the right metric set, never one call per metric"
);

// ---------------------------------------------------------------------
// Unavailable metric is never fabricated as 0 — a missing metric stays
// null all the way through to rendering.
// ---------------------------------------------------------------------
assertTrue(
  pageSource.includes("value: null as number | null"),
  "a campaign lacking a given metric gets an explicit null value in its matrix cell — never a fabricated 0"
);
assertTrue(
  matrixSource.includes("if (!cell || cell.value === null) {") &&
  (matrixSource.match(/cell\.value === null/g) ?? []).length >= 2,
  "both the mobile card and desktop table render an explicit 'unavailable' state (contributions.compare.metricUnavailable) when a cell's value is null, in both layouts — never a silent 0 or blank"
);

// ---------------------------------------------------------------------
// Currency rules reach all the way to rendering: a mixed-currency row
// never shows a classification/comparison pill, only the neutral note
// plus each campaign's own value and currency.
// ---------------------------------------------------------------------
assertTrue(
  pageSource.includes("if (currencyMixed || cell.value === null || !cell.response || cell.response.status !== \"success\") {") &&
  pageSource.includes("return { ...cell, classification: null };"),
  "classification is stripped for every cell in a mixed-currency row, in the one place the row is assembled — never left to a render-layer decision"
);
assertTrue(
  matrixSource.includes("contributions.compare.mixedCurrencyNote") && matrixSource.includes("!row.currencyMixed && cell.classification !== null"),
  "the UI shows the neutral mixed-currency note instead of a classification pill, in both the mobile card and desktop table"
);

// ---------------------------------------------------------------------
// Market statuses: only the existing, shared vocabulary is used — no
// invented alternative status strings.
// ---------------------------------------------------------------------
assertTrue(
  engineSource.includes('export type CohortQueryStatus = "success" | "insufficient_sample" | "methodology_block" | "no_data";') ||
    readFileSync(new URL("../lib/benchmark/resultStatus.ts", import.meta.url), "utf8").includes(
      'export type CohortQueryStatus = "success" | "insufficient_sample" | "methodology_block" | "no_data";'
    ),
  "the shared CohortQueryStatus vocabulary (success/insufficient_sample/methodology_block/no_data) is unchanged — this feature never adds a new status"
);
assertTrue(
  matrixSource.includes("benchmarkLive.statusShort.") && !/\b(good|great|winner|verdict)Status\b/i.test(matrixSource),
  "the matrix's non-success status chip reuses the existing benchmarkLive.statusShort.* translation namespace, never a new one"
);
// ---------------------------------------------------------------------
// Validation status: the feature never filters campaigns by
// validation_status (valid/pending/excluded/superseded all remain
// selectable — this is the user's OWN historical data), and never
// mutates status. The benchmark engine's own eligibility gate
// (validation_status = 'valid') is completely untouched.
// ---------------------------------------------------------------------
assertTrue(
  !/\.eq\(\s*["']validation_status["']/.test(pageSource),
  "the compare page's own performance_datasets query never filters on validation_status — a selected campaign's pending/excluded/superseded status is preserved and shown, never used to exclude it from the comparison itself"
);
assertTrue(
  !/\.update\(/.test(pageSource) && !/\.update\(/.test(readFileSync(new URL("../lib/benchmark/campaignComparison.ts", import.meta.url), "utf8")),
  "neither the compare page nor its pure helper module ever issues an UPDATE — validation_status is only ever displayed, never mutated by this feature"
);
assertTrue(
  matrixSource.includes("pending:") && matrixSource.includes("valid:") && matrixSource.includes("excluded:") && matrixSource.includes("superseded:"),
  "the matrix's own status pill map covers all four validation statuses the user's historical data can carry (plus flagged/deleted), matching ContributionsList.tsx's own treatment"
);
assertTrue(engineSource.includes('.eq("validation_status", "valid")'), "the benchmark engine's own eligibility gate is completely unchanged by this feature — still requires validation_status = 'valid'");
assertTrue(
  !/observation_fingerprint|supersedes_dataset_id|superseded_by_dataset_id/i.test(engineSource),
  "the benchmark engine still has zero awareness of the identity/supersede columns — 'superseded' stays excluded from benchmark cohorts purely via the existing allowlist filter, exactly as before this feature"
);

// ---------------------------------------------------------------------
// Direct campaign detail links.
// ---------------------------------------------------------------------
assertTrue(
  matrixSource.includes("href={`/account/contributions/${c.id}`}"),
  "each campaign in the identity header links directly to its own existing detail page — no duplicated detail view inside the comparison"
);

// ---------------------------------------------------------------------
// Mobile: an intentional stacked representation below md, never a
// squeezed N-column table, and the desktop table's horizontal scroll is
// scoped to the table's own wrapper, never the page.
// ---------------------------------------------------------------------
assertTrue(
  /mt-6 space-y-3 md:hidden">[\s\S]{0,200}\{rows\.map\(\(row\) => \(/.test(matrixSource),
  "a mobile stacked metric-card list (one card per metric, hidden at md+) exists as a real alternative layout, not a fallback of the desktop table"
);
assertTrue(
  matrixSource.includes("mt-6 hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block"),
  "the desktop matrix table is hidden below md — it never renders (and can never overflow) at mobile widths"
);
assertTrue(
  /hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">\s*<table className="w-full min-w-\[720px\]/.test(matrixSource),
  "the table's own min-width (which could force horizontal scroll) lives strictly inside the overflow-x-auto wrapper that is itself hidden below md — it can never cause the page itself to scroll horizontally at 375px"
);
assertTrue(
  !/<main[^>]*overflow-x/.test(matrixSource) && !/<div className="min-h-screen bg-canvas">[\s\S]{0,120}overflow-x/.test(matrixSource),
  "no overflow-x scroll is applied at the page/main level — horizontal scroll, where it exists at all, is confined to the desktop table's own wrapper"
);

// ---------------------------------------------------------------------
// No winner/ranking/scoring logic anywhere in the new feature's files —
// the product provides context, not a verdict.
// ---------------------------------------------------------------------
// Comment lines are excluded from this check: the files' own header
// comments explicitly document the ABSENCE of winner/ranking language
// (e.g. "No winner/best/worst/ranking/score anywhere in this file"),
// which would otherwise false-positive against the very words they're
// disclaiming. Only actual code/JSX/user-facing strings are checked.
for (const [label, src] of [
  ["ComparisonMatrix.tsx", matrixSource],
  ["compare/page.tsx", pageSource],
  ["campaignComparison.ts", readFileSync(new URL("../lib/benchmark/campaignComparison.ts", import.meta.url), "utf8")],
  ["NotEnoughCampaigns.tsx", notEnoughSource],
] as const) {
  const codeOnly = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
  assertTrue(
    !/\b(winner|best[- ]?performing|worst[- ]?performing|ranking|leaderboard|top[- ]?campaign)\b/i.test(codeOnly),
    `${label}: contains no winner/ranking/leaderboard language in actual code/markup (comment-only disclaimers are excluded from this check)`
  );
}

// ---------------------------------------------------------------------
// Selection UI: min/max enforced client-side too (a UX convenience —
// the real enforcement is the server-side parseComparisonIds already
// tested above), sixth campaign cannot be checked, CTA disabled below 2.
// ---------------------------------------------------------------------
assertTrue(
  contributionsListSource.includes("import { MIN_COMPARISON_CAMPAIGNS, MAX_COMPARISON_CAMPAIGNS } from \"@/lib/benchmark/campaignComparison\";"),
  "the selection UI imports the SAME min/max constants the server enforces — never a second, independently-chosen client-side limit"
);
assertTrue(
  contributionsListSource.includes("if (next.size >= MAX_COMPARISON_CAMPAIGNS) return prev; // sixth campaign cannot be selected"),
  "attempting to check a 6th campaign is a no-op — the checkbox state simply doesn't grow past the max"
);
assertTrue(
  contributionsListSource.includes("disabled={selectedIds.size < MIN_COMPARISON_CAMPAIGNS}"),
  "the 'Comparar seleccionadas' CTA is disabled below the minimum of 2 selections"
);
assertTrue(
  contributionsListSource.includes("router.push(`/account/contributions/compare?ids=${Array.from(selectedIds).join(\",\")}`)"),
  "the CTA navigates to /account/contributions/compare with the selected ids, never a repurposed /comparisons route"
);
assertTrue(!/app\/comparisons/.test(pageSource) && !contributionsListSource.includes('"/comparisons"'), "the new flow never touches or redirects through the existing, semantically-different /comparisons (saved comparisons) route");

// ---------------------------------------------------------------------
// i18n: every new user-facing string exists in BOTH locales, never
// hardcoded, matching this codebase's established convention.
// ---------------------------------------------------------------------
assertEqual((translationsSource.match(/compare: \{/g) ?? []).length, 2, "a contributions.compare namespace exists in both the ES and EN translation blocks");
const compareKeys = [
  "selectForComparison", "maxReached", "selectedCount", "compareSelectedCta", "title", "backToList",
  "someWithoutCohort", "metricColumn", "marketColumn", "metricUnavailable", "mixedCurrencyNote",
  "marketMedian", "noMarketContext", "tooFew", "tooMany", "unavailable",
];
for (const key of compareKeys) {
  assertEqual((translationsSource.match(new RegExp(`\\b${key}:`, "g")) ?? []).length >= 2, true, `translation key "${key}" appears in both locale blocks (ES and EN), never only one`);
}
assertTrue(
  !/<h1[^>]*>Compare|Comparar campañas<\/h1>/.test(matrixSource) && matrixSource.includes('t("contributions.compare.title")'),
  "the comparison page title is rendered via the translation function, never a hardcoded string"
);

// ---------------------------------------------------------------------
// No migration, no RLS change: this feature ships as application code
// only.
// ---------------------------------------------------------------------
{
  const fs = await import("node:fs");
  const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
  const files: string[] = fs.readdirSync(migrationsDir);
  // Deliberately excludes 0011_saved_comparisons.sql (a real, pre-
  // existing, unrelated migration for the Saved Comparisons feature) —
  // checked by exact highest-number instead of a loose "compar"
  // substring match, which would false-positive against that filename.
  const numbers = files.map((f) => parseInt(f.slice(0, 4), 10)).filter((n) => !Number.isNaN(n));
  assertEqual(Math.max(...numbers), 20, "the highest-numbered migration remains 0020_observation_identity.sql — this feature added no new migration (0021 or otherwise)");
  assertTrue(files.includes("0020_observation_identity.sql"), "migration 0020 is still present, unrenamed and unremoved");
}

console.log(`test-campaign-comparison: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
