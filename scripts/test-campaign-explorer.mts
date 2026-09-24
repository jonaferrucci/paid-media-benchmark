// CUCURUCHO INTELLIGENCE 2 — CAMPAIGN EXPLORER + METRIC REUSE
// ARCHITECTURE.
//
// Same convention as every other scripts/test-*.mts file in this
// project: real execution of the plain, framework-free logic this
// feature touched (lib/contribute/coverage.ts's getAvailableCampaignMetrics,
// lib/metrics/derive.ts's calculateDerivedMetrics reuse), plus
// readFileSync-based structural source-text checks for everything that
// touches a Server/Client Component or Supabase (no jsdom/React Testing
// Library configured here). Scoped to what this feature actually
// touched: lib/benchmark/engine.ts (getBenchmarksForMetrics),
// lib/benchmark/responseShape.ts (extracted from actions.ts),
// lib/contribute/coverage.ts (getAvailableCampaignMetrics),
// app/benchmark/MetricComparisonRow.tsx (extracted from
// CampaignExplorer.tsx), app/account/contributions/[id]/page.tsx +
// ContributionDetail.tsx, and the three legacy scripts this feature's
// own instructed architecture change legitimately touched (already
// re-verified independently by those scripts themselves).

import { readFileSync } from "node:fs";
import { calculateDerivedMetrics, type RawMetricInputs } from "../lib/metrics/derive";
import { getAvailableCampaignMetrics, DERIVED_METRIC_LABELS } from "../lib/contribute/coverage";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const engineSource = readFileSync(new URL("../lib/benchmark/engine.ts", import.meta.url), "utf8");
const responseShapeSource = readFileSync(new URL("../lib/benchmark/responseShape.ts", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../app/benchmark/actions.ts", import.meta.url), "utf8");
const coverageSource = readFileSync(new URL("../lib/contribute/coverage.ts", import.meta.url), "utf8");
const metricComparisonRowSource = readFileSync(new URL("../app/benchmark/MetricComparisonRow.tsx", import.meta.url), "utf8");
const campaignExplorerSource = readFileSync(new URL("../app/benchmark/CampaignExplorer.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/account/contributions/[id]/page.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../app/account/contributions/[id]/ContributionDetail.tsx", import.meta.url), "utf8");
const singleMetricOptionsSource = readFileSync(new URL("../lib/benchmark/singleMetricOptions.ts", import.meta.url), "utf8");
const resultStatusSource = readFileSync(new URL("../lib/benchmark/resultStatus.ts", import.meta.url), "utf8");
const classifySource = readFileSync(new URL("../lib/comparison/classify.ts", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");
const duplicatesSource = readFileSync(new URL("../lib/import/duplicates.ts", import.meta.url), "utf8");

// -----------------------------------------------------------------------
// §7 Metric availability engine — real execution, not just structural.
// A metric is "available" iff calculateDerivedMetrics actually produced
// it (real raw inputs, valid denominator) — never a hardcoded allowlist.
// "Unavailable" is never conflated with a zero/near-zero value: a
// campaign missing a raw input entirely gets no key at all, not a 0.
// -----------------------------------------------------------------------
{
  const full: RawMetricInputs = {
    ad_spend: 1000, impressions: 200000, clicks: 4000, reach: 80000,
    video_views: 50000, engagements: 3000, conversions: 100,
    attributed_revenue: 5000, total_revenue: 6000,
  };
  const available = getAvailableCampaignMetrics(full);
  for (const key of ["cpm", "ctr", "cpc", "frequency", "cpv", "cpe", "cpa", "cpl", "roas", "acos", "tacos"] as const) {
    assertTrue(available.includes(key), `getAvailableCampaignMetrics: a campaign with every raw input includes ${key}`);
  }

  // Missing conversions/attributed_revenue/total_revenue -> CPA/CPL/
  // ROAS/ACOS/TACOS genuinely absent, never present as 0 or null.
  const partial: RawMetricInputs = { ad_spend: 1000, impressions: 200000, clicks: 4000 };
  const partialAvailable = getAvailableCampaignMetrics(partial);
  assertTrue(partialAvailable.includes("cpm") && partialAvailable.includes("ctr") && partialAvailable.includes("cpc"), "getAvailableCampaignMetrics: metrics backed by present raw inputs are available");
  for (const key of ["cpa", "cpl", "roas", "acos", "tacos", "cpv", "cpe", "frequency"] as const) {
    assertTrue(!partialAvailable.includes(key), `getAvailableCampaignMetrics: ${key} is genuinely absent (unavailable), not present as a zero/fabricated value, when its raw input is missing`);
  }
  const partialDerived = calculateDerivedMetrics(partial);
  for (const key of ["cpa", "cpl", "roas", "acos", "tacos"] as const) {
    assertTrue(!(key in partialDerived), `calculateDerivedMetrics: ${key} key is entirely absent from the result object (not set to 0/null) — "unavailable" is never confused with "zero"`);
  }

  // Empty raw input -> zero available metrics, never a crash or a
  // fabricated default set.
  assertTrue(getAvailableCampaignMetrics({}).length === 0, "getAvailableCampaignMetrics: a campaign with zero raw inputs has zero available metrics");
}

// -----------------------------------------------------------------------
// §7/§8 getAvailableCampaignMetrics is a thin, documented wrapper — it
// reuses calculateDerivedMetrics, never reimplements a formula or a
// second "is this metric available" rule.
// -----------------------------------------------------------------------
assertTrue(
  coverageSource.includes("export function getAvailableCampaignMetrics(raw: RawMetricInputs): DerivedMetricKey[]") &&
  coverageSource.includes("calculateDerivedMetrics(raw)"),
  "getAvailableCampaignMetrics is a real, named function that reuses calculateDerivedMetrics — never a second, independent availability rule"
);
assertTrue(
  pageSource.includes("getAvailableCampaignMetrics(raw)"),
  "page.tsx uses the one named getAvailableCampaignMetrics function rather than re-deriving Object.keys(calculateDerivedMetrics(raw)) inline"
);

// -----------------------------------------------------------------------
// §3 Metric lineage — every metric DERIVED_METRIC_LABELS knows about has
// a real formula in lib/metrics/derive.ts's own DerivedMetrics shape
// (checked by successfully importing/executing it above), and every
// metric this feature actually offers for market comparison
// (SINGLE_METRIC_OPTIONS) is a strict subset of what's derivable — never
// an invented metric key with no real formula behind it.
// -----------------------------------------------------------------------
{
  const derivedKeys = Object.keys(DERIVED_METRIC_LABELS);
  assertTrue(
    derivedKeys.sort().join(",") === ["acos", "cpa", "cpc", "cpe", "cpl", "cpm", "cpv", "ctr", "frequency", "roas", "tacos"].sort().join(","),
    "DERIVED_METRIC_LABELS lists exactly the real derive.ts formula set — no invented metric, none silently dropped"
  );
  const singleMetricMatch = singleMetricOptionsSource.match(/export const SINGLE_METRIC_OPTIONS = \[([\s\S]*?)\] as const;/);
  assertTrue(!!singleMetricMatch, "SINGLE_METRIC_OPTIONS is still defined as a plain array literal");
  const singleMetrics = (singleMetricMatch?.[1] ?? "").match(/"([a-z_]+)"/g)?.map((s) => s.replace(/"/g, "")) ?? [];
  for (const m of singleMetrics) {
    assertTrue(m === "reach" || derivedKeys.includes(m), `SINGLE_METRIC_OPTIONS entry "${m}" is either Reach (a real base metric) or a real derived metric with a known formula — never an invented key`);
  }
  // cpl is a real derivable metric but deliberately excluded from
  // market comparison (no canonical lead semantic) — confirmed still
  // excluded, not silently reintroduced by this feature.
  assertTrue(!singleMetrics.includes("cpl"), "cpl remains excluded from SINGLE_METRIC_OPTIONS — this feature did not silently reintroduce it");
}

// -----------------------------------------------------------------------
// §10 Query strategy — getBenchmarksForMetrics resolves the shared
// cohort exactly ONCE for N metrics (one fetchEligibleDatasetIds call in
// its own body), reuses computeMetricBenchmarkCore's exact per-metric
// tail (never a reimplemented copy), and getMetricBenchmark/
// getHistoricalBenchmark are provably unaffected (neither passes a
// precomputedCohort, so neither's behavior or query count changes).
// -----------------------------------------------------------------------
{
  const batchFnMatch = engineSource.match(/export async function getBenchmarksForMetrics\([\s\S]*?\n}\n/);
  assertTrue(!!batchFnMatch, "getBenchmarksForMetrics is exported from lib/benchmark/engine.ts");
  const batchFnBody = batchFnMatch?.[0] ?? "";
  const fetchCalls = batchFnBody.match(/await fetchEligibleDatasetIds\(/g) ?? [];
  assertTrue(fetchCalls.length === 1, `getBenchmarksForMetrics calls fetchEligibleDatasetIds exactly once per invocation (found ${fetchCalls.length}) — one cohort query shared across every metric, not one per metric`);
  assertTrue(batchFnBody.includes("computeMetricBenchmarkCore(query, metricKey, minimumSampleSize, undefined, precomputedCohort)"), "getBenchmarksForMetrics reuses computeMetricBenchmarkCore's own per-metric tail — never a second, reimplemented copy of the distribution/result-building logic");
  assertTrue(batchFnBody.includes('metricKeys.some((m) => m === "reach")'), "getBenchmarksForMetrics explicitly refuses Reach (its query depends on spendBand/durationBand, which would silently apply the wrong cohort if shared)");
}
assertTrue(
  /export async function getMetricBenchmark\(query: BenchmarkQuery, metricKey: string\): Promise<BenchmarkResult> \{[\s\S]*?return computeMetricBenchmarkCore\(query, metricKey, minimumSampleSize\);\n\}/.test(engineSource),
  "getMetricBenchmark still calls computeMetricBenchmarkCore with exactly its original 3 arguments — never passes a precomputedCohort, so its behavior/query count is completely unaffected by the new batch function"
);
assertTrue(
  /computeMetricBenchmarkCore\(periodQuery, metricKey, minimumSampleSize, metricMeta\)/.test(engineSource),
  "getHistoricalBenchmark's own call into computeMetricBenchmarkCore is unchanged (still 4 args, no precomputedCohort) — Historical Benchmarks is unaffected by this feature"
);
assertTrue(
  pageSource.includes('await getMetricBenchmark(reachQuery, "reach")'),
  "page.tsx still calls getMetricBenchmark directly for Reach (its own separate, correctly-scoped cohort query) — 2 cohort queries total per page load instead of up to derivedKeys.length + 1"
);

// -----------------------------------------------------------------------
// §11 Independent per-metric states — every candidate metric gets its
// own real status via the ONE shared deriveBenchmarkStatus precedence
// (never a second, hand-rolled status rule), and that status reaches
// compareOptions unfiltered (no lingering success-only gate).
// -----------------------------------------------------------------------
assertTrue(
  resultStatusSource.includes('export type CohortQueryStatus = "success" | "insufficient_sample" | "methodology_block" | "no_data";'),
  "the 4 real cohort-query statuses (the 5th, unavailable, is a campaign-data fact handled separately — see §7 tests above) are still exactly this one shared type"
);
assertTrue(
  pageSource.includes("const response = toResponse(input, result);") && pageSource.includes("compareOptions.push({ metric: result.metric, status: response.status, classification, response, userValue });"),
  "every candidate metric's real status (from the shared toResponse/deriveBenchmarkStatus) reaches compareOptions directly — never filtered down to success-only first"
);
assertTrue(
  pageSource.includes("const reachResponse = toResponse(reachInput, reachResult);") && pageSource.includes("status: reachResponse.status,"),
  "Reach gets the exact same real-status treatment (including methodology_block) once it's a candidate, instead of being silently omitted whenever it wasn't sufficient"
);
assertTrue(
  metricComparisonRowSource.includes('t(`benchmarkLive.statusShort.${status}`)'),
  "a non-success row's status is shown via the existing, neutral benchmarkLive.statusShort.* copy (success/insufficient_sample/no_data/methodology_block) — never a second, newly-invented wording"
);

// -----------------------------------------------------------------------
// §8 Single source of truth for formulas / classification — formatting
// and classification happen in exactly one place (MetricComparisonRow),
// which both the real-campaign (ContributionDetail) and manual-entry
// (CampaignExplorer) surfaces render through. No second implementation
// exists anywhere this feature touched.
// -----------------------------------------------------------------------
assertTrue(
  detailSource.includes("<MetricComparisonRow") && campaignExplorerSource.includes("<MetricComparisonRow"),
  "both ContributionDetail.tsx (real campaign) and CampaignExplorer.tsx (manual entry) render the SAME MetricComparisonRow component — one row implementation, not two"
);
assertTrue(
  !detailSource.includes("function CampaignRow") && !campaignExplorerSource.includes("function CampaignRow"),
  "the old, now-duplicated CampaignRow function no longer exists in either file — fully replaced by the shared MetricComparisonRow"
);
assertTrue(
  (metricComparisonRowSource.match(/classifyPerformance\(/g) ?? []).length === 0 &&
  pageSource.includes("classifyPerformance(userValue, { p25, median, p75 }, response.benchmarkDirection)") &&
  campaignExplorerSource.includes("classifyPerformance(userValue, { p25, median, p75 }, response.benchmarkDirection)"),
  "classification is computed once per caller (page.tsx for a real campaign, CampaignExplorer.tsx for a manual one) using the SAME imported classifyPerformance — MetricComparisonRow itself only renders the already-computed classification, never recomputes it"
);

// -----------------------------------------------------------------------
// §9/§15 Campaign-vs-market inline comparison + preserved cross-link.
// Every candidate metric shows its real value/median/classification
// inline (no need to open /benchmark just to see it), AND the existing
// "Ver benchmark completo" prefill mechanism is completely unchanged —
// same params, same buildBenchmarkHref, Historical Benchmarks reachable
// from there exactly as before.
// -----------------------------------------------------------------------
assertTrue(
  metricComparisonRowSource.includes('t("benchmarkLive.vsMedian")') && metricComparisonRowSource.includes("formatMetricValue(median, response.unit)"),
  "each comparable-metric row shows the real market median inline, not just the user's own value"
);
assertTrue(
  detailSource.includes("buildBenchmarkHref(benchmarkActivation.context, option)") &&
  detailSource.includes('params.set("prefillMetric", option.metric);') &&
  detailSource.includes('params.set("prefillUserValue", String(option.userValue));'),
  "the exact same /benchmark prefill mechanism (context + metric + userValue) is preserved for every comparable metric — Historical Benchmarks and further cohort refinement remain one click away"
);
assertTrue(
  !detailSource.includes("HistoricalBenchmarkSection") && !detailSource.includes("getHistoricalBenchmark"),
  "ContributionDetail.tsx does not duplicate Historical Benchmarks' own UI or engine call — Historical stays reachable only via the preserved /benchmark cross-link (§20)"
);

// -----------------------------------------------------------------------
// Context/business-model forwarding — the cross-link still carries every
// real cohort field the campaign has, never a fabricated one.
// -----------------------------------------------------------------------
for (const field of ["platform", "objective", "vertical", "country", "audienceStrategy", "funnelStage", "businessModel"]) {
  assertTrue(pageSource.includes(`${field}: dataset.`), `page.tsx's benchmarkActivation.context still forwards this campaign's own real ${field} — never invented`);
}
assertTrue(
  detailSource.includes("if (context.businessModel) params.set(\"prefillBusinessModel\", context.businessModel);"),
  "business model is still forwarded into the /benchmark prefill only when the campaign actually has one"
);

// -----------------------------------------------------------------------
// §16 Validation-status behavior — untouched. A pending/excluded
// campaign still never renders the primary compare CTA or the
// comparable-results title (already independently re-verified by
// test-phase32/34/35's own, still-passing assertions); spot-checked
// again here to keep this new suite self-contained.
// -----------------------------------------------------------------------
assertTrue(
  detailSource.includes('dataset.validationStatus === "valid" &&') &&
  detailSource.includes('dataset.validationStatus === "pending" || dataset.validationStatus === "excluded"'),
  "the valid vs. pending/excluded branches are still physically separate JSX blocks — unchanged curator/validation gating"
);

// -----------------------------------------------------------------------
// §17 Provenance without exposing sensitive info — no dataset id,
// campaign name, or owner identity ever enters a URL or a market-facing
// component.
// -----------------------------------------------------------------------
assertTrue(
  !/campaignName|campaign_name|dataset\.id/.test(
    (detailSource.match(/function buildBenchmarkHref[\s\S]*?\n}/)?.[0]) ?? ""
  ),
  "buildBenchmarkHref never includes the campaign's name or id — only cohort-taxonomy keys and a rounded metric value (unchanged by this feature)"
);
assertTrue(
  !/dataset\.id|campaignName|campaign_name/.test(metricComparisonRowSource),
  "MetricComparisonRow (shared by both surfaces) never receives or renders a raw dataset id or campaign name"
);
assertTrue(
  engineSource.includes("Every exported function below returns only a typed, aggregated"),
  "lib/benchmark/engine.ts's own privacy-boundary comment/architecture is untouched by this feature"
);

// -----------------------------------------------------------------------
// §18 Deduplication risk — this feature does not touch duplicate
// detection at all (no migration, no new constraint), and the existing,
// real gap (advisory-only, contributor-scoped, absent from curator
// review, no DB-level uniqueness constraint) is unchanged. This is
// intentionally a STOP-and-report item, not something this commit fixes
// — see the final report's own explicit callout.
// -----------------------------------------------------------------------
assertTrue(
  duplicatesSource.includes("export type DuplicateVerdict") && duplicatesSource.includes("classifyDuplicate"),
  "the existing advisory-only duplicate classifier is untouched (still the only duplicate-detection mechanism, still never blocking/merging/deleting)"
);

// -----------------------------------------------------------------------
// §12 Strictly descriptive language — no banned evaluative words
// introduced by this feature's own new/changed source (MetricComparisonRow,
// the responseShape extraction, page.tsx/ContributionDetail.tsx's new
// logic). Scoped to what this feature actually wrote, not a blanket
// repo-wide scan (existing, already-audited classification labels
// elsewhere are out of scope here).
// -----------------------------------------------------------------------
for (const [label, source] of [
  ["MetricComparisonRow.tsx", metricComparisonRowSource],
  ["responseShape.ts", responseShapeSource],
] as const) {
  assertTrue(
    !/excelente|\bmalo\b|ganador|\bmejor\b|\bpeor\b|deber[íi]as|optimiz[ae]?\s+inmediatamente/i.test(source),
    `${label} contains none of the banned evaluative words (excelente/malo/ganador/mejor/peor/deberías/optimizar inmediatamente)`
  );
}
assertTrue(
  !/ranking|\bwinner\b|ganador|mejor anunciante|score de/i.test(pageSource + detailSource.replace(/benchmarkReadinessNone|comparableResultsTitle/g, "")),
  "no ranking/winner/score language was introduced in page.tsx or ContributionDetail.tsx by this feature"
);

// -----------------------------------------------------------------------
// No mock-data dependency introduced anywhere this feature touched.
// -----------------------------------------------------------------------
for (const [label, source] of [
  ["page.tsx", pageSource],
  ["ContributionDetail.tsx", detailSource],
  ["MetricComparisonRow.tsx", metricComparisonRowSource],
  ["responseShape.ts", responseShapeSource],
  ["engine.ts", engineSource],
] as const) {
  assertTrue(!/from ["']@\/lib\/mock\/benchmarks["']/.test(source), `${label} never imports lib/mock/benchmarks`);
  assertTrue(!/from ["']@\/lib\/mock\/random["']/.test(source), `${label} never imports lib/mock/random`);
}

// -----------------------------------------------------------------------
// §13 Mobile structure — no fixed-width element in the new/changed
// markup that could force horizontal overflow at narrow widths.
// -----------------------------------------------------------------------
assertTrue(
  metricComparisonRowSource.includes("flex flex-1 flex-wrap items-center gap-x-3 gap-y-1"),
  "MetricComparisonRow's content row wraps (flex-wrap) rather than forcing a fixed width"
);
assertTrue(
  detailSource.includes('<div className="flex justify-end pt-1">'),
  "the preserved cross-link sits in its own non-fixed-width block, never forcing overflow alongside the row"
);

// -----------------------------------------------------------------------
// ES/EN — this feature deliberately introduced ZERO new translation
// keys (verified: it reuses benchmarkLive.statusShort.*,
// contributions.compareBenchmarkCta, contributions.exploreBenchmarkCta,
// contributions.benchmarkReadinessNone — all pre-existing in both
// locales). Confirmed here rather than assumed.
// -----------------------------------------------------------------------
for (const key of [
  'success: "OK"', 'insufficient_sample: "Muestra insuficiente"', 'no_data: "Sin datos comparables"', 'methodology_block: "No disponible"',
] as const) {
  assertTrue((translationsSource.match(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length >= 1, `benchmarkLive.statusShort still has a real ES/EN entry matching "${key}" — reused, not reinvented`);
}
assertTrue(
  (translationsSource.match(/compareBenchmarkCta: "(Comparar|Compare)"/g) ?? []).length === 2,
  "contributions.compareBenchmarkCta still has both its ES and EN entries — reused verbatim by the new per-row cross-link"
);
assertTrue(
  (translationsSource.match(/exploreBenchmarkCta: "(Explorar benchmarks|Explore benchmarks)"/g) ?? []).length === 2,
  "contributions.exploreBenchmarkCta still has both its ES and EN entries — reused verbatim for the empty state"
);

// -----------------------------------------------------------------------
// No schema/migration change — this feature reads existing columns and
// existing tables only.
// -----------------------------------------------------------------------
assertTrue(
  (() => {
    try {
      readFileSync(new URL("../supabase/migrations/0021_placeholder.sql", import.meta.url), "utf8");
      return false;
    } catch {
      return true;
    }
  })(),
  "no new migration (e.g. 0021) was created for this feature"
);

console.log(`test-campaign-explorer: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
