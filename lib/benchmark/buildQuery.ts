// HISTORICAL BENCHMARKS ARCHITECTURE.
//
// buildQuery (and the BenchmarkFormInput -> TimeWindowInput mapping it
// depends on) used to live as a private, non-exported helper inside
// app/benchmark/actions.ts. Extracting it here — rather than simply
// exporting it from actions.ts — is required, not a style choice:
// actions.ts has a top-level "use server" directive, and Next.js's
// Server Actions compiler requires every EXPORTED binding from a
// "use server" file to be an async function (confirmed by `npm run
// build`: "Server actions must be async functions" the moment
// buildQuery was exported directly from actions.ts). buildQuery itself
// does no I/O and has no reason to be an async function or a callable
// action, so it belongs in a plain module instead.
//
// app/benchmark/actions.ts still imports and uses buildQuery internally
// for the live single-query path; app/benchmark/historicalActions.ts
// imports it directly from here for the per-period historical loop.
// Both call the exact same function — there is still only ONE
// BenchmarkFormInput -> BenchmarkQuery mapping in the codebase, just no
// longer physically defined inside the "use server" file.

import type { BenchmarkQuery, TimeWindowInput } from "./types";
import type { RelaxableDimension } from "./cohortRules";

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

/**
 * The ONE BenchmarkFormInput -> BenchmarkQuery mapping in the codebase.
 * The historical per-period loop (lib/benchmark/engine.ts's
 * getHistoricalBenchmark, invoked via historicalActions.ts) only ever
 * overrides the resulting `timeWindow` per period afterward — every
 * other field is this same, unchanged mapping, so a filter set on the
 * live form can never silently fail to reach a historical period query.
 */
export function buildQuery(input: BenchmarkFormInput): BenchmarkQuery {
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
