// Cohort dimension rules — Architecture Freeze V1, unchanged by this
// phase. Mirrors benchmark_settings seed rows (0006_benchmark_settings.sql)
// exactly; if that table's values are ever edited, this file's
// defaults should be updated to match (a future phase could load these
// from benchmark_settings at runtime instead of hardcoding them here —
// noted as a known limitation, not implemented this phase to avoid
// over-engineering the MVP).

export type RelaxableDimension =
  | "age"
  | "gender"
  | "funnel_stage"
  | "audience_strategy"
  | "campaign_type"
  | "spend_range"
  | "duration_band";

// Approved order — relax one at a time, in this sequence.
export const RELAXATION_ORDER: RelaxableDimension[] = [
  "age",
  "gender",
  "funnel_stage",
  "audience_strategy",
  "campaign_type",
  "spend_range",
  "duration_band",
];

// Never relaxed automatically. Objective requires explicit user action
// to broaden even in a future version; Country is protected by default
// but not architected here as configurable-off, per the MVP scope.
export const PROTECTED_DIMENSIONS = ["platform", "vertical", "time_window", "country", "objective"] as const;

// Business Model (Phase 4 item 7): available as an optional cohort
// filter, but NOT added to the relaxation hierarchy in this phase.
// If a query includes it, it behaves like a protected dimension in the
// sense that this engine never relaxes it automatically — but it is
// also never REQUIRED, unlike platform/vertical/etc.

export const DEFAULT_MINIMUM_SAMPLE_SIZE = 10;

export interface CohortDimensions {
  platform: string;
  vertical: string;
  timeWindow: string;
  country: string;
  objective: string;
  businessModel?: string | null;
  age?: string | null;
  gender?: string | null;
  funnelStage?: string | null;
  audienceStrategy?: string | null;
  campaignType?: string | null;
  spendRange?: string | null;
  durationBand?: string | null;
}

const DIMENSION_KEY_MAP: Record<RelaxableDimension, keyof CohortDimensions> = {
  age: "age",
  gender: "gender",
  funnel_stage: "funnelStage",
  audience_strategy: "audienceStrategy",
  campaign_type: "campaignType",
  spend_range: "spendRange",
  duration_band: "durationBand",
};

export interface RelaxationSuggestion {
  dimension: RelaxableDimension;
  relaxedFilters: CohortDimensions;
  estimatedSampleSize: number;
}

/**
 * Given the current (insufficient) cohort and a way to count how many
 * observations a candidate cohort would have, walk the approved
 * relaxation order and return the FIRST viable single-step relaxation
 * (the one that both (a) actually removes a currently-set dimension
 * and (b) is estimated to clear the minimum threshold). Only ever
 * relaxes one dimension at a time — never chains multiple steps into
 * one suggestion, and never applies anything automatically. The
 * caller (a route/action) presents this as an explicit user choice.
 */
export function suggestRelaxation(
  filters: CohortDimensions,
  countSampleSize: (candidate: CohortDimensions) => number,
  minimumSampleSize: number = DEFAULT_MINIMUM_SAMPLE_SIZE
): RelaxationSuggestion | null {
  for (const dimension of RELAXATION_ORDER) {
    const key = DIMENSION_KEY_MAP[dimension];
    if (!filters[key]) continue; // nothing set on this dimension to relax

    const relaxedFilters: CohortDimensions = { ...filters, [key]: null };
    const estimatedSampleSize = countSampleSize(relaxedFilters);
    if (estimatedSampleSize >= minimumSampleSize) {
      return { dimension, relaxedFilters, estimatedSampleSize };
    }
  }
  return null;
}

/**
 * Returns every viable single-step relaxation (not just the first),
 * in approved order, so a UI could offer more than one option if
 * useful. Each entry is independently computed from the ORIGINAL
 * filters — these are alternatives, not a chain.
 */
export function suggestAllRelaxations(
  filters: CohortDimensions,
  countSampleSize: (candidate: CohortDimensions) => number,
  minimumSampleSize: number = DEFAULT_MINIMUM_SAMPLE_SIZE
): RelaxationSuggestion[] {
  const suggestions: RelaxationSuggestion[] = [];
  for (const dimension of RELAXATION_ORDER) {
    const key = DIMENSION_KEY_MAP[dimension];
    if (!filters[key]) continue;
    const relaxedFilters: CohortDimensions = { ...filters, [key]: null };
    const estimatedSampleSize = countSampleSize(relaxedFilters);
    if (estimatedSampleSize >= minimumSampleSize) {
      suggestions.push({ dimension, relaxedFilters, estimatedSampleSize });
    }
  }
  return suggestions;
}
