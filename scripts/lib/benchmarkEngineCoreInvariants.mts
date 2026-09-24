// HISTORICAL BENCHMARKS — FINAL REGRESSION HARDENING.
//
// SHARED REAL-BEHAVIOR INVARIANTS for lib/benchmark/engine.ts and
// app/benchmark/actions.ts — read this before editing either function
// below.
//
// WHY THIS FILE EXISTS. Five legacy regression scripts each had a
// PROTECTED_FILES-style assertion of the exact shape:
//
//   const diff = execSync(`git diff --stat -- lib/benchmark/engine.ts`);
//   assertTrue(diff.trim() === "", "engine.ts has zero uncommitted changes");
//
// (scripts/test-benchmark-entry-continuity.mts had the equivalent for
// app/benchmark/actions.ts too, via `git diff --stat HEAD` + a
// forbidden-substring check.)
//
// That assertion is `git diff` against the CURRENT WORKING TREE relative
// to HEAD/the index — it only ever proves "no UNCOMMITTED edit exists in
// this file at the moment this script happens to run". It correctly
// failed while Historical Benchmarks (commit 2693ce4) was in progress,
// because engine.ts/actions.ts legitimately had real, in-scope,
// uncommitted changes at that time — that failure was doing its job. The
// INSTANT that work was committed, the working-tree diff cleared and the
// same five assertions started reporting "zero uncommitted changes
// (protected)" again — not because the invariant they exist to protect
// ("this phase doesn't quietly break core benchmark logic") became true,
// but because a git-diff-against-the-working-tree check cannot see past
// a commit boundary. It was never pinned to a specific known-good
// version of either file's CONTENT; it only ever asserted "nothing is
// presently uncommitted here". Concretely: any future phase could now
// rewrite engine.ts or actions.ts in whatever way it liked, commit that
// change, and these five assertions would keep passing forever after —
// they provide zero protection once a commit exists, which makes them a
// silent, permanent false sense of safety rather than a real regression
// guard. That is a test-methodology bug, independent of whether
// Historical Benchmarks' own changes were safe (they were — see
// scripts/test-historical-benchmarks.mts and the full `git diff` review
// documented in that feature's own commit).
//
// THE FIX. Replace the vacuous git-diff line with real, git-history-
// independent behavioral assertions for exactly the properties each of
// those five guards existed to protect: valid-only cohort aggregation,
// start_date-based (never end_date/prorated) window eligibility, the
// minimum-sample-size decision, Reach's unconditional methodology block,
// percentile math staying delegated to lib/benchmark/stats.ts, Time
// Window resolution staying the one shared implementation, the
// BenchmarkResult/BenchmarkResponse contracts not shrinking, and the
// admin/security posture (single shared admin client, no ad hoc
// Supabase client, no raw error leaked to the UI). These check the
// SOURCE TEXT of the current files against fixed, precise patterns — a
// real future change to any of these behaviors will fail them, commit
// or no commit. They do NOT execute engine.ts (it transitively imports
// lib/supabase/admin.ts's "server-only" package, which throws
// unconditionally outside a Next.js server bundle — see
// scripts/test-historical-benchmarks.mts's own note on this).
//
// admin.ts, lib/benchmark/cohortRules.ts, lib/benchmark/
// singleMetricOptions.ts, lib/comparison/classify.ts, lib/metrics/
// derive.ts, and supabase/migrations/ were NOT touched by Historical
// Benchmarks — their existing git-diff-based checks in these same five
// scripts are still real, still meaningful, and were intentionally left
// alone. Only the two lines that named lib/benchmark/engine.ts (in all
// five scripts) and app/benchmark/actions.ts (in
// test-benchmark-entry-continuity.mts) are replaced by calls into this
// module.

import { readFileSync } from "node:fs";

const engineSource = readFileSync(new URL("../../lib/benchmark/engine.ts", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../../app/benchmark/actions.ts", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../../lib/benchmark/types.ts", import.meta.url), "utf8");

type AssertTrue = (cond: boolean, label: string) => void;

/**
 * Real, content-based invariants for lib/benchmark/engine.ts. Call this
 * wherever a legacy script used to assert "engine.ts has zero
 * uncommitted changes".
 */
