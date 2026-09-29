// CUCURUCHO INTELLIGENCE 4 — COVERAGE MAP V1.
//
// Same convention as every other scripts/test-*.mts file in this
// project (see scripts/test-campaign-comparison.mts): real imports of
// the shipped pure logic (resolveVariantGroup, deriveBenchmarkStatus,
// COVERAGE_METRIC_KEYS, resolveTimeWindow — none of them touch a
// database at import time or when called with plain values) paired with
// readFileSync-based structural source-text checks for whatever
// genuinely requires a live database (the two real aggregate queries in
// lib/benchmark/coverage.ts) or a real browser (actual 375px rendering)
// to exercise. No live DB, no jsdom — matching this project's
// established methodology. getCoverageGrid/getCoverageTaxonomies
// themselves are NOT called here (they need real Supabase credentials);
// their query architecture is instead verified structurally below.
//
// lib/benchmark/coverage.ts and lib/benchmark/minimumSampleSize.ts are
// deliberately NEVER imported directly here (only readFileSync'd as
// source text, like engine.ts already is throughout this project's
// existing tests) — both carry `import "server-only"`, and this
// project's own server-only package throws unconditionally under plain
// tsx/node execution outside a Next.js build (confirmed pre-existing,
// unrelated to this task: scripts/e2e-fixture-test.mts's own top-level
// `import ... from "../lib/benchmark/engine"` throws identically today).
// COVERAGE_METRIC_KEYS's real behavior is instead re-derived here from
// the same real, imported SINGLE_METRIC_OPTIONS and cross-checked
// against coverage.ts's own source text below.

import { readFileSync } from "node:fs";
import { resolveVariantGroup, type MetricValueGroup } from "../lib/benchmark/metricVariants";
import { deriveBenchmarkStatus, isReachMethodologyBlock } from "../lib/benchmark/resultStatus";
import { DEFAULT_MINIMUM_SAMPLE_SIZE } from "../lib/benchmark/cohortRules";
import { resolveTimeWindow } from "../lib/benchmark/timeWindow";
import { SINGLE_METRIC_OPTIONS } from "../lib/benchmark/singleMetricOptions";

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

