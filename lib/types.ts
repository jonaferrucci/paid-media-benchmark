// Core domain types for the Paid Media Benchmark prototype.
// These mirror the dimensions approved in the project documentation
// (02-DATA-DIMENSIONS-AND-TAXONOMIES.md, 07-BENCHMARK-ENGINE-AND-STATISTICAL-RULES.md).
// This file has no dependency on Supabase or any backend — it is the
// shared contract between the mock data layer and the UI, so the mock
// provider can later be swapped for real benchmark queries without
// changing component props.

export type Platform =
  | "meta_ads"
  | "google_ads"
  | "tiktok_ads"
  | "mercado_libre_ads"
  | "pinterest_ads"
  | "dsp_programmatic";

export type TimeWindow =
  | "current_year"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months"
  | "custom";

export type Objective =
  | "awareness"
  | "reach"
  | "traffic"
  | "video_views"
  | "engagement"
  | "sales"
  | "leads";

export type AudienceStrategy =
  | "broad"
  | "interest_based"
  | "lookalike"
  | "remarketing"
  | "customer_list"
  | "automated_algorithmic";

export type FunnelStage =
  | "prospecting"
  | "consideration"
  | "remarketing"
  | "retention";

export type MetricKey =
  | "cpm"
  | "ctr"
  | "cpc"
  | "reach"
  | "frequency"
  | "cpv"
  | "vtr"
  | "impressions"
  | "engagement_rate"
  | "cpe"
  | "cpa"
  | "conversion_rate"
  | "roas"
  | "cpl";

export type BenchmarkDirection = "lower_is_better" | "higher_is_better" | "contextual";

export type SpendBand =
  | "under_500"
  | "500_2000"
  | "2000_10000"
  | "10000_50000"
  | "50000_100000"
  | "100000_plus";

export type DurationBand = "1_7" | "8_14" | "15_30" | "31_60" | "61_90" | "91_180" | "181_365" | "365_plus";

// Vertical is a controlled, protected dimension — never free text, never
// silently relaxed by the benchmark engine.
export interface Vertical {
  id: string;
  label: string;
}

// The active cohort selection. Vertical and Audience are deliberately
// modeled as independent fields, per the Vertical + Audience core rule.
export interface CohortFilters {
  platform: Platform;
  country: string; // ISO country code
  timeWindow: TimeWindow;
  verticalId: string;
  objective: Objective;
  audienceStrategy: AudienceStrategy | null;
  funnelStage: FunnelStage | null;
  minAge: number | null;
  maxAge: number | null;
  campaignType: string | null;
  spendBand: SpendBand | null;
  durationBand: DurationBand | null;
}

export interface KPIResult {
  metric: MetricKey;
  label: string;
  unit: "currency" | "percentage" | "multiplier" | "count";
  direction: BenchmarkDirection;
  yourValue: number | null;
  median: number;
  p25: number;
  p75: number;
  percentile: number | null; // Your position within the distribution, 0-100
  sampleSize: number;
  previousPeriodMedian: number | null;
  insufficientData: boolean;
}

export interface ReachBenchmark {
  yourReach: number;
  cohortMedianReach: number;
  frequency: number;
  spendBandLabel: string;
  durationBandLabel: string;
  sampleSize: number;
  insufficientData: boolean;
}

export interface TrendPoint {
  period: string; // e.g. "2026-01"
  value: number;
}

export interface DistributionPoint {
  label: string;
  value: number;
}

export interface VerticalComparisonPoint {
  verticalId: string;
  verticalLabel: string;
  value: number;
  sampleSize: number;
}

export interface AudienceComparisonPoint {
  audienceStrategy: AudienceStrategy;
  label: string;
  value: number;
  sampleSize: number;
}

export interface MatrixCell {
  verticalId: string;
  audienceStrategy: AudienceStrategy;
  value: number | null;
  sampleSize: number;
  insufficientData: boolean;
}

// A relaxation step the engine could offer when the exact cohort is
// below the minimum sample threshold. Dimensions are relaxed one at a
// time, in the approved order — never silently.
export interface RelaxationOption {
  label: string;
  description: string;
  resultingSampleSize: number;
}

export interface CohortStep {
  key: "platform" | "country" | "vertical" | "objective" | "audience" | "funnel" | "age";
  sampleSize: number;
  ageRange?: string;
}
