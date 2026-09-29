// CUCURUCHO INTELLIGENCE 5 — DETERMINISTIC INSIGHTS.
//
// lib/insights/deterministic.ts is a genuinely pure module (no React, no
// Next.js, no Supabase, no "server-only" — unlike lib/benchmark/coverage.ts
// or engine.ts) so, unlike scripts/test-coverage-map.mts, it can be
// imported and exercised directly with real function calls rather than
// readFileSync structural source-text checks. classify.ts/resultStatus.ts
// are imported the same real way to cross-check that this module never
// redefines their boundaries. translations.ts is still checked via
// readFileSync (matching every other test-*.mts in this project), since
// importing it is unnecessary — it has zero logic, only data.

import { readFileSync } from "node:fs";
import {
  classifyPerformance,
  computePercentDiff,
  type BenchmarkDirection,
} from "../lib/comparison/classify";
import type { CohortQueryStatus } from "../lib/benchmark/resultStatus";
import {
  deriveMarketPositionInsight,
  resolveObservationMessageKey,
  deriveDataReadinessInsight,
  deriveHistoricalChangeInsight,
  selectVisibleInsights,
  deriveInsightsForMetric,
  MAX_VISIBLE_INSIGHTS_PER_METRIC,
  type DeterministicInsight,
} from "../lib/insights/deterministic";

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

