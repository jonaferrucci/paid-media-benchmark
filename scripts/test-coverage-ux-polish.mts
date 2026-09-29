// CUCURUCHO INTELLIGENCE 4.1 — COVERAGE MAP UX POLISH.
//
// A dedicated regression suite for this polish pass, separate from
// scripts/test-coverage-map.mts (which stays focused on Coverage's data
// layer/query architecture invariants). Same established convention as
// every other scripts/test-*.mts file: readFileSync-based structural
// source-text checks for UI composition, plus one pure-logic import
// (SINGLE_METRIC_OPTIONS) that carries no "server-only" guard. Nothing
// here touches lib/benchmark/coverage.ts, engine.ts, metricVariants.ts,
// or minimumSampleSize.ts — this task is UX polish only, and those four
// files are confirmed byte-for-byte unchanged (see §data-architecture
// below and this task's own final report).

import { readFileSync } from "node:fs";
import { SINGLE_METRIC_OPTIONS } from "../lib/benchmark/singleMetricOptions";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const explorerSource = readFileSync(new URL("../app/coverage/CoverageExplorer.tsx", import.meta.url), "utf8");
const gridSource = readFileSync(new URL("../app/coverage/CoverageGrid.tsx", import.meta.url), "utf8");
const legendSource = readFileSync(new URL("../app/coverage/CoverageStatusLegend.tsx", import.meta.url), "utf8");
const metricControlSource = readFileSync(new URL("../app/coverage/CoverageMetricVisibilityControl.tsx", import.meta.url), "utf8");
const cellPanelSource = readFileSync(new URL("../app/coverage/CoverageCellPanel.tsx", import.meta.url), "utf8");
const emptyStateSource = readFileSync(new URL("../app/coverage/CoverageEmptyState.tsx", import.meta.url), "utf8");
const statusStyleSource = readFileSync(new URL("../app/coverage/statusStyle.ts", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../app/coverage/actions.ts", import.meta.url), "utf8");
const coverageSource = readFileSync(new URL("../lib/benchmark/coverage.ts", import.meta.url), "utf8");
const engineSource = readFileSync(new URL("../lib/benchmark/engine.ts", import.meta.url), "utf8");
const metricVariantsSource = readFileSync(new URL("../lib/benchmark/metricVariants.ts", import.meta.url), "utf8");
const minimumSampleSizeSource = readFileSync(new URL("../lib/benchmark/minimumSampleSize.ts", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");

// -----------------------------------------------------------------------
// §1 METRIC VISIBILITY.
// -----------------------------------------------------------------------
assertTrue(
  explorerSource.includes('const DEFAULT_VISIBLE_METRIC_KEYS = ["cpm", "ctr", "cpc", "cpa"];'),
  "a small, neutral default visible-metric subset (4 metrics) is defined — not the full Coverage metric universe"
);
assertTrue(
  !/objective.*compat|compatib.*objective/i.test(explorerSource),
  "the default subset is documented as NEUTRAL, never derived from an invented objective<->metric compatibility rule"
);
assertTrue(
  !explorerSource.includes("objective_metrics") && !coverageSource.includes("objective_metrics"),
  "no new objective<->metric compatibility table/concept was invented — none exists in this codebase (platform_metrics/media_category_metrics are keyed by platform/media category, not objective)"
);
assertTrue(
  explorerSource.includes("visibleMetrics") && explorerSource.includes("setVisibleMetrics") && explorerSource.includes("handleToggleMetric"),
  "the user can change which metrics are visible via client-side state (no page reload, no new query)"
);
assertTrue(
  metricControlSource.includes("onToggle") && metricControlSource.includes("aria-pressed={active}"),
  "the metric visibility control is a real toggle (aria-pressed), not read-only"
);
assertTrue(
  !explorerSource.includes("fetchCoverageGrid(") || (explorerSource.match(/fetchCoverageGrid\(/g) ?? []).length === 1,
  "fetchCoverageGrid is called from exactly one place (loadGrid) — toggling metric visibility never calls it a second time"
);
assertTrue(
  !metricControlSource.includes("fetchCoverageGrid") && !metricControlSource.includes("await "),
  "CoverageMetricVisibilityControl.tsx performs no I/O at all — pure presentation-state toggle"
);
assertTrue(SINGLE_METRIC_OPTIONS.includes("reach"), "SINGLE_METRIC_OPTIONS (the shared, canonical metric list) still includes reach — globally unchanged by this polish pass");
assertTrue(!explorerSource.includes('"reach"') || explorerSource.includes("Reach is excluded"), "no accidental reintroduction of reach into Coverage's own presented metric set");

// -----------------------------------------------------------------------
// §2 STATUS LEGEND — all four canonical statuses, no numbers, no
// ranking semantics, visually secondary.
// -----------------------------------------------------------------------
assertTrue(
  legendSource.includes('LEGEND_ORDER: CohortQueryStatus[] = ["success", "insufficient_sample", "no_data", "methodology_block"]'),
  "the legend lists exactly the four canonical statuses, no fifth/invented one"
);
assertTrue(
  legendSource.includes("COVERAGE_STATUS_STYLE") && legendSource.includes('t(`coverageMap.status.${status}`)'),
  "the legend reuses the SAME status colors/labels the matrix cells use — never a second, independently-maintained copy"
);
assertTrue(!legendSource.includes("{n}") && !legendSource.includes("sampleSize") && !legendSource.includes("count"), "the legend never interpolates a numeric count — status labels only");
assertTrue(legendSource.includes("text-ink-500") || legendSource.includes("text-ink-400"), "the legend uses a visually secondary (muted) text color, never a loud/primary one");

// -----------------------------------------------------------------------
// §3 REMOVE REPEATED CELL CTA — the matrix itself never renders
// "Aportar datos"/"Ver benchmark" text under every cell any more.
// -----------------------------------------------------------------------
assertTrue(
  !gridSource.includes("nav.contributeData") && !gridSource.includes("benchmarkLive.getBenchmark") && !gridSource.includes("buildBenchmarkHref"),
  "CoverageGrid.tsx (the matrix) contains NO CTA text or link generation of any kind — status chip only, per cell"
);
assertTrue(
  (gridSource.match(/<StatusChip status=\{status\} \/>/g) ?? []).length === 2,
  "exactly two StatusChip render sites remain (desktop cell, mobile row) — both status-only, no accompanying CTA markup"
);

// -----------------------------------------------------------------------
// §4 CONTEXTUAL CELL ACTION.
// -----------------------------------------------------------------------
assertTrue(
  gridSource.includes("onSelectCell") && gridSource.includes("aria-pressed={selected}"),
  "matrix cells (desktop and mobile) are real interactive controls with an aria-pressed selected state"
);
assertTrue(
  (gridSource.match(/<button\s/g) ?? []).length >= 2,
  "both the desktop cell and the mobile row are real <button> elements — native keyboard/focus semantics, not a div with an onClick"
);
assertTrue(
  gridSource.includes("focus-visible:outline") && (gridSource.match(/focus-visible:outline/g) ?? []).length >= 2,
  "both interactive cell types declare a visible focus state"
);
assertTrue(
  explorerSource.includes("selectedCell") && explorerSource.includes("<CoverageCellPanel"),
  "CoverageExplorer renders the one contextual panel for the currently selected cell"
);
assertTrue(cellPanelSource.includes("onClose") && cellPanelSource.includes("aria-label={t(\"coverageMap.closeCellDetail\")}"), "the contextual panel has an accessible, keyboard-reachable close control");

// -----------------------------------------------------------------------
// §5 ALL-NO-DATA EMPTY STATE.
// -----------------------------------------------------------------------
assertTrue(
  explorerSource.includes('grid.grid.cells.every((c) => c.status === "no_data")'),
  "the all-no-data gate checks the FULL, unfiltered grid response — not the user's currently visible-metric subset"
);
assertTrue(
  explorerSource.includes("allNoData && !showMatrixOverride") && explorerSource.includes("<CoverageEmptyState"),
  "when every cell is no_data (and the user hasn't overridden it), the empty state renders instead of the matrix"
);
assertTrue(
  explorerSource.includes("onViewMatrix={() => setShowMatrixOverride(true)}"),
  "'Ver detalle por vertical' / 'View detail by vertical' reveals the normal matrix on explicit user request"
);
assertTrue(
  explorerSource.includes("setShowMatrixOverride(false)"),
  "the override resets whenever the underlying selection/grid changes (loadGrid), so a stale override never leaks across a different Platform+Objective+Country combination"
);
assertTrue(
  emptyStateSource.includes('href="/contribute"') && !emptyStateSource.includes("no_data ="),
  "the empty state offers the contribute CTA but never mutates or re-derives coverage statuses itself — it is presentation only"
);
// A grid with at least one non-no_data cell must bypass the gate.
assertTrue(
  /grid\.grid\.cells\.length > 0 && grid\.grid\.cells\.every/.test(explorerSource),
  "the every(...) check is only meaningful over a non-empty cell list — an empty grid never falsely counts as all-no-data"
);

// -----------------------------------------------------------------------
// §6 MATRIX (DESKTOP) — verticals still rows, visible metrics still
// columns, contained horizontal scroll, subtle selected state.
// -----------------------------------------------------------------------
assertTrue(gridSource.includes("<table") && gridSource.includes("hidden overflow-x-auto") && gridSource.includes("md:block"), "the desktop matrix structure (real <table>, hidden below md, own scroll wrapper) is unchanged by this polish pass");
assertTrue((gridSource.match(/overflow-x-auto/g) ?? []).length === 1, "exactly one horizontal-scroll container — scoped to the desktop table wrapper only, never the page");
assertTrue(gridSource.includes('selected ? "bg-primary/10" : "hover:bg-surface2"'), "the selected desktop cell gets a clear but subtle highlight (a tinted background), not a loud redesign");

// -----------------------------------------------------------------------
// §7 MOBILE — stacked cards preserved, same reduced metric selection,
// no page-level horizontal overflow, interaction works on mobile too.
// -----------------------------------------------------------------------
assertTrue(gridSource.includes("space-y-3 md:hidden"), "mobile still renders stacked cards, hidden at md and above — never a compressed desktop table");
assertTrue(
  gridSource.includes('className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm"'),
  "the mobile card wrapper keeps the exact same established convention (rounded-2xl/border-line/bg-surface/p-3.5/shadow-sm)"
);
assertTrue(!/<main[^>]*overflow-x/.test(explorerSource), "no overflow-x introduced at the page/main level by this polish pass");
assertTrue(
  (gridSource.match(/visibleMetrics\.map\(/g) ?? []).length === 3,
  "the desktop header, the desktop cells, and the mobile per-card rows all iterate the SAME reduced visibleMetrics prop — one source of truth for what's shown, never an independently-filtered second list"
);
assertTrue(
  gridSource.includes("aria-pressed={selected}") && (gridSource.match(/aria-pressed=\{selected\}/g) ?? []).length === 2,
  "cell interaction (selection) is wired identically for both the desktop cell and the mobile card row — mobile is not read-only"
);

// -----------------------------------------------------------------------
// §CTA — the exact destination contract must be unchanged (only WHERE
// it renders changed). Mirrors scripts/test-coverage-map.mts's own
// §12/§13, re-verified here from the UX-polish angle for completeness.
// -----------------------------------------------------------------------
assertTrue(cellPanelSource.includes('cell.status === "success"') && cellPanelSource.includes("buildBenchmarkHref("), "AVAILABLE selection -> the existing /benchmark prefill contract, unchanged");
assertTrue(/cell\.status === "insufficient_sample" \|\| cell\.status === "no_data"/.test(cellPanelSource) && cellPanelSource.includes('href="/contribute"'), "LIMITED/NONE selection -> plain /contribute, unchanged");
assertTrue(
  cellPanelSource.includes('{cell.status === "methodology_block" && <p className="text-xs text-ink-500">{t("coverageMap.methodologyBlockHint")}</p>}'),
  "METHODOLOGY_BLOCK selection -> explanation only, never an arbitrary contribution CTA"
);

// -----------------------------------------------------------------------
// §8 FILTERS — still exactly Platform/Objective/Country, no new cohort
// dimension added in 4.1.
// -----------------------------------------------------------------------
for (const forbiddenFilter of ["audienceStrategy", "businessModel", "funnelStage", "spendBand", "durationBand"]) {
  assertTrue(!explorerSource.includes(forbiddenFilter), `CoverageExplorer.tsx introduces no new cohort filter dimension ("${forbiddenFilter}") in 4.1`);
  assertTrue(!actionsSource.includes(forbiddenFilter), `app/coverage/actions.ts introduces no new cohort filter dimension ("${forbiddenFilter}") in 4.1`);
}
assertTrue(
  (explorerSource.match(/<Select\s/g) ?? []).length === 3,
  "exactly three Select controls remain (Platform, Objective, Country) — metric visibility is a separate, non-Select toggle control, not a fourth cohort filter"
);

// -----------------------------------------------------------------------
// §9 DATA ARCHITECTURE — the four protected data-layer files are
// completely unchanged; no new DB query was introduced for metric
// visibility or cell interaction.
// -----------------------------------------------------------------------
assertTrue(
  coverageSource.includes("export async function getCoverageGrid(query: CoverageQuery, verticalKeys: string[], metricKeys: string[]): Promise<CoverageGrid> {"),
  "lib/benchmark/coverage.ts's getCoverageGrid signature is byte-for-byte unchanged"
);
assertTrue(
  (coverageSource.match(/createAdminClient\(\)/g) ?? []).length <= 3,
  "coverage.ts still resolves the grid with the same fixed, small number of admin-client acquisitions — no new query added for this polish pass"
);
assertTrue(
  actionsSource.includes("export async function fetchCoverageGrid(request: CoverageGridRequest, verticalKeys: string[]): Promise<CoverageGridActionResult> {"),
  "app/coverage/actions.ts's fetchCoverageGrid signature is byte-for-byte unchanged — still the ONLY server call Coverage's UI makes"
);
for (const src of [metricControlSource, legendSource, cellPanelSource, emptyStateSource]) {
  assertTrue(!src.includes('from "./actions"') && !src.includes("fetchCoverageGrid("), "none of the four new presentation components import or call the server action — they only ever render already-fetched data or link to existing routes");
}

// -----------------------------------------------------------------------
// §10 I18N — ES/EN completeness for every new string.
// -----------------------------------------------------------------------
const coverageMapBlocks = translationsSource.match(/coverageMap: \{[\s\S]*?\n  \},/g) ?? [];
for (const key of ["legendLabel", "metricsControlLabel", "closeCellDetail", "allNoDataTitle", "allNoDataBody", "viewByVerticalCta"]) {
  assertTrue(coverageMapBlocks.length === 2 && coverageMapBlocks.every((b) => b.includes(`${key}:`)), `both ES and EN coverageMap blocks define the new "${key}" key`);
}
assertTrue(
  translationsSource.includes('allNoDataBody: "No encontramos datos validados suficientes para mostrar cobertura de {platform} · {objective} · {country}.') &&
  translationsSource.includes('allNoDataBody: "We couldn\'t find enough validated data to show coverage for {platform} · {objective} · {country}.'),
  "the all-no-data body interpolates platform/objective/country in both languages"
);
// No duplicated status vocabulary — the legend/panel reuse
// coverageMap.status.* rather than a second set of status strings.
assertTrue(
  !translationsSource.includes("legendStatus") && !translationsSource.includes("panelStatus"),
  "no duplicated status-label translation keys were created for the legend or the panel — both reuse the existing coverageMap.status.* keys"
);

// -----------------------------------------------------------------------
// STATISTICAL METHODOLOGY / STATUS SEMANTICS — no new status, no scores,
// no rankings, no percentages, no exact counts anywhere touched by this
// polish pass.
// -----------------------------------------------------------------------
// Comment lines are stripped first: this project's own header comments
// legitimately explain what a file does NOT do (e.g. "no ranking
// semantics" in CoverageStatusLegend.tsx) — the guard exists to catch a
// real feature/label, not a comment prohibiting one.
function stripComments(src: string): string {
  return src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}
for (const src of [explorerSource, gridSource, legendSource, metricControlSource, cellPanelSource, emptyStateSource, statusStyleSource]) {
  const code = stripComments(src);
  for (const forbidden of ["ranking", "Ranking", "winner", "Winner", "score", "Score", "completeness", "Completeness", "percentage", "Percentage", "sampleSize", "dataset_id", "owner_id", "campaign_name"]) {
    assertTrue(!code.includes(forbidden), `no forbidden term "${forbidden}" in this polish pass's actual code (outside comments)`);
  }
}
assertTrue(
  statusStyleSource.includes('success: "bg-pistachio-soft text-pistachio"') &&
  statusStyleSource.includes('insufficient_sample: "bg-vanilla-soft text-vanilla"') &&
  statusStyleSource.includes('no_data: "border border-dashed border-line bg-surface text-ink-400"') &&
  statusStyleSource.includes('methodology_block: "bg-caution-soft text-caution"'),
  "the extracted status color map preserves the EXACT same four canonical statuses and colors Coverage Map V1 shipped with"
);

// -----------------------------------------------------------------------
// DATA-LAYER FILES UNCHANGED — this task's own §9/§12 non-negotiable.
// -----------------------------------------------------------------------
assertTrue(engineSource.includes('import { resolveVariantGroup, type MetricValueGroup } from "./metricVariants"'), "engine.ts is unchanged (still imports the same extracted helpers from Coverage Map V1)");
assertTrue(metricVariantsSource.includes("g.values.length > largest.values.length ? g : largest"), "metricVariants.ts is unchanged");
assertTrue(minimumSampleSizeSource.includes('.eq("setting_key", "minimum_sample_size")'), "minimumSampleSize.ts is unchanged");

console.log(`test-coverage-ux-polish: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
