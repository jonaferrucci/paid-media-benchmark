// Pure statistical primitives for the benchmark engine. No Supabase or
// Next.js dependency here on purpose — every function takes plain
// numbers in, returns plain numbers out, so it can be unit-tested with
// nothing but `node` (see scripts/test-benchmark-stats.mjs) and reused
// identically wherever the engine needs a percentile or an outlier
// check.

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Linear-interpolation percentile (the common "R-7" method spreadsheets
// use) — good enough for benchmark P25/P75, not claiming statistical
// research-grade precision.
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export interface DistributionStats {
  median: number;
  mean: number;
  p25: number;
  p75: number;
  sampleSize: number;
}

export function computeDistribution(values: number[]): DistributionStats {
  return {
    median: median(values),
    mean: mean(values),
    p25: percentile(values, 25),
    p75: percentile(values, 75),
    sampleSize: values.length,
  };
}

// IQR outlier flagging (Architecture Freeze V1, Phase 4 — APPROVED).
// Status: DECIDED. Chosen approach, the most conservative of the
// options considered:
//   (a) flag only, never exclude anything — median stays robust on its
//       own and nothing is silently dropped (CHOSEN)
//   (b) flag AND exclude from mean only, keep median on full set
//       (documented as available for a later phase if a mean-based
//       statistic is ever surfaced prominently — not implemented now
//       since mean isn't the headline statistic)
//   (c) flag and exclude from all statistics (REJECTED — this phase's
//       instructions explicitly forbid silently excluding data; median
//       is supposed to absorb outlier risk, not have them removed)
// This function only flags; it never removes anything from the value
// array passed to computeDistribution above.
export function flagOutliers(values: number[]): { flaggedCount: number; flaggedIndices: number[] } {
  if (values.length < 4) return { flaggedCount: 0, flaggedIndices: [] };
  const q1 = percentile(values, 25);
  const q3 = percentile(values, 75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  const flaggedIndices: number[] = [];
  values.forEach((v, i) => {
    if (v < lowerBound || v > upperBound) flaggedIndices.push(i);
  });
  return { flaggedCount: flaggedIndices.length, flaggedIndices };
}