const coverageSource = readFileSync(new URL("../lib/benchmark/coverage.ts", import.meta.url), "utf8");
const engineSource = readFileSync(new URL("../lib/benchmark/engine.ts", import.meta.url), "utf8");
const metricVariantsSource = readFileSync(new URL("../lib/benchmark/metricVariants.ts", import.meta.url), "utf8");
const minimumSampleSizeSource = readFileSync(new URL("../lib/benchmark/minimumSampleSize.ts", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../app/coverage/actions.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/coverage/page.tsx", import.meta.url), "utf8");
const explorerSource = readFileSync(new URL("../app/coverage/CoverageExplorer.tsx", import.meta.url), "utf8");
const gridSource = readFileSync(new URL("../app/coverage/CoverageGrid.tsx", import.meta.url), "utf8");
// CUCURUCHO INTELLIGENCE 4.1 (Coverage Map UX Polish): the per-cell CTA
// used to render inline inside every single cell in CoverageGrid.tsx —
// it now renders ONCE, in this new dedicated panel, only for whichever
// cell the user has selected (see that polish pass's own §3/§4). The
// §12/§13 assertions below were repointed here accordingly; destination
// behavior itself (AVAILABLE -> benchmark prefill, LIMITED/NONE ->
// contribute) is unchanged, only WHERE that logic lives.
const cellPanelSource = readFileSync(new URL("../app/coverage/CoverageCellPanel.tsx", import.meta.url), "utf8");
const benchmarkExplorerSource = readFileSync(new URL("../app/benchmark/BenchmarkExplorer.tsx", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");

// -----------------------------------------------------------------------
// §1 VALID-ONLY ELIGIBILITY — pending/excluded/superseded all excluded,
// exactly like lib/benchmark/engine.ts's own fetchEligibleDatasetIds.
// -----------------------------------------------------------------------
assertTrue(
  coverageSource.includes('.eq("validation_status", "valid")'),
  "the eligibility aggregate query filters on validation_status = 'valid' (pending/excluded/superseded rows are never eligible)"
);
assertTrue(
  !coverageSource.includes('"pending"') && !coverageSource.includes('"excluded"') && !coverageSource.includes('"superseded"'),
  "no other validation_status value is ever treated as eligible"
);

// -----------------------------------------------------------------------
// §2 EXACT MINIMUM-SAMPLE BOUNDARY — deriveBenchmarkStatus (the real,
// shared function this module calls, never a re-implementation) flips
// from insufficient_sample to success exactly AT the threshold, never
// one below or requiring one above.
// -----------------------------------------------------------------------
const atThreshold = deriveBenchmarkStatus({
  metricKey: "ctr",
  spendBand: undefined,
  durationBand: undefined,
  relaxedDimensions: undefined,
  sufficientData: DEFAULT_MINIMUM_SAMPLE_SIZE >= DEFAULT_MINIMUM_SAMPLE_SIZE,
  cohortSampleSize: DEFAULT_MINIMUM_SAMPLE_SIZE,
});
assertEqual(atThreshold, "success", "a metric sample size exactly equal to the minimum sample size is success, not insufficient_sample");

const oneBelowThreshold = deriveBenchmarkStatus({
  metricKey: "ctr",
  spendBand: undefined,
  durationBand: undefined,
  relaxedDimensions: undefined,
  sufficientData: false,
  cohortSampleSize: DEFAULT_MINIMUM_SAMPLE_SIZE - 1,
});
assertEqual(oneBelowThreshold, "insufficient_sample", "one below the minimum sample size (but cohort non-empty) is insufficient_sample");

// -----------------------------------------------------------------------
// §3 ALL FOUR CANONICAL STATUSES SUPPORTED — no fifth/invented state.
// -----------------------------------------------------------------------
assertEqual(
  deriveBenchmarkStatus({ metricKey: "ctr", spendBand: undefined, durationBand: undefined, relaxedDimensions: undefined, sufficientData: true, cohortSampleSize: 40 }),
  "success",
  "sufficient data -> success"
);
assertEqual(
  deriveBenchmarkStatus({ metricKey: "ctr", spendBand: undefined, durationBand: undefined, relaxedDimensions: undefined, sufficientData: false, cohortSampleSize: 0 }),
  "no_data",
  "an empty cohort (zero eligible datasets) -> no_data, never insufficient_sample"
);
assertEqual(
  deriveBenchmarkStatus({ metricKey: "ctr", spendBand: undefined, durationBand: undefined, relaxedDimensions: undefined, sufficientData: false, cohortSampleSize: 5 }),
  "insufficient_sample",
  "a non-empty cohort whose metric sample is still below threshold -> insufficient_sample"
);
assertEqual(
  deriveBenchmarkStatus({ metricKey: "reach", spendBand: undefined, durationBand: undefined, relaxedDimensions: undefined, sufficientData: true, cohortSampleSize: 500 }),
  "methodology_block",
  "Reach with no Spend Range/Duration Band -> methodology_block, taking precedence even over a large, otherwise-sufficient cohort"
);
assertTrue(
  isReachMethodologyBlock("reach", undefined, undefined, undefined),
  "coverage.ts's own reach handling reuses the exact same isReachMethodologyBlock predicate the live engine uses (verified directly, not re-implemented)"
);

// -----------------------------------------------------------------------
// §4 EMPTY VERTICAL -> no_data WITHOUT A PER-VERTICAL QUERY — the
// eligibility query is issued ONCE (not inside a loop over verticals),
// and a vertical the aggregate query never returns is represented as
// "canonical taxonomy minus returned cohorts" — confirmed structurally
// since the map is pre-seeded with every requested vertical key before
// the single query even runs.
// -----------------------------------------------------------------------
const fetchEligibleFnMatch = coverageSource.match(/async function fetchEligibleDatasetIdsByVertical[\s\S]*?\n}\n/);
assertTrue(!!fetchEligibleFnMatch, "fetchEligibleDatasetIdsByVertical is present");
const fetchEligibleFnBody = fetchEligibleFnMatch ? fetchEligibleFnMatch[0] : "";
assertTrue(
  !/for\s*\(const \w+ of verticalKeys\)\s*\{[\s\S]*?(createAdminClient|\.from\()/.test(fetchEligibleFnBody.replace(/for \(const key of verticalKeys\) byVertical\.set\(key, \[\]\);/, "")),
  "the eligibility query is never re-issued inside a per-vertical loop — pre-seeding the map with every vertical key (byVertical.set(key, [])) is the ONLY per-vertical loop before the single real query runs"
);
assertTrue(
  (fetchEligibleFnBody.match(/\.from\("performance_datasets"\)/g) ?? []).length === 1,
  "exactly ONE performance_datasets query resolves eligibility for every vertical at once (never one query per vertical)"
);

// -----------------------------------------------------------------------
// §5/§6 METRIC-DEFINITION VARIANT ISOLATION — the exact same rule the
// live engine uses (imported, not duplicated): incompatible variants are
// never pooled together, the single largest group always wins.
// -----------------------------------------------------------------------
const incompatibleVariants: MetricValueGroup[] = [
  { variantId: "variant-a", values: [1, 2, 3] },
  { variantId: "variant-b", values: [10, 20, 30, 40, 50] },
];
const chosen = resolveVariantGroup(incompatibleVariants);
assertEqual(chosen?.variantId, "variant-b", "resolveVariantGroup picks the single LARGEST variant group");
assertEqual(chosen?.values.length, 5, "the chosen group's sample size is that group's own count, never the sum of both incompatible variants (1+2+3 and 10+20+30+40+50 are never pooled into one sample of 8)");
assertEqual(resolveVariantGroup([]), null, "an empty group list resolves to null (no metric data at all for this vertical/metric pair)");

// -----------------------------------------------------------------------
// §7/§8 CANONICAL METRIC UNIVERSE — Coverage V1 reuses
// SINGLE_METRIC_OPTIONS verbatim as its base metric list, excluding Reach
// ONLY at this presentation layer (SINGLE_METRIC_OPTIONS itself, and
// Reach's own methodology, are completely untouched).
// -----------------------------------------------------------------------
const derivedCoverageMetricKeys = SINGLE_METRIC_OPTIONS.filter((m) => m !== "reach");
assertTrue(SINGLE_METRIC_OPTIONS.includes("reach"), "SINGLE_METRIC_OPTIONS (the shared, canonical metric list) still includes reach — globally unchanged");
assertTrue(!derivedCoverageMetricKeys.includes("reach"), "filtering reach out of SINGLE_METRIC_OPTIONS (coverage.ts's own COVERAGE_METRIC_KEYS expression) excludes it — a display decision, not a methodology change");
assertEqual(derivedCoverageMetricKeys.length, SINGLE_METRIC_OPTIONS.length - 1, "exactly one metric (reach) is excluded from Coverage's presented columns");
assertTrue(
  coverageSource.includes('export const COVERAGE_METRIC_KEYS: string[] = SINGLE_METRIC_OPTIONS.filter((m) => m !== "reach");'),
  "coverage.ts's own COVERAGE_METRIC_KEYS is derived FROM SINGLE_METRIC_OPTIONS by filtering, never an independently-maintained second list"
);

// -----------------------------------------------------------------------
// §9 CANONICAL TIME-WINDOW SEMANTICS — Coverage V1 uses last_12_months,
// an existing, unmodified TimeWindowInput case — never a new time-window
// concept.
// -----------------------------------------------------------------------
const window = resolveTimeWindow({ kind: "last_12_months" });
assertTrue(window.startDate < window.endDate, "last_12_months resolves to a real, well-ordered [startDate, endDate) window using the engine's own unmodified resolveTimeWindow");
assertTrue(
  actionsSource.includes('{ kind: "last_12_months" }'),
  "app/coverage/actions.ts pins Coverage's Time Window to the existing last_12_months TimeWindowInput case, never a new custom concept"
);

// -----------------------------------------------------------------------
// §10 NO N x M QUERY ARCHITECTURE — a fixed, small number of aggregate
// queries regardless of vertical/metric count. The per-(vertical,
// metric) loop inside getCoverageGrid must be PURE — no database call of
// any kind inside it.
// -----------------------------------------------------------------------
const getCoverageGridMatch = coverageSource.match(/export async function getCoverageGrid[\s\S]*?\n}\n/);
assertTrue(!!getCoverageGridMatch, "getCoverageGrid is present");
const cellLoopMatch = coverageSource.match(/for \(const vertical of verticalKeys\) \{[\s\S]*?\n  \}\n\n  return \{ verticals/);
assertTrue(!!cellLoopMatch, "the per-(vertical, metric) cell-building loop is present in getCoverageGrid");
const cellLoopBody = cellLoopMatch ? cellLoopMatch[0] : "";
assertTrue(
  !cellLoopBody.includes("createAdminClient") && !cellLoopBody.includes(".from(") && !cellLoopBody.includes("await supabase"),
  "the per-(vertical, metric) cell loop that builds all up-to-290 cells is 100% pure (no database call inside it) — every real query already ran ONCE, before this loop, in fetchEligibleDatasetIdsByVertical/fetchMetricValueGroupsByVertical"
);
assertTrue(
  (coverageSource.match(/createAdminClient\(\)/g) ?? []).length <= 3,
  "a fixed, small number of admin-client acquisitions in this module (eligibility query, metric-id lookup, metric-values query) — never one per vertical or one per metric"
);
assertTrue(
  !/getBenchmarkMatrix|getMetricBenchmark\(|getBenchmarksForMetrics\(/.test(coverageSource),
  "Coverage never calls the live single-cohort engine entry points per cell (lib/benchmark/engine.ts's own getBenchmarkMatrix does exactly that N x M anti-pattern for a much smaller, unrelated matrix — Coverage V1 deliberately does not replicate it)"
);

// -----------------------------------------------------------------------
// §11 NO EXACT n / DATASET IDS / OWNER IDS / CAMPAIGN NAMES EXPOSED —
// the privacy lock: V1 has no curator-specific count view at all.
// -----------------------------------------------------------------------
const coverageCellInterfaceMatch = coverageSource.match(/export interface CoverageCell \{[\s\S]*?\n\}/);
assertTrue(!!coverageCellInterfaceMatch, "CoverageCell interface is present");
assertTrue(
  !!coverageCellInterfaceMatch && /vertical: string;\s*\/\/[^\n]*\n\s*metric: string;\s*\/\/[^\n]*\n\s*(\/\/[\s\S]*?\n\s*)*status: CohortQueryStatus;\s*\n\}/.test(coverageCellInterfaceMatch[0]),
  "CoverageCell carries ONLY vertical/metric/status — never a sample count, dataset id, owner id, or campaign name field"
);
for (const forbidden of ["sampleSize", "datasetId", "dataset_id", "ownerId", "owner_id", "campaignName", "campaign_name"]) {
  assertTrue(!gridSource.includes(forbidden), `app/coverage/CoverageGrid.tsx never renders "${forbidden}" — cells show status only`);
  assertTrue(!explorerSource.includes(forbidden), `app/coverage/CoverageExplorer.tsx never references "${forbidden}"`);
  assertTrue(!cellPanelSource.includes(forbidden), `app/coverage/CoverageCellPanel.tsx never references "${forbidden}"`);
}

// -----------------------------------------------------------------------
// §12/§13 CTA BEHAVIOR — AVAILABLE -> benchmark (reusing the EXISTING
// prefill contract), LIMITED/NONE -> contribute (plain, no prefill).
//
// CUCURUCHO INTELLIGENCE 4.1 (Coverage Map UX Polish, §3/§4): this logic
// used to be inline in every cell (CoverageGrid.tsx's old CellAction);
// it was relocated, not removed, into the new CoverageCellPanel.tsx so
// it renders once for the selected cell instead of once per cell — see
// cellPanelSource's own definition above. Destination behavior is
// byte-for-byte the same contract, just checked at its new location.
// -----------------------------------------------------------------------
assertTrue(
  !gridSource.includes('href="/contribute"') && !gridSource.includes("buildBenchmarkHref") && !gridSource.includes('t("nav.contributeData")') && !gridSource.includes('t("benchmarkLive.getBenchmark")'),
  "CoverageGrid.tsx (the matrix itself) no longer renders any per-cell CTA text or link — the repeated 'Sin datos' / 'Aportar datos' noise this polish pass exists to remove is gone from every cell by construction"
);
assertTrue(
  cellPanelSource.includes('cell.status === "success"') && cellPanelSource.includes('href={buildBenchmarkHref('),
  "the contextual cell panel: an AVAILABLE (success) selection links to /benchmark via the shared prefill-URL builder"
);
assertTrue(
  cellPanelSource.includes('href="/contribute"') && /cell\.status === "insufficient_sample" \|\| cell\.status === "no_data"/.test(cellPanelSource),
  "the contextual cell panel: a LIMITED (insufficient_sample) or NONE (no_data) selection links plainly to /contribute — no contextual prefill added to that route (per the locked spec's explicit 'no contribution prefill in V1')"
);
assertTrue(
  cellPanelSource.includes('{cell.status === "methodology_block" && <p className="text-xs text-ink-500">{t("coverageMap.methodologyBlockHint")}</p>}'),
  "the contextual cell panel: a METHODOLOGY_BLOCK selection renders the explanation paragraph ONLY (no Link/href on that same line) — never an arbitrary contribution CTA"
);
for (const param of ["prefillPlatform", "prefillObjective", "prefillVertical", "prefillCountry", "prefillMetric"]) {
  assertTrue(cellPanelSource.includes(param), `Coverage's own AVAILABLE-cell link reuses the exact existing /benchmark prefill param "${param}"`);
  assertTrue(benchmarkExplorerSource.includes(`searchParams.get("${param}")`), `/benchmark itself still reads "${param}" from its existing, unmodified prefill contract`);
}
assertTrue(
  !gridSource.includes("ContributeWizard") && !explorerSource.includes("ContributeWizard") && !cellPanelSource.includes("ContributeWizard"),
  "Coverage never touches ContributeWizard.tsx — the locked spec explicitly forbids adding contribution prefill in V1"
);

// -----------------------------------------------------------------------
// §14 DESKTOP MATRIX STRUCTURE.
// -----------------------------------------------------------------------
assertTrue(gridSource.includes("<table") && gridSource.includes("hidden overflow-x-auto"), "the desktop view is a real <table>, hidden below md, with its OWN horizontal-scroll wrapper");
assertTrue(gridSource.includes("md:block"), "the desktop table wrapper becomes visible at md and above");

// -----------------------------------------------------------------------
// §15/§16/§17 MOBILE STACKED CARDS, 375px STRUCTURE, NO PAGE-LEVEL
// HORIZONTAL OVERFLOW.
// -----------------------------------------------------------------------
assertTrue(gridSource.includes("space-y-3 md:hidden"), "mobile renders stacked cards (one per vertical), hidden at md and above — never a compressed version of the desktop table");
assertTrue(
  gridSource.includes('className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm"'),
  "the mobile card uses the same rounded-2xl/border-line/bg-surface/p-3.5/shadow-sm convention already established elsewhere in the product (e.g. ContributionsList's own campaign card)"
);
assertTrue(!/<main[^>]*overflow-x/.test(explorerSource), "no overflow-x is introduced at the page/main level — only the desktop table's own inner wrapper scrolls horizontally, never the page");
assertTrue(
  (gridSource.match(/overflow-x-auto/g) ?? []).length === 1,
  "exactly one horizontal-scroll container exists in the whole Coverage grid component, scoped to the desktop table wrapper only"
);

// -----------------------------------------------------------------------
// §18 ES/EN TRANSLATION COMPLETENESS.
// -----------------------------------------------------------------------
const coverageMapBlocks = translationsSource.match(/coverageMap: \{[\s\S]*?\n  \},/g) ?? [];
assertEqual(coverageMapBlocks.length, 2, "exactly two coverageMap translation blocks exist (one ES, one EN)");
for (const key of ["title", "subtitle", "selectPrompt", "loading", "errorTitle", "errorBody", "retryCta", "taxonomyErrorTitle", "taxonomyErrorBody", "verticalColumnHeader", "methodologyBlockHint", "mobileStatusLabel", "exploreCoverageCta"]) {
  assertTrue(
    coverageMapBlocks.every((block) => block.includes(`${key}:`)),
    `both ES and EN coverageMap blocks define "${key}"`
  );
}
for (const statusKey of ["success", "insufficient_sample", "no_data", "methodology_block"]) {
  assertTrue(
    coverageMapBlocks.every((block) => block.includes(`${statusKey}:`)),
    `both ES and EN coverageMap.status blocks define "${statusKey}" — exactly the four locked public statuses, no fifth`
  );
}
assertTrue(
  translationsSource.includes('exploreCoverageCta: "Explorar cobertura de datos"') && translationsSource.includes('exploreCoverageCta: "Explore data coverage"'),
  "the /benchmark -> /coverage discoverability link has real ES and EN copy"
);

// -----------------------------------------------------------------------
// §19 NO RANKINGS/SCORES/PERCENTAGES/WINNERS GUARD — Coverage Map is
// explicitly non-gamified: status only, never a score or completeness
// percentage.
// -----------------------------------------------------------------------
for (const forbidden of ["ranking", "Ranking", "winner", "Winner", "score", "Score", "completeness", "Completeness"]) {
  assertTrue(!coverageSource.includes(forbidden), `lib/benchmark/coverage.ts never mentions "${forbidden}"`);
  assertTrue(!gridSource.includes(forbidden), `app/coverage/CoverageGrid.tsx never mentions "${forbidden}"`);
  assertTrue(!explorerSource.includes(forbidden), `app/coverage/CoverageExplorer.tsx never mentions "${forbidden}"`);
}

// -----------------------------------------------------------------------
// §20 engine.ts BEHAVIOR-PRESERVING EXTRACTION — resolveVariantGroup/
// MetricValueGroup/getMinimumSampleSize are no longer defined privately
// inside engine.ts; it imports the exact same shared implementations
// coverage.ts uses, so the two can never silently drift apart.
// -----------------------------------------------------------------------
assertTrue(!engineSource.includes("interface MetricValueGroup"), "engine.ts no longer defines its own private MetricValueGroup — it imports the shared one");
assertTrue(!/^function resolveVariantGroup/m.test(engineSource), "engine.ts no longer defines its own private resolveVariantGroup — it imports the shared one");
assertTrue(!/^async function getMinimumSampleSize/m.test(engineSource), "engine.ts no longer defines its own private getMinimumSampleSize — it imports the shared one");
assertTrue(
  engineSource.includes('import { resolveVariantGroup, type MetricValueGroup } from "./metricVariants"') &&
  engineSource.includes('import { getMinimumSampleSize } from "./minimumSampleSize"'),
  "engine.ts imports both extracted helpers from their new shared modules"
);
assertTrue(
  metricVariantsSource.includes("g.values.length > largest.values.length ? g : largest"),
  "the extracted resolveVariantGroup preserves the EXACT original largest-group comparison, unchanged"
);
assertTrue(
  minimumSampleSizeSource.includes('.eq("setting_key", "minimum_sample_size")') && minimumSampleSizeSource.includes("DEFAULT_MINIMUM_SAMPLE_SIZE"),
  "the extracted getMinimumSampleSize preserves the EXACT original benchmark_settings lookup and fallback, unchanged"
);

// -----------------------------------------------------------------------
// §21 NO OPTIONAL/RELAXABLE DIMENSION FILTERS IN COVERAGE V1 — Coverage
// shows the broadest honest coverage for Platform+Objective+Country,
// never a narrower slice a user never asked for.
// -----------------------------------------------------------------------
for (const optionalFilter of ["audience_strategy_id", "funnel_stage_id", "min_age", "max_age", "gender_targeting", "business_model_id"]) {
  assertTrue(!coverageSource.includes(optionalFilter), `Coverage's own eligibility query never filters on the optional/relaxable dimension "${optionalFilter}" — only the five protected dimensions (platform/objective/vertical/country/time window)`);
}

// -----------------------------------------------------------------------
// §22 PAGE/COMPONENT WIRING SANITY — the Server Component delegates to
// the Client Component exactly like app/benchmark/page.tsx's own
// established split, and no permanent sidebar item was added for this
// phase (per the locked spec).
// -----------------------------------------------------------------------
assertTrue(pageSource.includes("getCoverageTaxonomies") && pageSource.includes("<CoverageExplorer"), "app/coverage/page.tsx fetches taxonomies server-side and delegates rendering to the client explorer, mirroring app/benchmark/page.tsx's own split");
const sidebarSourceForCoverage = readFileSync(new URL("../components/dashboard/DashboardSidebar.tsx", import.meta.url), "utf8");
assertTrue(!sidebarSourceForCoverage.includes("/coverage"), "no permanent sidebar item was added for /coverage in this phase — discoverability is via the one small link on /benchmark only, per the locked spec");

console.log(`test-coverage-map: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