export function assertEngineCoreInvariants(assertTrue: AssertTrue): void {
  // Valid-only cohort aggregation — never pending/excluded datasets.
  assertTrue(/\.eq\("validation_status", "valid"\)/.test(engineSource), "engine.ts: fetchEligibleDatasetIds still filters validation_status='valid' — no pending/excluded dataset can enter aggregation");

  // Window eligibility is still start_date-based only — never end_date,
  // never an overlap/proration rule for a campaign crossing a boundary.
  assertTrue(/\.gte\("start_date", params\.windowStart\)/.test(engineSource) && /\.lte\("start_date", params\.windowEnd\)/.test(engineSource), "engine.ts: dataset window eligibility is still start_date-based only");
  assertTrue(!/\.gte\("end_date"|\.lte\("end_date"/.test(engineSource), "engine.ts: end_date is still never used to bound window eligibility");

  // Minimum sample size: same settings lookup, same fallback constant,
  // same "fewer than minimumSampleSize real values -> insufficient" rule.
  assertTrue(/eq\("setting_key", "minimum_sample_size"\)/.test(engineSource), "engine.ts: getMinimumSampleSize still reads benchmark_settings.minimum_sample_size");
  assertTrue(/value\?\.default \?\? DEFAULT_MINIMUM_SAMPLE_SIZE/.test(engineSource), "engine.ts: still falls back to the unchanged DEFAULT_MINIMUM_SAMPLE_SIZE constant (lib/benchmark/cohortRules.ts) when no override is configured");
  assertTrue(/chosen\.values\.length < minimumSampleSize/.test(engineSource), "engine.ts: the sufficientData decision is still exactly 'fewer than minimumSampleSize real metric values -> insufficient' — no different threshold, no estimate");

  // Reach methodology block: unconditional hard stop, never a
  // sample-size question, unchanged predicate and unchanged short-circuit.
  assertTrue(/metricKey === "reach" && \(!query\.spendBand \|\| !query\.durationBand \|\| reachScaleContextRelaxed\)/.test(engineSource), "engine.ts: Reach's Spend Range + Duration Band hard-stop predicate is unchanged");
  assertTrue(/if \(metricKey === "reach" &&[\s\S]{0,120}return emptyResult\(metricKey, query, relaxed, window, 0\);/.test(engineSource), "engine.ts: a Reach methodology block still short-circuits straight to an empty result before any dataset query runs (never merely flagged after the fact)");

  // Percentile calculation is still delegated to lib/benchmark/stats.ts,
  // never reimplemented inline, and the reported statistic is still
  // exclusively the median.
  assertTrue(/computeDistribution\(chosen\.values\)/.test(engineSource) && /flagOutliers\(chosen\.values\)/.test(engineSource), "engine.ts: percentile/outlier math is still delegated to computeDistribution/flagOutliers (lib/benchmark/stats.ts), never reimplemented inline");
  assertTrue(/statistic: "median"/.test(engineSource), "engine.ts: the reported statistic is still exclusively the median");
  assertTrue(/import \{ computeDistribution, flagOutliers \} from "\.\/stats"/.test(engineSource), "engine.ts: still imports its percentile/outlier functions from the single shared lib/benchmark/stats.ts, not a local reimplementation");

  // Time Window resolution is still the one shared implementation.
  assertTrue(/import \{ resolveTimeWindow \} from "\.\/timeWindow"/.test(engineSource), "engine.ts: still imports resolveTimeWindow from the single shared lib/benchmark/timeWindow.ts, never a second/local date-window calculation");

  // getMetricBenchmark's public contract (signature + every
  // BenchmarkResult field) is unchanged for every existing caller.
  assertTrue(/export async function getMetricBenchmark\(query: BenchmarkQuery, metricKey: string\): Promise<BenchmarkResult>/.test(engineSource), "engine.ts: getMetricBenchmark's exported signature is unchanged");
  for (const field of ["value", "unit", "benchmarkDirection", "p25", "p75", "mean", "metricSampleSize", "cohortSampleSize", "cohort", "metricDefinitionVariantId", "relaxedDimensions", "sufficientData", "outlierFlaggedCount", "freshness"]) {
    assertTrue(new RegExp(`\\b${field}:`).test(typesSource), `lib/benchmark/types.ts: BenchmarkResult still declares its '${field}' field — the live result contract has not shrunk or been renamed`);
  }

  // Admin/security posture: still the one server-only, no-store admin
  // client — engine.ts never rolls its own Supabase client instance.
  assertTrue(/import \{ createAdminClient \} from "@\/lib\/supabase\/admin"/.test(engineSource), "engine.ts: still imports the single shared createAdminClient (lib/supabase/admin.ts, server-only, no-store)");
  assertTrue(!/createSupabaseClient\(/.test(engineSource) && !/new SupabaseClient/.test(engineSource), "engine.ts: never instantiates its own ad hoc Supabase client outside the shared admin client");
}

/**
 * Real, content-based invariants for app/benchmark/actions.ts. Call this
 * wherever a legacy script used to assert "actions.ts has zero
 * uncommitted changes" / "actions.ts was not touched".
 */
export function assertActionsCoreInvariants(assertTrue: AssertTrue): void {
  // The live single-query path still calls the one shared engine
  // function — no parallel/duplicated query path was introduced.
  assertTrue(/result = await getMetricBenchmark\(query, input\.metric\)/.test(actionsSource), "actions.ts: runBenchmarkQuery still calls the single shared getMetricBenchmark(query, metric) — no parallel/duplicated query path");

  // Status derivation is the one shared implementation, not a second,
  // hand-inlined copy of the Reach/sufficient/no-data precedence.
  assertTrue(/const status: BenchmarkStatus = deriveBenchmarkStatus\(\{/.test(actionsSource), "actions.ts: toResponse still derives status via the shared deriveBenchmarkStatus (lib/benchmark/resultStatus.ts), not a re-inlined copy of the precedence rule");
  assertTrue(!/reachScaleContextRelaxed/.test(actionsSource), "actions.ts: no second, hand-inlined Reach-methodology-block predicate exists here (that logic lives only in engine.ts/resultStatus.ts)");

  // A failed query is still logged server-side only and returned as a
  // generic error — no raw exception detail reaches the client.
  assertTrue(/console\.error\("\[benchmark\] runBenchmarkQuery failed:", err\)/.test(actionsSource), "actions.ts: a failed query is still logged server-side only (console.error)");
  assertTrue(/status: "error"/.test(actionsSource) && !/message:\s*err\b/.test(actionsSource) && !/message:\s*String\(err\)/.test(actionsSource) && !/message:\s*err\.message/.test(actionsSource), "actions.ts: a failed query still returns a generic 'error' status with no raw exception message/detail exposed to the client");

  // The BenchmarkResponse contract (every field the UI reads) is still
  // declared, unshrunk.
  for (const field of ["value", "unit", "benchmarkDirection", "statistics", "sampleSize", "cohortSampleSize", "cohort", "status", "message", "relaxationSuggestion"]) {
    assertTrue(new RegExp(`\\b${field}\\??:`).test(actionsSource), `actions.ts: BenchmarkResponse still declares its '${field}' field`);
  }
}
