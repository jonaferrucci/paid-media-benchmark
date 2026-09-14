import type { PerformanceLabel } from "@/lib/comparison/classify";

// Only PerformanceLabel (directional classifications) can drive a
// diagnostic rule condition — ContextualPosition (Reach/Frequency)
// deliberately has no place here, per Phase 8 item 9: contextual
// metrics can never independently trigger a diagnosis.

export type MetricCategory = "entrega" | "interaccion" | "conversion" | "rentabilidad";

export interface MetricComparisonInput {
  metric: string;
  status: "success" | "insufficient_sample" | "no_data" | "methodology_block" | "error";
  classification: PerformanceLabel | null; // null unless status === "success" and the metric is directional
  percentDiff: number | null;
  sampleSize: number;
}

export interface DiagnosticRule {
  id: string;
  requiredMetrics: [string, string]; // exactly two metrics, per the approved MVP rule library
  category: MetricCategory;
  // Pure condition check against the two required metrics' classifications.
  matches: (a: PerformanceLabel, b: PerformanceLabel) => boolean;
  observationKey: string;
  interpretationKey: string;
  // Fixed, explicit tie-break order (Priority 4) — never inferred from
  // array/object iteration order.
  order: number;
}

export interface MatchedPattern {
  rule: DiagnosticRule;
  evidence: { metric: string; sampleSize: number }[];
  // The most severe (least favorable) classification among the rule's
  // two required metrics — used for Priority 1 ranking.
  worstClassification: PerformanceLabel;
  worstPercentDiff: number | null; // secondary discriminator within Priority 1
  minSampleSize: number; // Priority 2 — never a pooled/summed sample size
}

export interface DiagnosticResult {
  primary: MatchedPattern | null;
  secondary: MatchedPattern[];
}
