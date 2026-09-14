import type { RelaxableDimension } from "./cohortRules";

export type BenchmarkStatistic = "median";

export interface CohortDescriptor {
  platform: string;
  objective: string;
  vertical: string;
  country: string;
  audienceStrategy: string | null;
  funnelStage: string | null;
  businessModel: string | null;
  timeWindow: string;
  // Only populated when actively used as a cohort dimension (not
  // merely a Reach-required parameter that was later relaxed away).
  // Never exposes raw spend values — band labels only.
  spendBand: string | null;
  durationBand: string | null;
}

export interface BenchmarkResult {
  metric: string;
  statistic: BenchmarkStatistic;
  value: number | null;
  unit: string;
  // Existing metrics.benchmark_direction metadata, exposed as-is for
  // Phase 6's presentation-layer comparison — never computed here,
  // never a new statistical concept. See lib/comparison/classify.ts.
  benchmarkDirection: "lower_is_better" | "higher_is_better" | "contextual";
  p25: number | null;
  p75: number | null;
  mean: number | null;
  metricSampleSize: number;
  cohortSampleSize: number;
  cohort: CohortDescriptor;
  metricDefinitionVariantId: string | null;
  relaxedDimensions: RelaxableDimension[];
  sufficientData: boolean;
  outlierFlaggedCount: number;
  freshness: {
    start: string | null; // earliest contributing dataset start_date
    end: string | null; // latest contributing dataset end_date
    generatedAt: string; // when this result was computed
  };
}

// A benchmark request. Protected dimensions (platform/vertical/
// timeWindow/country/objective) are required; everything else is
// optional and, if present, is treated as an exact-match cohort
// dimension unless explicitly relaxed via relaxedDimensions.
export interface BenchmarkQuery {
  platform: string;
  objective: string;
  vertical: string;
  country: string;
  timeWindow: TimeWindowInput;
  audienceStrategy?: string | null;
  funnelStage?: string | null;
  businessModel?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  genderTargeting?: string | null;
  campaignTypeId?: string | null;
  spendBand?: string | null;
  durationBand?: string | null;
  // Explicit relaxations already applied by a prior suggestion — the
  // engine treats these dimensions as unset regardless of whether a
  // value was also passed above (relaxation wins, and is always
  // explicit, never inferred).
  relaxedDimensions?: RelaxableDimension[];
}

export type TimeWindowInput =
  | { kind: "current_year" }
  | { kind: "last_3_months" }
  | { kind: "last_6_months" }
  | { kind: "last_12_months" }
  | { kind: "custom"; startDate: string; endDate: string };

export interface MatrixCellResult {
  verticalKey: string;
  audienceStrategyKey: string;
  value: number | null;
  sampleSize: number;
  sufficientData: boolean;
}

export interface MatrixQuery {
  platform: string;
  objective: string;
  country: string;
  timeWindow: TimeWindowInput;
  metric: string;
}

export interface RelatedBenchmarkSuggestion {
  label: string; // e.g. "same vertical, different audience"
  query: BenchmarkQuery;
  sampleSize: number;
}

export interface TrendPoint {
  period: string; // "YYYY-MM"
  value: number | null;
  sampleSize: number;
  sufficientData: boolean;
}
