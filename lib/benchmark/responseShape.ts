// CUCURUCHO INTELLIGENCE 2 (§10): pure extraction, zero behavior change.
//
// toResponse()/requestedCohort()/BenchmarkResponse/BenchmarkStatus used
// to live only inside app/benchmark/actions.ts. That file has a
// top-level "use server" directive, and Next.js's Server Actions
// compiler requires every EXPORTED value from a "use server" file to be
// an async function — the exact same constraint that already forced
// buildQuery() out into lib/benchmark/buildQuery.ts during Historical
// Benchmarks. toResponse is a plain, synchronous shaping function (no
// I/O), so it can never be exported directly from actions.ts either.
//
// Campaign Explorer's page.tsx (a Server Component, not a "use server"
// action file) needs this exact same BenchmarkResult -> BenchmarkResponse
// shaping — including the shared deriveBenchmarkStatus precedence — so
// its own per-metric market comparison can never silently drift from
// what /benchmark itself shows for the same query. Moving the function
// here (rather than writing a second copy in page.tsx) keeps this the
// ONE place that shape gets decided, exactly like resultStatus.ts is
// the one place status precedence gets decided.
//
// app/benchmark/actions.ts re-imports these and re-exports the TYPES
// (type-only, erased at compile time, never a runtime action reference)
// exactly as it already does for BenchmarkFormInput from buildQuery.ts —
// every existing import of BenchmarkResponse/BenchmarkStatus from
// "./actions" keeps working unchanged.

import type { BenchmarkQuery, BenchmarkResult } from "./types";
import type { RelaxableDimension } from "./cohortRules";
import { deriveBenchmarkStatus, type CohortQueryStatus } from "./resultStatus";
import type { BenchmarkFormInput } from "./buildQuery";

export type BenchmarkStatus = CohortQueryStatus | "error";

export interface BenchmarkResponse {
  metric: string;
  value: number | null;
  unit: string;
  benchmarkDirection: "lower_is_better" | "higher_is_better" | "contextual";
  statistics: {
    p25: number | null;
    median: number | null;
    p75: number | null;
    mean: number | null;
  };
  sampleSize: number;
  cohortSampleSize: number;
  cohort: {
    requested: Record<string, unknown>;
    applied: Record<string, unknown>;
    relaxed: string[];
  };
  status: BenchmarkStatus;
  message?: string;
  relaxationSuggestion?: { dimension: RelaxableDimension; estimatedSampleSize: number } | null;
}

export function requestedCohort(input: BenchmarkFormInput): Record<string, unknown> {
  return {
    platform: input.platform,
    objective: input.objective,
    vertical: input.vertical,
    country: input.country,
    audienceStrategy: input.audienceStrategy ?? null,
    funnelStage: input.funnelStage ?? null,
    businessModel: input.businessModel ?? null,
    spendBand: input.spendBand ?? null,
    durationBand: input.durationBand ?? null,
    timeWindow: input.timeWindow ?? "last_12_months",
  };
}

/**
 * Shapes one engine BenchmarkResult into the UI-friendly
 * BenchmarkResponse — same precedence (Reach methodology block >
 * success > no_data > insufficient_sample), same fields, same
 * `message` mapping as before this extraction. `input` only needs to
 * carry the same fields BenchmarkFormInput already requires; it is
 * never mutated and nothing beyond it is read.
 */
export function toResponse(input: BenchmarkFormInput, result: BenchmarkResult): BenchmarkResponse {
  const status: BenchmarkStatus = deriveBenchmarkStatus({
    metricKey: input.metric,
    spendBand: input.spendBand,
    durationBand: input.durationBand,
    relaxedDimensions: input.relaxedDimensions,
    sufficientData: result.sufficientData,
    cohortSampleSize: result.cohortSampleSize,
  });

  const message: string | undefined =
    status === "methodology_block"
      ? "reach_requires_scale_context"
      : status === "no_data"
        ? "no_matching_datasets"
        : status === "insufficient_sample"
          ? "sample_below_threshold"
          : undefined;

  return {
    metric: result.metric,
    value: result.value,
    unit: result.unit,
    benchmarkDirection: result.benchmarkDirection,
    statistics: { p25: result.p25, median: result.value, p75: result.p75, mean: result.mean },
    sampleSize: result.metricSampleSize,
    cohortSampleSize: result.cohortSampleSize,
    cohort: {
      requested: requestedCohort(input),
      applied: result.cohort as unknown as Record<string, unknown>,
      relaxed: result.relaxedDimensions,
    },
    status,
    message,
  };
}
