"use server";

// HISTORICAL BENCHMARKS ARCHITECTURE — the server-side bridge between
// the /benchmark UI and lib/benchmark/engine.ts's getHistoricalBenchmark,
// exactly mirroring the existing single-query bridge (runBenchmarkQuery
// in ./actions.ts): shapes a BenchmarkFormInput into the query the
// engine expects, never reimplements any statistical/cohort logic, and
// never returns a raw dataset row, id, or any detail beyond a typed,
// aggregated response.

import { getHistoricalBenchmark } from "@/lib/benchmark/engine";
import { generateHistoricalPeriods, type HistoricalGranularity } from "@/lib/benchmark/historicalPeriods";
// HISTORICAL BENCHMARKS ARCHITECTURE: imported from lib/benchmark/
// buildQuery.ts, not from ./actions — actions.ts has a top-level "use
// server" directive, and Next.js's Server Actions compiler requires
// every EXPORTED value from such a file to be an async function.
// buildQuery is a plain, synchronous mapping helper, so it (and the
// BenchmarkFormInput type it takes) live in a directive-free module
// that both this file and actions.ts import from — still the ONE
// mapping, just not physically defined inside the "use server" file.
import { buildQuery, type BenchmarkFormInput } from "@/lib/benchmark/buildQuery";

// HISTORICAL BENCHMARKS ARCHITECTURE (§6 decision): quarterly, last 4
// quarters (~12 months). Chosen over monthly as the safer MVP default —
// larger buckets are more likely to clear the minimum-sample threshold
// for an early-stage, still-growing contributed dataset. This is an
// explicit, typed constant (not hardcoded inline) specifically so it can
// be revisited once real per-period sample-size data is available to
// confirm or override the choice — see this feature's own architecture
// report for the full reasoning and the caveat that no live database
// was reachable from this environment to verify actual counts.
const HISTORICAL_GRANULARITY: HistoricalGranularity = "quarter";
const HISTORICAL_PERIOD_COUNT = 4;

export interface HistoricalPeriodResponse {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  status: "success" | "insufficient_sample" | "methodology_block" | "no_data" | "error";
  metricSampleSize: number;
  cohortSampleSize: number;
  p25: number | null;
  median: number | null;
  p75: number | null;
}

export interface HistoricalBenchmarkResponse {
  metric: string;
  unit: string;
  granularity: HistoricalGranularity;
  periods: HistoricalPeriodResponse[];
  // Transport-level only — distinct from any individual period's own
  // "error" status. "error" here means the historical query could not
  // even be attempted (e.g. a malformed input); an individual period's
  // "error" means periods around it loaded fine but that one specific
  // period's own query failed.
  status: "success" | "error";
}

/**
 * Runs one metric's benchmark across several historical periods for the
 * SAME cohort a live query already has (platform/objective/vertical/
 * country plus whatever optional filters are active). Never auto-
 * triggered by the single-query submit — the caller (the UI) only
 * invokes this when the user actually opens the Historical section, so
 * a plain "Ver benchmark" never pays for N extra period queries nobody
 * asked to see (§11).
 */
export async function runHistoricalBenchmarkQuery(input: BenchmarkFormInput): Promise<HistoricalBenchmarkResponse> {
  try {
    // buildQuery's own `timeWindow` mapping is irrelevant here — every
    // period below overrides it with its own {kind: "custom"} range —
    // but reusing it verbatim means this file never hand-maintains a
    // second copy of the platform/objective/vertical/country/optional-
    // filter mapping that could silently drift from the live query's.
    const query = buildQuery(input);
    const periods = generateHistoricalPeriods(HISTORICAL_GRANULARITY, HISTORICAL_PERIOD_COUNT);
    const result = await getHistoricalBenchmark(query, input.metric, periods);

    return {
      metric: result.metric,
      unit: result.unit,
      granularity: HISTORICAL_GRANULARITY,
      periods: result.periods.map((p) => ({
        periodKey: p.periodKey,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        status: p.status,
        metricSampleSize: p.metricSampleSize,
        cohortSampleSize: p.cohortSampleSize,
        p25: p.p25,
        median: p.median,
        p75: p.p75,
      })),
      status: "success",
    };
  } catch (err) {
    // Same privacy/safety posture as runBenchmarkQuery: never pass the
    // raw error (or its message) back to the client — server log only.
    console.error("[benchmark] runHistoricalBenchmarkQuery failed:", err);
    return {
      metric: input.metric,
      unit: "count",
      granularity: HISTORICAL_GRANULARITY,
      periods: [],
      status: "error",
    };
  }
}
