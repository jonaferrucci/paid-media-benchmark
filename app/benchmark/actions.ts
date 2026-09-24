"use server";

import { getMetricBenchmark, suggestCohortRelaxation } from "@/lib/benchmark/engine";
import type { BenchmarkQuery, BenchmarkResult } from "@/lib/benchmark/types";
import { buildQuery, type BenchmarkFormInput } from "@/lib/benchmark/buildQuery";
import { toResponse, requestedCohort, type BenchmarkResponse, type BenchmarkStatus } from "@/lib/benchmark/responseShape";

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

// CUCURUCHO INTELLIGENCE 2 (§10): BenchmarkStatus/BenchmarkResponse and
// the toResponse()/requestedCohort() shaping functions now live in
// lib/benchmark/responseShape.ts, for the exact same reason buildQuery
// was extracted during Historical Benchmarks — toResponse is a plain,
// synchronous function, and this file's top-level "use server"
// directive means Next.js's Server Actions compiler would reject
// exporting it directly (every exported binding from a "use server"
// file must be an async function). Campaign Explorer's page.tsx (a
// Server Component, not a "use server" file) needs this exact same
// shaping so its own market-comparison rows can never drift from what
// /benchmark itself would show for the same query — see that file's
// own comment. Type-only re-exports below are erased at compile time
// (never a runtime action reference), so every existing import of
// BenchmarkResponse/BenchmarkStatus from "./actions" keeps working
// unchanged.
export type { BenchmarkStatus, BenchmarkResponse };

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