const deterministicSource = readFileSync(new URL("../lib/insights/deterministic.ts", import.meta.url), "utf8");
const comparisonDetailSource = readFileSync(new URL("../app/benchmark/ComparisonDetail.tsx", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");

const STATS = { p25: 100, median: 150, p75: 200 };

// -----------------------------------------------------------------------
// §1 DIRECTIONAL METRIC CLASSIFICATION — lower_is_better and
// higher_is_better, every quartile boundary. Cross-checked against
// classifyPerformance() directly, never a second threshold definition.
// -----------------------------------------------------------------------
function expectedInsightKey(direction: BenchmarkDirection, userValue: number): string {
  const classification = classifyPerformance(userValue, STATS, direction);
  const prefix = direction === "lower_is_better" ? "lower" : direction === "higher_is_better" ? "higher" : "contextual";
  if (direction === "contextual") {
    if (classification === "por_debajo_del_rango") return "contextual_debajo";
    if (classification === "por_encima_del_rango") return "contextual_encima";
    return "contextual_dentro";
  }
  return `${prefix}_${classification}`;
}

for (const direction of ["lower_is_better", "higher_is_better"] as BenchmarkDirection[]) {
  for (const userValue of [50, 100, 125, 150, 175, 200, 250]) {
    const insight = deriveMarketPositionInsight({ metricKey: "cpm", benchmarkDirection: direction, userValue, ...STATS });
    assertEqual(
      insight.messageKey,
      `benchmarkLive.insight.${expectedInsightKey(direction, userValue)}`,
      `${direction} userValue=${userValue}: messageKey matches classifyPerformance's own classification (no redefined boundary)`
    );
    assertEqual(
      insight.sourceFacts.classification,
      classifyPerformance(userValue, STATS, direction),
      `${direction} userValue=${userValue}: sourceFacts.classification equals classifyPerformance's direct output`
    );
  }
}

// -----------------------------------------------------------------------
// §2 CONTEXTUAL METRIC CLASSIFICATION — Reach/Frequency-style metrics
// never get a PerformanceLabel, only a positional statement.
// -----------------------------------------------------------------------
for (const userValue of [50, 125, 250]) {
  const insight = deriveMarketPositionInsight({ metricKey: "reach", benchmarkDirection: "contextual", userValue, ...STATS });
  assertEqual(insight.messageKey, `benchmarkLive.insight.${expectedInsightKey("contextual", userValue)}`, `contextual userValue=${userValue}: correct positional messageKey`);
  assertTrue(insight.sourceFacts.contextual === true, `contextual userValue=${userValue}: sourceFacts.contextual is true`);
}
assertTrue(
  ["por_debajo_del_rango", "dentro_del_rango", "por_encima_del_rango"].includes(
    String(deriveMarketPositionInsight({ metricKey: "reach", benchmarkDirection: "contextual", userValue: 150, ...STATS }).sourceFacts.classification)
  ),
  "a contextual metric's classification is always a ContextualPosition, never a PerformanceLabel (good/bad tier)"
);

// -----------------------------------------------------------------------
// §3/§4 QUARTILE BOUNDARIES + EQUALITY — exact-boundary values
// (userValue === p25/median/p75) must resolve identically to
// classifyPerformance's own <=/>= semantics, since this module performs
// zero percentile math of its own.
// -----------------------------------------------------------------------
for (const direction of ["lower_is_better", "higher_is_better"] as BenchmarkDirection[]) {
  for (const boundary of [STATS.p25, STATS.median, STATS.p75]) {
    const viaModule = deriveMarketPositionInsight({ metricKey: "cpc", benchmarkDirection: direction, userValue: boundary, ...STATS }).sourceFacts.classification;
    const viaClassify = classifyPerformance(boundary, STATS, direction);
    assertEqual(viaModule, viaClassify, `${direction} boundary=${boundary}: equality behavior matches classifyPerformance exactly`);
  }
}

// -----------------------------------------------------------------------
// §5 SUCCESS GATING — a success status with full stats produces exactly
// one market_position insight, never a data_readiness insight.
// -----------------------------------------------------------------------
{
  const insights = deriveInsightsForMetric({
    metricKey: "ctr", benchmarkDirection: "higher_is_better", benchmarkStatus: "success",
    userValue: 175, p25: 100, median: 150, p75: 200,
  });
  assertTrue(insights.some((i) => i.type === "market_position"), "success status: a market_position insight is produced");
  assertTrue(!insights.some((i) => i.type === "data_readiness"), "success status: no data_readiness insight is produced");
}

// -----------------------------------------------------------------------
// §6/§7/§8/§9 DATA READINESS — insufficient_sample / no_data /
// methodology_block each produce a readiness insight ONLY; a
// market-position insight is absent in every one of these three states.
// -----------------------------------------------------------------------
const NON_SUCCESS_STATUSES: CohortQueryStatus[] = ["insufficient_sample", "no_data", "methodology_block"];
for (const status of NON_SUCCESS_STATUSES) {
  const insights = deriveInsightsForMetric({
    metricKey: "cpa", benchmarkDirection: "lower_is_better", benchmarkStatus: status,
    userValue: null, p25: null, median: null, p75: null,
  });
  assertTrue(insights.length === 1 && insights[0].type === "data_readiness", `status=${status}: exactly one data_readiness insight is produced`);
  assertEqual(insights[0].messageKey, `benchmarkLive.readinessInsight.${status}`, `status=${status}: readiness messageKey matches the exact status`);
  assertTrue(!insights.some((i) => i.type === "market_position"), `status=${status}: market-position insight is absent (§9 requirement)`);
}
assertTrue(deriveDataReadinessInsight({ metricKey: "cpa", benchmarkStatus: "success" }) === null, "deriveDataReadinessInsight defensively returns null for status=success");

// -----------------------------------------------------------------------
// §10/§11 HISTORICAL INCREASE / DECREASE — reuses the EXACT existing
// historicalDeltaUp/Down keys, magnitude-only params (never a signed
// number alongside the direction word, matching the pre-existing
// convention in HistoricalBenchmarkSection.tsx).
// -----------------------------------------------------------------------
{
  const up = deriveHistoricalChangeInsight({ metricKey: "cpm", delta: { increased: true, percent: 12.34 } });
  assertTrue(up !== null && up.messageKey === "benchmarkLive.historicalDeltaUp", "historical increase resolves to the existing historicalDeltaUp key");
  assertTrue(up !== null && up.params.percent === "12,3", "historical increase formats percent with 1 decimal and the existing comma convention");
  assertTrue(up !== null && (up.sourceFacts.increased === true), "historical increase sourceFacts.increased is true");

  const down = deriveHistoricalChangeInsight({ metricKey: "cpm", delta: { increased: false, percent: -8.0 } });
  assertTrue(down !== null && down.messageKey === "benchmarkLive.historicalDeltaDown", "historical decrease resolves to the existing historicalDeltaDown key");
  assertTrue(down !== null && down.params.percent === "8,0", "historical decrease's percent param is always the non-negative magnitude, never signed");
}

// -----------------------------------------------------------------------
// §12 CALENDAR GAP / NO ADJACENT COMPARABLE PERIOD — never invents a
// comparison; returns null, and deriveInsightsForMetric never adds a
// historical_change insight in that case.
// -----------------------------------------------------------------------
assertTrue(deriveHistoricalChangeInsight({ metricKey: "cpm", delta: null }) === null, "no adjacent comparable period: deriveHistoricalChangeInsight returns null rather than inventing a comparison");
{
  const insights = deriveInsightsForMetric({
    metricKey: "cpm", benchmarkDirection: "lower_is_better", benchmarkStatus: "success",
    userValue: 125, p25: 100, median: 150, p75: 200, historicalDelta: null,
  });
  assertTrue(!insights.some((i) => i.type === "historical_change"), "no adjacent comparable period: the composed insight list contains no historical_change insight");
  assertTrue(insights.some((i) => i.type === "market_position"), "no adjacent comparable period: the market_position insight is still produced independently");
}
{
  // historicalDelta omitted entirely (caller never ran the historical
  // query at all) must behave identically to it being explicitly absent
  // from the output — never a stray insight appearing from `undefined`.
  const insights = deriveInsightsForMetric({
    metricKey: "cpm", benchmarkDirection: "lower_is_better", benchmarkStatus: "success",
    userValue: 125, p25: 100, median: 150, p75: 200,
  });
  assertTrue(!insights.some((i) => i.type === "historical_change"), "historicalDelta omitted (query never run): no historical_change insight is produced");
}

// -----------------------------------------------------------------------
// §13 ZERO-MEDIAN SAFETY — computePercentDiff's existing division-by-zero
// guard is reused unmodified; the module must not throw or produce
// Infinity/NaN.
// -----------------------------------------------------------------------
{
  assertTrue(computePercentDiff(10, 0) === null, "sanity: computePercentDiff(10, 0) is still null (unmodified guard)");
  const insight = deriveMarketPositionInsight({ metricKey: "cpa", benchmarkDirection: "lower_is_better", userValue: 10, p25: 0, median: 0, p75: 5 });
  assertTrue(insight.sourceFacts.percentDiff === null, "zero median: sourceFacts.percentDiff is null, never NaN/Infinity");
  assertTrue(insight.params.absDiff === "", "zero median: params.absDiff falls back to an empty string rather than a broken number");
  assertTrue(
    ["muy_competitivo", "competitivo", "por_debajo_del_benchmark", "requiere_atencion"].includes(String(insight.sourceFacts.classification)),
    "zero median: classification still resolves to a valid PerformanceLabel (deriving the insight does not throw or produce an invalid state)"
  );
}

// -----------------------------------------------------------------------
// §14 STABLE PRIORITY — methodology_block > no_data > insufficient_sample
// > market_position > historical_change, regardless of input order.
// -----------------------------------------------------------------------
{
  const marketPosition = deriveMarketPositionInsight({ metricKey: "cpm", benchmarkDirection: "lower_is_better", userValue: 125, ...STATS });
  const historical = deriveHistoricalChangeInsight({ metricKey: "cpm", delta: { increased: true, percent: 5 } })!;
  const methodologyBlock = deriveDataReadinessInsight({ metricKey: "reach", benchmarkStatus: "methodology_block" })!;
  const noData = deriveDataReadinessInsight({ metricKey: "cpm", benchmarkStatus: "no_data" })!;
  const insufficientSample = deriveDataReadinessInsight({ metricKey: "cpm", benchmarkStatus: "insufficient_sample" })!;

  // Deliberately shuffled input order — the function's own sort must
  // produce the canonical order regardless.
  const shuffled: DeterministicInsight[] = [historical, marketPosition, insufficientSample, methodologyBlock, noData];
  const result = selectVisibleInsights(shuffled);
  assertEqual(
    result.map((i) => i.type + (i.type === "data_readiness" ? `:${i.sourceFacts.benchmarkStatus}` : "")),
    ["data_readiness:methodology_block", "data_readiness:no_data"],
    "stable priority: methodology_block ranks above no_data, which ranks above everything else, and the 2-item cap truncates the rest"
  );

  const withoutReadiness = selectVisibleInsights([historical, marketPosition]);
  assertEqual(withoutReadiness.map((i) => i.type), ["market_position", "historical_change"], "stable priority: market_position ranks above historical_change when no readiness insight is present");
}

// -----------------------------------------------------------------------
// §15 MAXIMUM 2 INSIGHTS PER METRIC — never more than
// MAX_VISIBLE_INSIGHTS_PER_METRIC, even with more real candidates.
// -----------------------------------------------------------------------
{
  assertTrue(MAX_VISIBLE_INSIGHTS_PER_METRIC === 2, "the approved cap is exactly 2 visible insights per metric");
  const marketPosition = deriveMarketPositionInsight({ metricKey: "cpm", benchmarkDirection: "lower_is_better", userValue: 125, ...STATS });
  const historical = deriveHistoricalChangeInsight({ metricKey: "cpm", delta: { increased: true, percent: 5 } })!;
  const noData = deriveDataReadinessInsight({ metricKey: "cpm", benchmarkStatus: "no_data" })!;
  const result = selectVisibleInsights([marketPosition, historical, noData]);
  assertTrue(result.length === MAX_VISIBLE_INSIGHTS_PER_METRIC, "3 real candidates are truncated to exactly 2");
}

// -----------------------------------------------------------------------
// §16 DETERMINISTIC IDENTICAL INPUT -> IDENTICAL OUTPUT — no randomness,
// no Date.now(), no hidden state.
// -----------------------------------------------------------------------
{
  const input = { metricKey: "cpm", benchmarkDirection: "lower_is_better" as BenchmarkDirection, userValue: 137, ...STATS };
  const first = deriveMarketPositionInsight(input);
  const second = deriveMarketPositionInsight(input);
  assertEqual(first, second, "calling deriveMarketPositionInsight twice with the exact same input produces byte-identical output");
}

// -----------------------------------------------------------------------
// §17 ES/EN TRANSLATION PARITY — the new readinessInsight keys exist,
// with the same three sub-keys, in both locale blocks. translations.ts's
// own `const en: typeof es` already enforces this at the type level
// (verified separately by `npx tsc --noEmit`); this is a runtime
// belt-and-suspenders check on the actual source text.
// -----------------------------------------------------------------------
const readinessBlocks = translationsSource.match(/readinessInsight: \{[\s\S]*?\n\s{4}\},/g) ?? [];
assertTrue(readinessBlocks.length === 2, "exactly two readinessInsight blocks exist (one ES, one EN)");
for (const key of ["insufficient_sample", "no_data", "methodology_block"]) {
  assertTrue(readinessBlocks.length === 2 && readinessBlocks.every((b) => b.includes(`${key}:`)), `both ES and EN readinessInsight blocks define the "${key}" key`);
}
// The market-position and historical-change message keys are NOT
// duplicated here — this feature reuses benchmarkLive.insight.* and
// benchmarkLive.historicalDeltaUp/Down verbatim (already covered by
// scripts/test-phase33-benchmark-result-experience.mts and
// scripts/test-historical-benchmarks.mts respectively). Confirm this
// module never introduces a second copy of that vocabulary anywhere in
// its own source.
assertTrue(!deterministicSource.includes("insightSentence:") && !deterministicSource.includes("marketPositionCopy"), "no second, parallel copy of the market-position sentence vocabulary was introduced");

// -----------------------------------------------------------------------
// §18 FORBIDDEN EVALUATIVE / RECOMMENDATION LANGUAGE — scanned out of
// this module's actual code and the new translation strings (comment
// lines stripped first, matching this project's own established
// convention, so an explanatory comment about what the module avoids is
// never confused with an actual violation).
// -----------------------------------------------------------------------
// TEST FIX (this file, pre-delivery hardening): the original version of
// this helper only stripped `//` line comments, matching every other
// test-*.mts in this project (e.g. scripts/test-coverage-ux-polish.mts's
// own stripComments). lib/insights/deterministic.ts is the first module
// in this project to document itself with `/** ... */` JSDoc blocks
// (see e.g. the comment above deriveInsightsForMetric), whose
// continuation lines start with `*`, not `//` — the original filter let
// "most callers should use" (plain usage guidance for future
// developers, not user-facing insight text) through as a false-positive
// match against the "should" forbidden term. Widened here to also drop
// `/** */`-style block-comment lines, using the same "filter the line,
// never touch the code" approach as every other forbidden-term guard in
// this codebase.
function stripComments(src: string): string {
  return src
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}
const FORBIDDEN_TERMS = [
  "good", "bad", "strong", "weak", "winner", "Winner", "best", "worst",
  "should", "recommend", "increase your", "decrease your", "raise budget",
  " because ", "saturated", "successful", "unsuccessful",
];
{
  const code = stripComments(deterministicSource);
  for (const term of FORBIDDEN_TERMS) {
    assertTrue(!code.includes(term), `deterministic.ts contains no forbidden evaluative/recommendation term: "${term.trim()}"`);
  }
}
for (const readinessLine of [
  "Todavía no hay muestra suficiente para interpretar esta métrica.",
  "Todavía no hay datos comparables para esta métrica.",
  "Esta métrica requiere Rango de Inversión y Duración de campaña para poder compararse — no disponible con los filtros actuales.",
  "There isn't enough sample yet to interpret this metric.",
  "There isn't comparable data yet for this metric.",
  "This metric requires Spend Range and Duration Band to be comparable — not available with the current filters.",
]) {
  assertTrue(translationsSource.includes(readinessLine), `the new readiness copy "${readinessLine.slice(0, 40)}..." is present, descriptive, and non-evaluative`);
}

// -----------------------------------------------------------------------
// §19 NO REACT/NEXT/SUPABASE IMPORTS IN THE DETERMINISTIC MODULE.
// -----------------------------------------------------------------------
for (const forbiddenImport of ['from "react"', 'from "next', "from '@supabase", 'from "@supabase', "server-only"]) {
  assertTrue(!deterministicSource.includes(forbiddenImport), `deterministic.ts never imports "${forbiddenImport}"`);
}
// Regex-based (not line-based) extraction, since these are genuine
// multi-line `import { a, b, c } from "..."` statements — a naive
// per-line "starts with import" check would miss the module specifier,
// which sits on the closing line, not the opening one.
const importSpecifiers = [...deterministicSource.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
assertTrue(importSpecifiers.length === 2, "deterministic.ts has exactly two import statements");
assertTrue(
  importSpecifiers.every((spec) => spec === "@/lib/comparison/classify" || spec === "@/lib/benchmark/resultStatus"),
  "every import in deterministic.ts comes from an already-existing pure module (classify.ts or resultStatus.ts) — no new dependency surface"
);

// -----------------------------------------------------------------------
// §20 NO RAW/PRIVATE IDENTIFIERS IN OUTPUT.
// -----------------------------------------------------------------------
{
  const insights = deriveInsightsForMetric({
    metricKey: "cpa", benchmarkDirection: "lower_is_better", benchmarkStatus: "success",
    userValue: 125, p25: 100, median: 150, p75: 200, historicalDelta: { increased: true, percent: 4 },
  });
  const serialized = JSON.stringify(insights);
  for (const forbidden of ["dataset_id", "datasetId", "owner_id", "ownerId", "campaign_id", "campaignId", "campaign_name", "campaignName"]) {
    assertTrue(!serialized.includes(forbidden), `no insight output ever contains the forbidden identifier field "${forbidden}"`);
  }
  const allowedSourceFactKeys = new Set([
    "classification", "contextual", "percentDiff", "p25", "median", "p75", "userValue", "benchmarkDirection",
    "benchmarkStatus", "increased", "percent",
  ]);
  for (const insight of insights) {
    for (const key of Object.keys(insight.sourceFacts)) {
      assertTrue(allowedSourceFactKeys.has(key), `sourceFacts key "${key}" is on the approved aggregate-facts allowlist (never a raw/private identifier)`);
    }
  }
}

// -----------------------------------------------------------------------
// UI INTEGRATION — ComparisonDetail.tsx calls into the new module for
// both the "Observación" and "Lectura del benchmark" paragraphs, and no
// longer duplicates getInsightKey's own branching inline.
// -----------------------------------------------------------------------
assertTrue(comparisonDetailSource.includes('from "@/lib/insights/deterministic"'), "ComparisonDetail.tsx imports the new deterministic insights module");
assertTrue(comparisonDetailSource.includes("deriveMarketPositionInsight(") && comparisonDetailSource.includes("resolveObservationMessageKey("), "ComparisonDetail.tsx calls both the market-position and observation-key functions");
// TEST FIX (this file, pre-delivery hardening): a raw substring check
// against the full source false-matched this file's own explanatory
// header comment (line ~15: "...duplicating what getInsightKey already
// encoded"), which documents history, not an actual import/call. Reuse
// the same stripComments() helper already defined above (§18) so the
// real, meaningful claim — no import and no function call remain in the
// actual code — is checked precisely, exactly the same "check the real
// thing, not prose about it" principle applied there.
assertTrue(!stripComments(comparisonDetailSource).includes("getInsightKey"), "ComparisonDetail.tsx no longer imports/calls getInsightKey directly (outside of explanatory comments) — that branching now lives in the pure module");
assertTrue(comparisonDetailSource.includes("marketPositionInsight.messageKey") && comparisonDetailSource.includes("marketPositionInsight.params"), "the 'Lectura del benchmark' paragraph renders the insight's own messageKey/params");
// The visual hierarchy (headings, layout) is untouched — same two
// existing labels, same single card, no new section.
assertTrue(
  comparisonDetailSource.includes('t("benchmarkLive.observationLabel")') && comparisonDetailSource.includes('t("benchmarkLive.readingLabel")') && comparisonDetailSource.includes('t("benchmarkLive.readingHowToTitle")'),
  "the existing Observación/Lectura del benchmark/Cómo leer este resultado headings are all still present, unchanged"
);

// -----------------------------------------------------------------------
// STATISTICAL METHODOLOGY UNCHANGED — classify.ts/resultStatus.ts are
// never modified by this feature; this module only ever imports them.
// -----------------------------------------------------------------------
const classifySource = readFileSync(new URL("../lib/comparison/classify.ts", import.meta.url), "utf8");
assertTrue(classifySource.includes("userValue <= p25") && classifySource.includes("userValue <= median") && classifySource.includes("userValue <= p75"), "lib/comparison/classify.ts's classifyPerformance boundaries are exactly as before (this feature never touches them)");
assertTrue(!classifySource.includes("at_median") && !classifySource.includes("AT_MEDIAN"), "no at_median tolerance/classification was introduced anywhere in classify.ts, per the approved scope");
assertTrue(!deterministicSource.includes("at_median") && !deterministicSource.includes("AT_MEDIAN"), "no at_median tolerance/classification was introduced anywhere in the new deterministic module either");

console.log(`test-deterministic-insights: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
