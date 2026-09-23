"use server";

import { getMetricBenchmark, suggestCohortRelaxation } from "@/lib/benchmark/engine";
import type { BenchmarkQuery, BenchmarkResult } from "@/lib/benchmark/types";
import type { RelaxableDimension } from "@/lib/benchmark/cohortRules";
import { deriveBenchmarkStatus, type CohortQueryStatus } from "@/lib/benchmark/resultStatus";
import { buildQuery, type BenchmarkFormInput } from "@/lib/benchmark/buildQuery";

// -----------------------------------------------------------------------
// Phase 5: the server-side bridge between the UI and the existing,
// already-verified benchmark engine (lib/benchmark/engine.ts). This file
// does NOT reimplement any statistical logic — it only shapes input from
// the form into a BenchmarkQuery and shapes the engine's BenchmarkResult
// into a UI-friendly BenchmarkResponse. No Supabase credentials are
// touched here directly; the engine's own admin client handles that
// (see lib/supabase/admin.ts, still confirmed server-only).
// -----------------------------------------------------------------------

// HISTORICAL BENCHMARKS ARCHITECTURE: BenchmarkFormInput and buildQuery
// now live in lib/benchmark/buildQuery.ts and are only re-imported here
// (buildQuery is used below, never re-exported as a value) — this file
// has a top-level "use server" directive, and Next.js's Server Actions
// compiler requires every EXPORTED value from a "use server" file to be
// an async function. buildQuery does no I/O and was never meant to be a
// callable action, so `npm run build` correctly rejects exporting it
// directly from here ("Server actions must be async functions"). A
// type-only re-export is unaffected (erased at compile time, not a
// runtime action reference), so existing type-only imports of
// BenchmarkFormInput from "./actions" (BenchmarkExplorer.tsx,
// CampaignExplorer.tsx, HistoricalBenchmarkSection.tsx) keep working
// unchanged.
export type { BenchmarkFormInput };

// HISTORICAL BENCHMARKS ARCHITECTURE: the 4 "real" derivable outcomes
// now live in lib/benchmark/resultStatus.ts as CohortQueryStatus
// (shared with the new per-period historical engine) — "error" is
// added back here since it's specific to this transport layer's own
// try/catch around the query (never something deriveBenchmarkStatus
// itself returns). Same 5 string values as before this refactor.
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

function requestedCohort(input: BenchmarkFormInput): Record<string, unknown> {
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

function toResponse(input: BenchmarkFormInput, result: BenchmarkResult): BenchmarkResponse {
  // HISTORICAL BENCHMARKS ARCHITECTURE: this precedence (Reach
  // methodology block distinguishable from a merely-small cohort >
  // success > no_data > insufficient_sample) is now the ONE shared
  // implementation in lib/benchmark/resultStatus.ts — pure extraction,
  // same conditions, same order, same outcomes as before this refactor.
  // Reused identically by the new per-period historical engine so the
  // two paths can never silently disagree on what "no data" means.
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

/**
 * Runs one metric's benchmark through the existing engine and shapes
 * the result for the UI. Never returns anything beyond the typed
 * BenchmarkResponse shape — no raw dataset rows, no ids, and — per
 * Phase 5.1 item 11 — never a raw exception message, stack trace, or
 * any detail that could reveal database/service-role internals. Any
 * unexpected failure (connection issue, malformed query, etc.) is
 * caught here, logged server-side only (console.error — in a real
 * deployment this goes to server/platform logs, never to the client),
 * and converted into a generic "error" status with no detail beyond
 * that.
 */
export async function runBenchmarkQuery(input: BenchmarkFormInput): Promise<BenchmarkResponse> {
  let query: BenchmarkQuery;
  let result: BenchmarkResult;

  try {
    query = buildQuery(input);
    result = await getMetricBenchmark(query, input.metric);
  } catch (err) {
    // Deliberately not passing `err` (or even its message) into the
    // returned object — only the server log sees it.
    console.error("[benchmark] runBenchmarkQuery failed:", err);
    return {
      metric: input.metric,
      value: null,
      unit: "count",
      benchmarkDirection: "contextual",
      statistics: { p25: null, median: null, p75: null, mean: null },
      sampleSize: 0,
      cohortSampleSize: 0,
      cohort: { requested: requestedCohort(input), applied: {}, relaxed: [] },
      status: "error",
      message: "generic_error",
    };
  }

  const response = toResponse(input, result);

  // If insufficient (and not a Reach methodology block, which has its
  // own dedicated UX per item 8), attach an explicit relaxation
  // suggestion so the UI can offer it — never applied automatically.
  if (response.status === "insufficient_sample") {
    try {
      response.relaxationSuggestion = await suggestCohortRelaxation(query, input.metric);
    } catch (err) {
      // A failed relaxation-suggestion lookup should not take down an
      // otherwise-valid response — just omit the suggestion.
      console.error("[benchmark] suggestCohortRelaxation failed:", err);
    }
  }

  return response;
}

/** Runs several metrics for the same cohort in one call (e.g. the primary KPI set). */
export async function runBenchmarkQueryBatch(input: BenchmarkFormInput, metrics: string[]): Promise<BenchmarkResponse[]> {
  return Promise.all(metrics.map((metric) => runBenchmarkQuery({ ...input, metric })));
}
