// HISTORICAL BENCHMARKS ARCHITECTURE — extracted, not new.
//
// This is the ONE shared implementation of the status-derivation rule
// that previously lived only inline inside app/benchmark/actions.ts's
// toResponse(): Reach's methodology block takes precedence over
// everything else, then sufficient sample wins, then an empty cohort is
// distinguished from a non-empty-but-too-small one. Pure extraction —
// same conditions, same precedence order, same outcomes — now reused
// identically by both the live single-query path (actions.ts) and the
// new per-period historical engine (lib/benchmark/engine.ts's
// getHistoricalBenchmark), so the two can never silently drift apart on
// what counts as "no data" vs "insufficient sample" vs a Reach
// methodology block.
//
// No Supabase/Next.js dependency — plain values in, one string out.

import type { RelaxableDimension } from "./cohortRules";

// The four states a single cohort query can genuinely resolve to.
// "error" (a transport/exception-level failure) is deliberately NOT
// part of this type — it's never derived here, only ever attached by
// the caller's own try/catch around the query itself (see
// app/benchmark/actions.ts's runBenchmarkQuery and
// app/benchmark/historicalActions.ts's per-period handling).
export type CohortQueryStatus = "success" | "insufficient_sample" | "methodology_block" | "no_data";

/**
 * Reach requires Spend Range + Duration Band for any direct benchmark
 * (scale comparability) — missing either, or having either explicitly
 * relaxed away, is a hard methodological stop, never a sample-size
 * question. Exact same predicate previously inlined in
 * app/benchmark/actions.ts's toResponse(), unchanged.
 */
export function isReachMethodologyBlock(
  metricKey: string,
  spendBand: string | null | undefined,
  durationBand: string | null | undefined,
  relaxedDimensions: RelaxableDimension[] | string[] | undefined
): boolean {
  const relaxed = relaxedDimensions ?? [];
  return (
    metricKey === "reach" &&
    (!spendBand || !durationBand || relaxed.includes("spend_range") || relaxed.includes("duration_band"))
  );
}

export interface DeriveBenchmarkStatusParams {
  metricKey: string;
  spendBand: string | null | undefined;
  durationBand: string | null | undefined;
  relaxedDimensions: RelaxableDimension[] | string[] | undefined;
  sufficientData: boolean;
  cohortSampleSize: number;
}

/**
 * The exact precedence order previously inlined in toResponse():
 * Reach methodology block > success (sufficient sample) > no_data
 * (nothing in the cohort at all) > insufficient_sample (cohort exists,
 * this metric's own sample is just too small).
 */
export function deriveBenchmarkStatus(params: DeriveBenchmarkStatusParams): CohortQueryStatus {
  if (isReachMethodologyBlock(params.metricKey, params.spendBand, params.durationBand, params.relaxedDimensions)) {
    return "methodology_block";
  }
  if (params.sufficientData) return "success";
  if (params.cohortSampleSize === 0) return "no_data";
  return "insufficient_sample";
}
