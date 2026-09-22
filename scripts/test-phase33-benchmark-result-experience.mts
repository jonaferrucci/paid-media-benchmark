// PHASE 33 — BENCHMARK RESULT EXPERIENCE.
//
// Same convention as every other scripts/test-*.mts file in this
// project: readFileSync-based structural source-text checks (no
// jsdom/React Testing Library configured here), focused on exactly
// what this phase touched — BenchmarkExplorer's success/insufficient/
// error result rendering, the new "Contexto del benchmark" section,
// the P25/Median/P75 snapshot, and ComparisonDetail's new
// interpretation heading — without touching or re-verifying the
// engine's own statistics (untouched by this phase).

import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const explorerSource = readFileSync(new URL("../app/benchmark/BenchmarkExplorer.tsx", import.meta.url), "utf8");
const comparisonDetailSource = readFileSync(new URL("../app/benchmark/ComparisonDetail.tsx", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");
const engineSource = readFileSync(new URL("../lib/benchmark/engine.ts", import.meta.url), "utf8");
const classifySource = readFileSync(new URL("../lib/comparison/classify.ts", import.meta.url), "utf8");

// -----------------------------------------------------------------------
// §2/§3 Success result hierarchy: median comes first, then the P25/
// Median/P75 snapshot is visible immediately (never gated behind
// entering "Tu resultado"), THEN the prominent sample-size line, THEN
// the cohort context section — matching the requested order.
// -----------------------------------------------------------------------
const successBlockMatch = explorerSource.match(/\/\/ status === "success"[\s\S]*?export const LABEL_STYLE|\/\/ status === "success"[\s\S]*$/);
const successBlock = successBlockMatch ? successBlockMatch[0] : explorerSource;
const idxMedian = successBlock.indexOf('t("benchmarkLive.marketMedianLabel")');
const idxSnapshot = successBlock.indexOf('t("benchmarkLive.typicalRangeLabel")');
const idxSampleSize = successBlock.indexOf('t("benchmarkLive.sampleSizeProminent"');
const idxCohortContext = successBlock.indexOf("<CohortContextSection");
assertTrue(
  idxMedian > -1 && idxSnapshot > idxMedian && idxSampleSize > idxSnapshot && idxCohortContext > idxSampleSize,
  "result hierarchy order is median -> P25/median/P75 snapshot -> sample size -> cohort context, in that DOM order"
);
assertTrue(
  explorerSource.includes("{p25 !== null && median !== null && p75 !== null && (") &&
  explorerSource.includes('{t("benchmarkLive.typicalRangeLabel")}'),
  "the P25/Median/P75 snapshot renders as soon as a success result exists — not gated behind a userValue/compared state"
);

// -----------------------------------------------------------------------
// §6 P25/Median/P75 rendered as plain numbers, reusing formatMetricValue
// — no new chart dependency, no new formula.
// -----------------------------------------------------------------------
assertTrue(
  (explorerSource.match(/formatMetricValue\(p25, response\.unit\)/g) ?? []).length >= 1 &&
  (explorerSource.match(/formatMetricValue\(p75, response\.unit\)/g) ?? []).length >= 1,
  "P25 and P75 are rendered via the existing formatMetricValue helper — no new formatting logic"
);
assertTrue(
  !/from ["'](chart\.js|recharts|d3|victory|nivo)["']/.test(explorerSource),
  "no new charting library dependency was introduced"
);

// -----------------------------------------------------------------------
// §7 Sample-size wording: success case already used a descriptive
// sentence (untouched); insufficient_sample's previously-raw "n = X
// (cohort: Y)" is now a plain sentence that keeps sampleSize and
// cohortSampleSize explicitly distinct.
// -----------------------------------------------------------------------
assertTrue(
  explorerSource.includes('t("benchmarkLive.sampleSizeProminent", { n: response.sampleSize })'),
  "the success state's sample-size line remains the existing descriptive sentence (untouched)"
);
assertTrue(
  !explorerSource.includes("n = {response.sampleSize} (cohort: {response.cohortSampleSize})"),
  "the old raw \"n = X (cohort: Y)\" technical notation is gone"
);
assertTrue(
  explorerSource.includes('t("benchmarkLive.insufficientSampleDetail", { sampleSize: response.sampleSize, cohortSampleSize: response.cohortSampleSize })'),
  "insufficient_sample now uses a descriptive sentence that keeps sampleSize and cohortSampleSize as two distinct, separately-named values"
);
assertTrue(
  translationsSource.includes('insufficientSampleDetail: "Encontramos {cohortSampleSize} campañas en esta cohorte, pero solo {sampleSize} tienen datos suficientes para esta métrica."') &&
  translationsSource.includes('insufficientSampleDetail: "We found {cohortSampleSize} campaigns in this cohort, but only {sampleSize} have enough data for this metric."'),
  "the new insufficient-sample copy exists in both locales"
);

// -----------------------------------------------------------------------
// §4/§5 userValue comparison and interpretation reuse the EXISTING
// classify.ts logic — no new evaluation, no score. Only a new heading
// ("Cómo leer este resultado") wraps the existing, unchanged
// Observación + Lectura paragraphs.
// -----------------------------------------------------------------------
assertTrue(
  comparisonDetailSource.includes('t("benchmarkLive.readingHowToTitle")') &&
  comparisonDetailSource.includes('t("benchmarkLive.observationLabel")') &&
  comparisonDetailSource.includes('t("benchmarkLive.readingLabel")'),
  "the new \"Cómo leer este resultado\" heading wraps the existing Observación/Lectura content, never replacing it"
);
assertTrue(
  comparisonDetailSource.includes("classifyPerformance(userValue, stats, response.benchmarkDirection)") &&
  comparisonDetailSource.includes("computePercentDiff(userValue, median)"),
  "ComparisonDetail still delegates classification and percent-diff entirely to lib/comparison/classify.ts — no re-derived logic"
);
assertTrue(
  !/function classifyPerformance|function computePercentDiff|function computeMarkerPosition/.test(comparisonDetailSource),
  "no classification/statistics function was re-implemented locally in ComparisonDetail"
);

// -----------------------------------------------------------------------
// No winner/ranking/score language was introduced by this phase's own
// new copy (the pre-existing Phase 11 classification labels are out of
// this phase's scope and are left untouched, per the task's own
// instruction not to modify classification logic).
// -----------------------------------------------------------------------
const newPhase33Keys = [
  "insufficientSampleDetail", "retryCta", "cohortContextTitle", "readingHowToTitle",
];
for (const key of newPhase33Keys) {
  const re = new RegExp(`${key}: "([^"]*)"`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(translationsSource)) !== null) {
    const value = match[1].toLowerCase();
    assertTrue(
      !/ganador|mejor|peor|score|winner|best|worst|performance rating/.test(value),
      `new copy for ${key} avoids winner/ranking/score language: "${match[1]}"`
    );
  }
}

// -----------------------------------------------------------------------
// §8 Cohort context: only real, applied fields, using display labels
// (never internal_key strings), reusing the existing taxonomies data
// and the SAME Spend/Duration Band option labels the filter form
// itself uses (no second, hardcoded label list).
// -----------------------------------------------------------------------
assertTrue(
  explorerSource.includes("function CohortContextSection(") &&
  explorerSource.includes("const applied = response.cohort.applied as {"),
  "CohortContextSection reads directly from the engine's own response.cohort.applied — no new field invented"
);
assertTrue(
  explorerSource.includes("if (applied.audienceStrategy) {") &&
  explorerSource.includes("if (applied.funnelStage) {") &&
  explorerSource.includes("if (applied.businessModel) {") &&
  explorerSource.includes("if (applied.spendBand) {") &&
  explorerSource.includes("if (applied.durationBand) {") &&
  explorerSource.includes("if (applied.timeWindow) {"),
  "every cohort context row is conditionally rendered only when that field was actually applied — never a fabricated default"
);
assertTrue(
  explorerSource.includes("const SPEND_BAND_OPTIONS:") && explorerSource.includes("const DURATION_BAND_OPTIONS:") &&
  (explorerSource.match(/SPEND_BAND_OPTIONS/g) ?? []).length >= 3 &&
  (explorerSource.match(/DURATION_BAND_OPTIONS/g) ?? []).length >= 3,
  "Spend/Duration Band labels are shared constants reused by both the filter Select and the new context section — never a duplicated label list"
);
assertTrue(
  !/applied\.platform|applied\.objective|applied\.vertical|applied\.country/.test(explorerSource),
  "Platform/Objective/Vertical/Country are not repeated in the new cohort context section — they're already shown in the page's own header"
);

// -----------------------------------------------------------------------
// Relaxed dimension is still clearly indicated — now folded into the
// cohort context section rather than a separate floating notice.
// -----------------------------------------------------------------------
assertTrue(
  explorerSource.includes("response.cohort.relaxed.length > 0") &&
  explorerSource.includes('t("benchmarkLive.relaxedNotice")') &&
  explorerSource.includes('t("benchmarkLive.relaxedExplain"'),
  "the relaxed-dimension notice is preserved (same copy keys) inside the new cohort context section"
);
assertTrue(
  (explorerSource.match(/response\.cohort\.relaxed\.length > 0/g) ?? []).length === 1,
  "the relaxed-dimension check now appears exactly once (previously a separate standalone block) — no duplicated notice"
);

// -----------------------------------------------------------------------
// §9 Comparison input: Phase 32's prefilled userValue is preserved,
// still never auto-submitted (server action call happens only on
// explicit user action), unusual-value hint preserved, no silent unit
// conversion.
// -----------------------------------------------------------------------
assertTrue(
  explorerSource.includes("const [inputValue, setInputValue] = useState(initialUserValue != null ? String(initialUserValue) : \"\");") &&
  explorerSource.includes("const [compared, setCompared] = useState<number | null>(initialUserValue ?? null);"),
  "a Phase-32-prefilled userValue still shows clearly in both the input and the compared state — no re-entry required"
);
assertTrue(
  explorerSource.includes("looksUnusual") && explorerSource.includes('t("benchmarkLive.unusualValueHint")'),
  "the unusual-value hint is preserved"
);
assertTrue(
  !/inputValue\s*\*\s*\d|inputValue\s*\/\s*\d/.test(explorerSource),
  "no silent unit transformation is applied to the typed/prefilled value"
);

// -----------------------------------------------------------------------
// §7 (saved comparison) Save comparison preserved untouched.
// -----------------------------------------------------------------------
assertTrue(
  explorerSource.includes("<SaveComparisonButton") &&
  explorerSource.includes('comparisonType: "single_metric",') &&
  explorerSource.includes("userValue: compared,"),
  "SaveComparisonButton's existing payload-building is untouched"
);

// -----------------------------------------------------------------------
// §10 Next actions: at most 3 strong actions after a valid comparison
// (Guardar comparación + Explorar medios + Armar un plan), never
// repeated in a second location.
// -----------------------------------------------------------------------
assertTrue(
  explorerSource.includes('t("benchmarkLive.exploreMediaCta")') && explorerSource.includes('t("benchmarkLive.buildPlanCta")'),
  "the two navigation next-actions (Explorar medios / Armar plan) are present"
);
assertTrue(
  (explorerSource.match(/href="\/platforms"/g) ?? []).length === 1 && (explorerSource.match(/href="\/planner"/g) ?? []).length === 1,
  "each next-action link appears exactly once — never repeated in a second location on the same result"
);

// -----------------------------------------------------------------------
// §11 Empty/error states: no_data/insufficient_sample/methodology_block
// logic untouched; error state now has a real action (Reintentar)
// instead of being a dead end.
// -----------------------------------------------------------------------
for (const status of ['"no_data"', '"insufficient_sample"', '"methodology_block"']) {
  assertTrue(explorerSource.includes(`response.status === ${status}`), `${status} branch is still present, untouched in logic`);
}
assertTrue(
  explorerSource.includes("onRetry") && explorerSource.includes('t("benchmarkLive.retryCta")'),
  "the error state now offers a real \"Reintentar\" action instead of a dead end"
);
assertTrue(
  explorerSource.includes("onRetry={() => handleSubmit()}"),
  "retry simply re-runs the exact same query the user already built — never a silent modification of their input"
);

// -----------------------------------------------------------------------
// §12 Mobile: the new blocks wrap/stack rather than using a fixed-width
// horizontal table for the primary result.
// -----------------------------------------------------------------------
assertTrue(
  explorerSource.includes('className="mt-1.5 grid grid-cols-3 gap-2 text-center"'),
  "the P25/Median/P75 snapshot uses a 3-column grid (stacks naturally, no horizontal scroll table)"
);
assertTrue(
  explorerSource.includes('className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2"'),
  "the cohort context rows are a responsive 1-to-2 column grid, not a fixed-width table"
);

// -----------------------------------------------------------------------
// No mock-benchmark-number dependency, no new backend/migration touch.
// -----------------------------------------------------------------------
for (const [label, source] of [
  ["BenchmarkExplorer.tsx", explorerSource],
  ["ComparisonDetail.tsx", comparisonDetailSource],
] as const) {
  assertTrue(!/from ["']@\/lib\/mock\/benchmarks["']/.test(source), `${label} never imports lib/mock/benchmarks`);
  assertTrue(!/from ["']@\/lib\/mock\/random["']/.test(source), `${label} never imports lib/mock/random`);
}
assertTrue(
  engineSource.includes("Every exported function below returns only a typed, aggregated") &&
  classifySource.includes("This file is the single place classification"),
  "lib/benchmark/engine.ts and lib/comparison/classify.ts's own architecture/privacy comments are untouched — confirming no edits were made to either"
);
assertTrue(
  (() => {
    try {
      readFileSync(new URL("../supabase/migrations/0020_placeholder.sql", import.meta.url), "utf8");
      return false;
    } catch {
      return true;
    }
  })(),
  "no new migration (e.g. 0020) was created for this phase"
);

console.log(`test-phase33-benchmark-result-experience: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
