// PHASE 34 — BENCHMARK METRIC COVERAGE AUDIT & EXPANSION.
//
// Mixed convention, deliberately: most scripts/test-*.mts files here are
// readFileSync-based structural source checks (no jsdom/React Testing
// Library configured), but this phase's core claim ("these formulas
// really work end-to-end for real inputs") is best proven by actually
// IMPORTING and RUNNING the plain, framework-free modules involved
// (lib/metrics/derive.ts, lib/comparison/classify.ts,
// lib/benchmark/singleMetricOptions.ts — none of them "use client" or
// "server-only", so tsx can execute them directly, same pattern
// scripts/test-postmvp-import.mts already uses for lib/import/*).
// Everything that touches a Server/Client Component (BenchmarkExplorer,
// CampaignExplorer, ContributionDetail, page.tsx) or SQL (seed.sql,
// migrations) stays a structural text check, same as every other phase.

import { readFileSync, readdirSync } from "node:fs";
import { calculateDerivedMetrics, type RawMetricInputs } from "../lib/metrics/derive";
import { classifyPerformance, formatMetricValue, computePercentDiff } from "../lib/comparison/classify";
import { SINGLE_METRIC_OPTIONS } from "../lib/benchmark/singleMetricOptions";
import { DERIVED_METRIC_LABELS } from "../lib/contribute/coverage";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const singleMetricOptionsSource = readFileSync(new URL("../lib/benchmark/singleMetricOptions.ts", import.meta.url), "utf8");
const engineSource = readFileSync(new URL("../lib/benchmark/engine.ts", import.meta.url), "utf8");
const statsSource = readFileSync(new URL("../lib/benchmark/stats.ts", import.meta.url), "utf8");
const cohortRulesSource = readFileSync(new URL("../lib/benchmark/cohortRules.ts", import.meta.url), "utf8");
const spendBandsSource = readFileSync(new URL("../lib/benchmark/spendBands.ts", import.meta.url), "utf8");
const classifySource = readFileSync(new URL("../lib/comparison/classify.ts", import.meta.url), "utf8");
const deriveSource = readFileSync(new URL("../lib/metrics/derive.ts", import.meta.url), "utf8");
const mappingSource = readFileSync(new URL("../lib/import/mapping.ts", import.meta.url), "utf8");
const seedSource = readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8");
const savedComparisonsMigration = readFileSync(new URL("../supabase/migrations/0011_saved_comparisons.sql", import.meta.url), "utf8");
const benchmarkExplorerSource = readFileSync(new URL("../app/benchmark/BenchmarkExplorer.tsx", import.meta.url), "utf8");
const campaignExplorerSource = readFileSync(new URL("../app/benchmark/CampaignExplorer.tsx", import.meta.url), "utf8");
const contributionPageSource = readFileSync(new URL("../app/account/contributions/[id]/page.tsx", import.meta.url), "utf8");
const contributionDetailSource = readFileSync(new URL("../app/account/contributions/[id]/ContributionDetail.tsx", import.meta.url), "utf8");
const coverageSource = readFileSync(new URL("../lib/contribute/coverage.ts", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../app/benchmark/actions.ts", import.meta.url), "utf8");

// -----------------------------------------------------------------------
// §1 AUDIT RESULT — the one real source of truth's final, approved set.
// Exactly cpm/ctr/cpc/reach/frequency/cpv (Phase 32's original six) plus
// cpa/roas/cpe/acos/tacos (Phase 34's five approved additions). cpl is
// NOT present — the one candidate this phase's audit deferred.
// -----------------------------------------------------------------------
const EXPECTED_OPTIONS = ["cpm", "ctr", "cpc", "reach", "frequency", "cpv", "cpa", "roas", "cpe", "acos", "tacos"];
assertTrue(
  JSON.stringify(SINGLE_METRIC_OPTIONS) === JSON.stringify(EXPECTED_OPTIONS),
  "SINGLE_METRIC_OPTIONS is exactly the original 6 plus the 5 Phase 34 approved additions, in that order"
);
assertTrue(!(SINGLE_METRIC_OPTIONS as readonly string[]).includes("cpl"), "cpl is NOT in the approved/enabled metric list");

// -----------------------------------------------------------------------
// §2 FORMULAS — reused, not reinvented. Real execution against
// calculateDerivedMetrics (unchanged file — this phase adds zero lines
// to lib/metrics/derive.ts).
// -----------------------------------------------------------------------
const fullRaw: RawMetricInputs = {
  ad_spend: 1000,
  impressions: 200000,
  reach: 80000,
  clicks: 4000,
  video_views: 30000,
  engagements: 500,
  conversions: 80,
  attributed_revenue: 3200,
  total_revenue: 12000,
};
const fullDerived = calculateDerivedMetrics(fullRaw);

assertTrue(fullDerived.cpa === 1000 / 80, "CPA = ad_spend / conversions (unchanged formula)");
assertTrue(fullDerived.cpl === 1000 / 80, "CPL formula still computed internally (same as CPA) — it's excluded at the eligibility layer, not deleted from derive.ts");
assertTrue(fullDerived.roas === 3200 / 1000, "ROAS = attributed_revenue / ad_spend (unchanged formula)");
assertTrue(fullDerived.cpe === 1000 / 500, "CPE = ad_spend / engagements (unchanged formula)");
assertTrue(Math.abs(fullDerived.acos! - (1000 / 3200) * 100) < 1e-9, "ACOS = ad_spend / attributed_revenue * 100 (unchanged formula)");
assertTrue(Math.abs(fullDerived.tacos! - (1000 / 12000) * 100) < 1e-9, "TACOS = ad_spend / total_revenue * 100 (unchanged formula)");

// §12 special rule: ACOS must react only to attributed_revenue, TACOS
// only to total_revenue — never mixed or cross-substituted.
const onlyAttributed = calculateDerivedMetrics({ ad_spend: 1000, attributed_revenue: 3200 });
const onlyTotal = calculateDerivedMetrics({ ad_spend: 1000, total_revenue: 12000 });
assertTrue(onlyAttributed.acos !== undefined && onlyAttributed.tacos === undefined, "with only attributed_revenue present, ACOS computes and TACOS does not (TACOS never inferred from attributed_revenue)");
assertTrue(onlyTotal.tacos !== undefined && onlyTotal.acos === undefined, "with only total_revenue present, TACOS computes and ACOS does not (ACOS never inferred from total_revenue)");

assertTrue(
  deriveSource.includes("const acos = safeDivide(raw.ad_spend, raw.attributed_revenue);") &&
  deriveSource.includes("const tacos = safeDivide(raw.ad_spend, raw.total_revenue);"),
  "source confirms ACOS's denominator is attributed_revenue and TACOS's is total_revenue — never swapped"
);

// -----------------------------------------------------------------------
// §11 CPL SPECIAL RULE — no canonical lead semantic exists; "leads" is
// mapped into the SAME generic conversions field as purchases/sales.
// -----------------------------------------------------------------------
assertTrue(
  mappingSource.includes('conversions: ["conversions", "conversiones", "purchases", "leads", "compras", "clientes potenciales", "ventas"]'),
  'real import mapping still buckets "leads"/"clientes potenciales" into the SAME generic conversions field as purchases/sales — the actual blocker for CPL'
);
assertTrue(
  !/lead_count|leads_count|canonical.?lead/i.test(deriveSource) && !/lead_count|leads_count/i.test(mappingSource),
  "no canonical lead_count/leads_count raw field exists anywhere in derive.ts or mapping.ts — nothing was invented to unblock CPL"
);

// -----------------------------------------------------------------------
// §13 ZERO / NULL SAFETY — reused safeDivide helper, never NaN/Infinity.
// -----------------------------------------------------------------------
const missingInputs = calculateDerivedMetrics({});
assertTrue(
  missingInputs.cpa === undefined && missingInputs.roas === undefined && missingInputs.cpe === undefined &&
  missingInputs.acos === undefined && missingInputs.tacos === undefined,
  "with no raw inputs at all, every new metric is simply omitted (undefined) — never NaN or a fabricated 0"
);
const zeroDenominators = calculateDerivedMetrics({ ad_spend: 0, conversions: 0, attributed_revenue: 0, total_revenue: 0, engagements: 0 });
for (const [key, value] of Object.entries(zeroDenominators)) {
  assertTrue(Number.isFinite(value as number) || value === undefined, `${key} is never Infinity/NaN when a denominator is 0 (safeDivide's <= 0 guard)`);
}
assertTrue(zeroDenominators.cpa === undefined && zeroDenominators.roas === undefined, "a zero ad_spend/conversions/attributed_revenue denominator omits CPA/ROAS rather than dividing by zero");

// -----------------------------------------------------------------------
// §6 UNITS / FORMATTING and §7 BENCHMARK DIRECTION — real execution
// against the actual, unmodified classify.ts (never a per-metric switch
// added here or anywhere else).
// -----------------------------------------------------------------------
assertTrue(formatMetricValue(12.5, "currency") === "12.50", "CPA/CPE formatted as currency, 2 decimals (existing generic formatter)");
assertTrue(formatMetricValue(3.2, "multiplier") === "3.20x", "ROAS formatted as a multiplier (\"x\"), never a percentage (existing generic formatter)");
assertTrue(formatMetricValue(22, "percentage") === "22.00%", "ACOS/TACOS formatted as a percentage (existing generic formatter)");
assertTrue(
  !/formatMetricValue[\s\S]{0,40}["'](cpa|roas|cpe|acos|tacos)["']/.test(classifySource),
  "formatMetricValue has no per-metric special case for the new metrics — unit_type alone still drives formatting"
);

const stats = { p25: 8, median: 12, p75: 18 };
assertTrue(classifyPerformance(6, stats, "lower_is_better") === "muy_competitivo", "CPA/CPE/ACOS/TACOS (lower_is_better) below P25 classifies as muy_competitivo — the existing, unmodified rule");
assertTrue(classifyPerformance(25, stats, "lower_is_better") === "requiere_atencion", "CPA/CPE/ACOS/TACOS (lower_is_better) above P75 classifies as requiere_atencion");
assertTrue(classifyPerformance(20, stats, "higher_is_better") === "muy_competitivo", "ROAS (higher_is_better) above P75 classifies as muy_competitivo — same unmodified rule already used for CTR");
assertTrue(classifyPerformance(2, stats, "higher_is_better") === "requiere_atencion", "ROAS (higher_is_better) below P25 classifies as requiere_atencion");
assertTrue(computePercentDiff(10, 0) === null, "computePercentDiff still guards median === 0 (relevant for a CPA/CPE cohort where it could in principle be 0) — never Infinity/NaN");

assertTrue(
  !/classifyPerformance[\s\S]{0,80}["'](cpa|roas|cpe|acos|tacos)["']/.test(classifySource) &&
  !/getInsightKey[\s\S]{0,80}["'](cpa|roas|cpe|acos|tacos)["']/.test(classifySource),
  "classifyPerformance/getInsightKey have no per-metric special case for the new metrics — direction alone still drives classification"
);

// -----------------------------------------------------------------------
// §5 BENCHMARK ENGINE — fully generic already; no allowlist to extend,
// and Reach's own pre-existing methodology guard is untouched (still
// exactly the one metric === "reach" special case, never broadened to
// any of the new metrics).
// -----------------------------------------------------------------------
assertTrue(
  (engineSource.match(/metricKey === "reach"/g) ?? []).length === 1,
  "engine.ts still has exactly one Reach-specific methodology guard — never duplicated or extended to cpa/roas/cpe/acos/tacos"
);
assertTrue(
  !/["'](cpa|roas|cpe|acos|tacos)["']\s*===\s*metricKey|metricKey\s*===\s*["'](cpa|roas|cpe|acos|tacos)["']/.test(engineSource),
  "engine.ts has zero special-case branches for any of the 5 newly-enabled metrics — getMetricBenchmark stays fully generic"
);
assertTrue(
  engineSource.includes("export async function getMetricBenchmark(query: BenchmarkQuery, metricKey: string): Promise<BenchmarkResult>"),
  "getMetricBenchmark's signature is untouched — still accepts any metric key string generically"
);

// -----------------------------------------------------------------------
// Methodology files genuinely untouched (median/P25/P75/outliers/
// cohort relaxation/minimum sample size/spend-duration classification —
// none of Phase 34's changes may touch any of these).
// -----------------------------------------------------------------------
assertTrue(
  statsSource.includes("export function median(values: number[]): number {") &&
  statsSource.includes("export function percentile(values: number[], p: number): number {") &&
  statsSource.includes("const lowerBound = q1 - 1.5 * iqr;") &&
  statsSource.includes("const upperBound = q3 + 1.5 * iqr;"),
  "lib/benchmark/stats.ts's median/percentile/outlier math is untouched"
);
assertTrue(
  cohortRulesSource.includes("export const DEFAULT_MINIMUM_SAMPLE_SIZE = 10;") &&
  cohortRulesSource.includes("export const RELAXATION_ORDER: RelaxableDimension[] = ["),
  "lib/benchmark/cohortRules.ts's minimum sample size and relaxation order are untouched"
);
assertTrue(
  spendBandsSource.includes("export function classifySpendBand(normalizedSpend: number, currency: string): SpendBand | null {") &&
  spendBandsSource.includes("export function classifyDurationBand(durationDays: number): DurationBand {"),
  "lib/benchmark/spendBands.ts's spend/duration band classification signatures are untouched"
);
assertTrue(
  engineSource.includes('if (metricKey === "reach" && (!query.spendBand || !query.durationBand || reachScaleContextRelaxed)) {'),
  "Reach's spend/duration-band hard requirement is untouched, word for word"
);

// -----------------------------------------------------------------------
// §4 METRIC REGISTRY — one real source of truth, no duplicated arrays.
// CampaignExplorer's previously-separate, drifted CAMPAIGN_METRICS array
// is now unified onto SINGLE_METRIC_OPTIONS.
// -----------------------------------------------------------------------
assertTrue(
  campaignExplorerSource.includes('import { SINGLE_METRIC_OPTIONS } from "@/lib/benchmark/singleMetricOptions";') &&
  campaignExplorerSource.includes("const CAMPAIGN_METRICS: readonly string[] = SINGLE_METRIC_OPTIONS;"),
  "CampaignExplorer's metric list now reads from the same shared SINGLE_METRIC_OPTIONS — no second, independently-maintained array"
);
assertTrue(
  !/const CAMPAIGN_METRICS = \[/.test(campaignExplorerSource),
  "the old, separately-maintained CAMPAIGN_METRICS literal array is gone"
);
assertTrue(
  benchmarkExplorerSource.includes("const PRIMARY_METRICS: readonly string[] = SINGLE_METRIC_OPTIONS;"),
  "BenchmarkExplorer's single-metric dropdown still reads from the same one shared list"
);

// -----------------------------------------------------------------------
// §9 /BENCHMARK UI — selector extended via the shared list only; no new
// charts, no new dashboard cards (Phase 33's result experience is
// otherwise untouched by this phase).
// -----------------------------------------------------------------------
const metricExamplesBlockMatch = benchmarkExplorerSource.match(/const METRIC_EXAMPLES: Record<string, string> = \{[\s\S]*?\};/);
assertTrue(!!metricExamplesBlockMatch, "METRIC_EXAMPLES block still exists");
const metricExamplesBlock = metricExamplesBlockMatch ? metricExamplesBlockMatch[0] : "";
for (const key of ["cpe", "acos", "tacos"]) {
  assertTrue(new RegExp(`\\b${key}:\\s*"[\\d.]+"`).test(metricExamplesBlock), `METRIC_EXAMPLES has a real placeholder example for the newly-enabled ${key}`);
}
assertTrue(
  !/recharts|BarChart|LineChart|PieChart|<canvas/.test(benchmarkExplorerSource),
  "no chart library/primitive introduced anywhere in BenchmarkExplorer.tsx by this phase — the existing static P25/Median/P75 numbers and range-bar track (Phase 33) remain the only visualization"
);

// -----------------------------------------------------------------------
// §8 CAMPAIGN -> BENCHMARK — eligibility.
//
// CUCURUCHO INTELLIGENCE 2 UPDATE: the three assertions below originally
// checked (1) a combined SINGLE_METRIC_OPTIONS + entry.sufficientData
// gate, (2) a `derivedKeys.map(async metric => getMetricBenchmark(...))`
// per-metric readiness loop, and (3) an exact `compareOptions.push({
// metric: entry.metric, ... })` literal. All three are stale for the
// same, single, explicitly-instructed reason: Intelligence 2's own §10
// replaced that per-metric loop (which re-ran the full eligible-dataset
// join query once per metric, even though every one of those queries
// shared the identical cohort) with ONE shared-cohort batch call
// (getBenchmarksForMetrics), and §11 removed the sufficientData-only
// filter so every metric's real status reaches the UI. There is no more
// `entry` variable, no more per-metric getMetricBenchmark loop for the
// derived metrics, and no more sufficientData gate — by design, verified
// already in scripts/test-phase32-campaign-benchmark-activation.mts's
// own §4/§5 assertions and in lib/benchmark/engine.ts's own comment on
// getBenchmarksForMetrics. The SINGLE_METRIC_OPTIONS gate itself (the
// real, still-enforced half of the old combined check) is verified
// there too. These three are replaced with real invariants that the NEW
// mechanism is what's actually in place, and that Reach — the one
// metric excluded from the shared batch, per getBenchmarksForMetrics's
// own refusal — still gets its own dedicated getMetricBenchmark call.
// -----------------------------------------------------------------------
assertTrue(
  contributionPageSource.includes("getBenchmarksForMetrics(query, candidateMetrics)"),
  "compareOptions for every derived, /benchmark-acceptable metric now comes from ONE shared-cohort batch call, not a per-metric loop (§10 query optimization)"
);
assertTrue(
  contributionPageSource.includes('await getMetricBenchmark(reachQuery, "reach")'),
  "Reach still gets its own dedicated getMetricBenchmark call (its query depends on spendBand/durationBand, which the shared batch deliberately never applies to it)"
);
assertTrue(
  !contributionPageSource.includes("derivedKeys.map(async (metric) => {"),
  "the old per-derived-metric getMetricBenchmark loop is gone, replaced by the shared-cohort batch — not a parallel/duplicated mechanism left behind"
);
assertTrue(
  contributionDetailSource.includes('params.set("prefillMetric", option.metric);') && contributionDetailSource.includes('params.set("prefillUserValue", String(option.userValue));'),
  "buildBenchmarkHref forwards prefillMetric + prefillUserValue for ANY compare option generically — the new metrics need no dedicated branch"
);
assertTrue(
  contributionDetailSource.includes('dataset.validationStatus === "pending" || dataset.validationStatus === "excluded"') &&
  contributionDetailSource.includes('t("contributions.pendingBenchmarkExplanation")'),
  "pending/excluded behavior is untouched by this phase"
);

// -----------------------------------------------------------------------
// §10 SAVED COMPARISONS — plain, unconstrained text column; no allowlist
// to extend, no migration needed.
// -----------------------------------------------------------------------
assertTrue(
  savedComparisonsMigration.includes("metric text,") && !/check\s*\(\s*metric\s+in/i.test(savedComparisonsMigration),
  "saved_comparisons.metric is a plain, unconstrained text column — no CHECK allowlist exists to extend, and none was added"
);

// -----------------------------------------------------------------------
// §4/§12 DB-level definitions — unit_type/benchmark_direction for the 5
// newly-enabled metrics were already seeded (not added by this phase);
// this just confirms the pre-existing, approved definitions this phase
// relies on actually match what §6/§7 above assume.
// -----------------------------------------------------------------------
assertTrue(seedSource.includes("('cpa', 'CPA', 'derived', 'currency', 'lower_is_better', 'ad_spend / conversions', true),"), "metrics table: CPA is currency + lower_is_better (pre-existing seed row)");
assertTrue(seedSource.includes("('cpe', 'CPE', 'derived', 'currency', 'lower_is_better', 'ad_spend / engagements', true),"), "metrics table: CPE is currency + lower_is_better (pre-existing seed row)");
assertTrue(seedSource.includes("('roas', 'ROAS', 'derived', 'multiplier', 'higher_is_better', 'attributed_revenue / ad_spend', true),"), "metrics table: ROAS is multiplier + higher_is_better (pre-existing seed row)");
assertTrue(seedSource.includes("('acos', 'ACOS', 'derived', 'percentage', 'lower_is_better', 'ad_spend / attributed_revenue * 100', true),"), "metrics table: ACOS is percentage + lower_is_better, denominator attributed_revenue (pre-existing seed row)");
assertTrue(seedSource.includes("('tacos', 'TACOS', 'derived', 'percentage', 'lower_is_better', 'ad_spend / total_revenue * 100', true)"), "metrics table: TACOS is percentage + lower_is_better, denominator total_revenue (pre-existing seed row)");

// -----------------------------------------------------------------------
// §3 DATA AVAILABILITY — the raw inputs the 5 new metrics need are real,
// documented, mapped fields from actual platform exports, not invented.
// -----------------------------------------------------------------------
assertTrue(
  mappingSource.includes('attributed_revenue: ["attributed revenue", "ingresos atribuidos", "revenue", "purchase conversion value", "website purchases conversion value", "valor de conversión", "valor de conversion", "valor de conv."]'),
  "attributed_revenue (ROAS/ACOS's real input) is mapped from real Meta/Google Ads export column names"
);
assertTrue(
  mappingSource.includes('total_revenue: ["total revenue", "ingresos totales", "ingresos", "facturación", "facturacion"]'),
  "total_revenue (TACOS's real input, kept distinct from attributed_revenue) is mapped from real export/marketplace column names"
);
assertTrue(
  mappingSource.includes("engagements: [\"engagements\", \"interacciones\"]"),
  "engagements (CPE's real input) is a real mapped field"
);

// -----------------------------------------------------------------------
// Cross-check with the OTHER existing consumer of these same raw-field
// gaps (lib/contribute/coverage.ts's "what would unlock this metric"
// messaging, shown on the Contribute side, not /benchmark) — confirms
// that file already separates attributed_revenue (roas+acos) from
// total_revenue (tacos only) too, corroborating §12 independently of
// derive.ts's own real-execution check above.
// -----------------------------------------------------------------------
assertTrue(
  coverageSource.includes('{ field: "attributed_revenue", unlocks: ["roas", "acos"] },') &&
  coverageSource.includes('{ field: "total_revenue", unlocks: ["tacos"] },'),
  "lib/contribute/coverage.ts's GAP_DEFINITIONS independently confirms attributed_revenue unlocks roas/acos and total_revenue unlocks tacos only — never mixed"
);

// -----------------------------------------------------------------------
// app/benchmark/actions.ts (the server bridge to the engine) passes the
// metric key straight through with no allowlist of its own — confirmed
// so a future SINGLE_METRIC_OPTIONS change never needs a second edit
// here.
// -----------------------------------------------------------------------
assertTrue(
  actionsSource.includes("result = await getMetricBenchmark(query, input.metric);") &&
  !/input\.metric\s*===\s*["'](cpm|ctr|cpc|reach|frequency|cpv|cpa|roas|cpe|acos|tacos)["']/.test(actionsSource.replace(/input\.metric === "reach"/g, "")),
  "runBenchmarkQuery forwards input.metric to the engine generically — no metric allowlist duplicated in the server action layer"
);

// -----------------------------------------------------------------------
// §15 NO BACKEND CHANGE — no new migration file for this phase. The
// latest migration on disk must still be 0019 (the last one that
// existed before Phase 34 started) — a real, sequence-based check
// rather than trusting a comment.
// -----------------------------------------------------------------------
const migrationFiles = readdirSync(new URL("../supabase/migrations/", import.meta.url));
const latestMigration = migrationFiles.filter((f) => /^\d{4}_/.test(f)).sort().at(-1);
assertTrue(latestMigration === "0019_contribution_validation.sql", `no new migration file was added by this phase — latest is still 0019_contribution_validation.sql (found: ${latestMigration})`);

// -----------------------------------------------------------------------
// §16 no mock data anywhere in the touched files.
// -----------------------------------------------------------------------
for (const [label, source] of [
  ["singleMetricOptions.ts", singleMetricOptionsSource],
  ["BenchmarkExplorer.tsx (new lines)", benchmarkExplorerSource],
  ["CampaignExplorer.tsx", campaignExplorerSource],
  ["contributions/[id]/page.tsx", contributionPageSource],
] as const) {
  assertTrue(!/from ["']@\/lib\/mock\//.test(source), `${label} imports no lib/mock/* module`);
}

// -----------------------------------------------------------------------
// No winner/ranking/score language introduced by this phase's own new
// comments/labels.
// -----------------------------------------------------------------------
assertTrue(
  !/ranking|winner|ganador|mejor anunciante|score de/i.test(singleMetricOptionsSource + campaignExplorerSource.slice(0, 1200)),
  "no winner/ranking/score language introduced by this phase's changes"
);

// -----------------------------------------------------------------------
// Coverage/labels: DERIVED_METRIC_LABELS (the pre-existing, shared label
// source used by ContributionDetail's compare-CTA chips) already covers
// every one of the 5 newly-enabled metrics — confirmed by real
// execution, not just source text.
// -----------------------------------------------------------------------
for (const key of ["cpa", "roas", "cpe", "acos", "tacos"] as const) {
  assertTrue(typeof DERIVED_METRIC_LABELS[key] === "string" && DERIVED_METRIC_LABELS[key].length > 0, `DERIVED_METRIC_LABELS already has a real label for ${key} — no new label source needed`);
}

console.log(`test-phase34-benchmark-metric-coverage: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
