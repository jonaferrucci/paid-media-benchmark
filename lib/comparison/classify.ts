// Phase 6 — pure comparison logic. Deliberately has zero dependency on
// Supabase, Next.js, or the benchmark engine's internals: it only
// consumes the BenchmarkResponse shape the engine already returns
// (p25/median/p75/direction/unit), never recomputes or second-guesses
// any of those numbers. This file is the single place classification
// decisions are made — components must call into here rather than
// re-deriving "is this good or bad" locally, per the instruction not
// to duplicate metric directionality logic across the UI.

export type BenchmarkDirection = "lower_is_better" | "higher_is_better" | "contextual";

export type PerformanceLabel = "muy_competitivo" | "competitivo" | "por_debajo_del_benchmark" | "requiere_atencion";

export type ContextualPosition = "por_debajo_del_rango" | "dentro_del_rango" | "por_encima_del_rango";

export interface ComparisonStats {
  p25: number;
  median: number;
  p75: number;
}

/**
 * Percentage difference of the user's value vs. the benchmark median.
 * Guards the one real division-by-zero case (median === 0, which is
 * possible in principle for a metric like CPA if every campaign in a
 * cohort had zero cost-per-action — not expected in practice, but the
 * function must not throw or return Infinity/NaN if it happens).
 * Returns null when undefined, meaning the UI shows the raw values
 * without a percentage delta rather than a fabricated number.
 */
export function computePercentDiff(userValue: number, median: number): number | null {
  if (!Number.isFinite(userValue) || !Number.isFinite(median)) return null;
  if (median === 0) return null;
  return ((userValue - median) / median) * 100;
}

/**
 * Classifies a user's result against the cohort's P25/Median/P75,
 * combined with the metric's existing `benchmark_direction` (read from
 * the `metrics` table via the engine — never redefined here). For
 * `contextual` metrics (Reach, Frequency), returns a purely descriptive
 * range position instead of a performance judgment — this function
 * never returns a PerformanceLabel for a contextual metric, by
 * construction, so no caller can accidentally apply "good/bad" framing
 * to Reach.
 */
export function classifyPerformance(
  userValue: number,
  stats: ComparisonStats,
  direction: BenchmarkDirection
): PerformanceLabel | ContextualPosition {
  const { p25, median, p75 } = stats;

  if (direction === "contextual") {
    if (userValue < p25) return "por_debajo_del_rango";
    if (userValue > p75) return "por_encima_del_rango";
    return "dentro_del_rango";
  }

  if (direction === "lower_is_better") {
    if (userValue <= p25) return "muy_competitivo";
    if (userValue <= median) return "competitivo";
    if (userValue <= p75) return "por_debajo_del_benchmark";
    return "requiere_atencion";
  }

  // higher_is_better
  if (userValue >= p75) return "muy_competitivo";
  if (userValue >= median) return "competitivo";
  if (userValue > p25) return "por_debajo_del_benchmark";
  return "requiere_atencion";
}

export function isContextualPosition(label: PerformanceLabel | ContextualPosition): label is ContextualPosition {
  return label === "por_debajo_del_rango" || label === "dentro_del_rango" || label === "por_encima_del_rango";
}

/**
 * Where the user's marker should sit on a 0-100 track that represents
 * the P25-P75 band as a fixed, always-legible middle portion (30%-70%
 * of the track, matching the range-bar component). Values outside
 * P25-P75 are clamped to sit clearly outside that band (in the 0-30%
 * or 70-100% zones) rather than being squeezed inside it — an
 * out-of-range result must never render as if it were in-range.
 */
export function computeMarkerPosition(userValue: number, stats: ComparisonStats): number {
  const { p25, median, p75 } = stats;
  const BAND_START = 30;
  const BAND_END = 70;
  const iqr = p75 - p25;

  if (userValue < p25) {
    if (iqr <= 0) return 10; // no spread to scale against — just sit clearly left of the band
    const distanceRatio = Math.min(1, (p25 - userValue) / iqr);
    return BAND_START - distanceRatio * BAND_START;
  }
  if (userValue > p75) {
    if (iqr <= 0) return 90; // no spread to scale against — just sit clearly right of the band
    const distanceRatio = Math.min(1, (userValue - p75) / iqr);
    return BAND_END + distanceRatio * (100 - BAND_END);
  }
  // Inside P25-P75: linear position within the fixed 30-70 zone.
  if (p75 === p25) return (BAND_START + BAND_END) / 2;
  return BAND_START + ((userValue - p25) / (p75 - p25)) * (BAND_END - BAND_START);
}

export type MetricUnitType = "currency" | "percentage" | "multiplier" | "count";

/**
 * Formats a raw numeric metric value using the metric's existing
 * `unit_type` (from the `metrics` table) — never a per-metric special
 * case hardcoded in a component. Always 2 decimal places for currency
 * and multiplier, matching how these values already render elsewhere
 * in the app (e.g. the existing result card).
 */
export function formatMetricValue(value: number, unitType: string): string {
  if (!Number.isFinite(value)) return "\u2014";
  switch (unitType as MetricUnitType) {
    case "currency":
      return value.toFixed(2);
    case "percentage":
      return `${value.toFixed(2)}%`;
    case "multiplier":
      return `${value.toFixed(2)}x`;
    case "count":
    default:
      return Math.round(value).toLocaleString();
  }
}

export function formatPercentDiff(diff: number | null): string {
  if (diff === null) return "\u2014";
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)}%`;
}

/**
 * Resolves the deterministic i18n key for the insight sentence, given
 * only the metric's direction and the already-computed classification.
 * This is a pure lookup table, not text generation — the actual
 * sentences live in lib/i18n/translations.ts (`contribute.insight.*`,
 * despite the namespace name — see BenchmarkExplorer.tsx) and get
 * filled in via the existing t(key, vars) substitution mechanism with
 * {metric}/{platform}/{objective}/{vertical}/{country}/{absDiff}.
 */
export function getInsightKey(
  direction: BenchmarkDirection,
  classification: PerformanceLabel | ContextualPosition
): string {
  if (direction === "contextual") {
    if (classification === "por_debajo_del_rango") return "contextual_debajo";
    if (classification === "por_encima_del_rango") return "contextual_encima";
    return "contextual_dentro";
  }
  const prefix = direction === "lower_is_better" ? "lower" : "higher";
  return `${prefix}_${classification}`;
}
