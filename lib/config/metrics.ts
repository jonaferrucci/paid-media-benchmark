import { BenchmarkDirection, MetricKey } from "@/lib/types";

// Mirrors the conceptual `metrics` table fields unit_type and
// benchmark_direction from 06-DATABASE-AND-SUPABASE-ARCHITECTURE.md.
// Frequency and Reach are intentionally "contextual" — the UI must never
// auto-color them as good/bad (07-BENCHMARK-ENGINE-AND-STATISTICAL-RULES.md).
export const METRIC_UNIT: Record<MetricKey, "currency" | "percentage" | "multiplier" | "count"> = {
  cpm: "currency",
  ctr: "percentage",
  cpc: "currency",
  reach: "count",
  frequency: "multiplier",
  cpv: "currency",
  vtr: "percentage",
  impressions: "count",
  engagement_rate: "percentage",
  cpe: "currency",
  cpa: "currency",
  conversion_rate: "percentage",
  roas: "multiplier",
  cpl: "currency",
};

export const METRIC_DIRECTION: Record<MetricKey, BenchmarkDirection> = {
  cpm: "lower_is_better",
  ctr: "higher_is_better",
  cpc: "lower_is_better",
  reach: "contextual",
  frequency: "contextual",
  cpv: "lower_is_better",
  vtr: "higher_is_better",
  impressions: "contextual",
  engagement_rate: "higher_is_better",
  cpe: "lower_is_better",
  cpa: "lower_is_better",
  conversion_rate: "higher_is_better",
  roas: "higher_is_better",
  cpl: "lower_is_better",
};
