"use server";

import { getMetricBenchmark, suggestCohortRelaxation } from "@/lib/benchmark/engine";
import type { BenchmarkQuery, BenchmarkResult, TimeWindowInput } from "@/lib/benchmark/types";
import type { RelaxableDimension } from "@/lib/benchmark/cohortRules";

// -----------------------------------------------------------------------
// Phase 5: the server-side bridge between the UI and the existing,
// already-verified benchmark engine (lib/benchmark/engine.ts). This file
// does NOT reimplement any statistical logic — it only shapes input from
// the form into a BenchmarkQuery and shapes the engine's BenchmarkResult
// into a UI-friendly BenchmarkResponse. No Supabase credentials are
// touched here directly; the engine's own admin client handles that
// (see lib/supabase/admin.ts, still confirmed server-only).
// -----------------------------------------------------------------------

export interface BenchmarkFormInput {
  metric: string;
  platform: string;
  objective: string;
  vertical: string;
  country: string;
  audienceStrategy?: string | null;
  funnelStage?: string | null;
  businessModel?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  genderTargeting?: string | null;
  spendBand?: string | null;
  durationBand?: string | null;
  timeWindow?: string; // "current_year" | "last_3_months" | "last_6_months" | "last_12_months"
  relaxedDimensions?: RelaxableDimension[];
}

export type BenchmarkStatus = "success" | "insufficient_sample" | "methodology_block" | "no_data" | "error";

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

function toTimeWindowInput(kind: string | undefined): TimeWindowInput {
  switch (kind) {
    case "current_year":
      return { kind: "current_year" };
    case "last_3_months":
      return { kind: "last_3_months" };
    case "last_6_months":
      return { kind: "last_6_months" };
    default:
      return { kind: "last_12_months" };
  }
}

function buildQuery(input: BenchmarkFormInput): BenchmarkQuery {
  return {
    platform: input.platform,
    objective: input.objective,
    vertical: input.vertical,
    country: input.country,
    timeWindow: toTimeWindowInput(input.timeWindow),
    audienceStrategy: input.audienceStrategy ?? null,
    funnelStage: input.funnelStage ?? null,
    businessModel: input.businessModel ?? null,
    minAge: input.minAge ?? null,
    maxAge: input.maxAge ?? null,
    genderTargeting: input.genderTargeting ?? null,
    spendBand: input.spendBand ?? null,
    durationBand: input.durationBand ?? null,
    relaxedDimensions: input.relaxedDimensions ?? [],
  };
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
  // Reach's methodology block is distinguishable from a merely-small
  // cohort: the engine returns cohortSampleSize=0 specifically for the
  // "missing/relaxed required scale context" case (see engine.ts
  // getMetricBenchmark's early return before any dataset lookup even
  // runs). A genuinely empty cohort for a non-Reach metric also has
  // cohortSampleSize=0, so the distinction is keyed on metric + the
  // spend/duration precondition, not on the number alone.
  const isReachMethodologyBlock =
    input.metric === "reach" &&
    (!input.spendBand ||
      !input.durationBand ||
      (input.relaxedDimensions ?? []).includes("spend_range") ||
      (input.relaxedDimensions ?? []).includes("duration_band"));

  let status: BenchmarkStatus;
  let message: string | undefined;

  if (isReachMethodologyBlock) {
    status = "methodology_block";
    message = "reach_requires_scale_context";
  } else if (result.sufficientData) {
    status = "success";
  } else if (result.cohortSampleSize === 0) {
    status = "no_data";
    message = "no_matching_datasets";
  } else {
    status = "insufficient_sample";
    message = "sample_below_threshold";
  }

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
