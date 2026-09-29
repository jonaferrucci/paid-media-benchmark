// CUCURUCHO INTELLIGENCE 5 — DETERMINISTIC INSIGHTS.
//
// A pure interpretation layer over benchmark facts the engine already
// computes and returns — NOT a new statistical engine, NOT generative
// AI. Every function here is deterministic: identical inputs always
// produce identical outputs. This file has zero React, zero Next.js,
// zero Supabase, and no network access — it never fetches or
// recomputes anything; it only reuses the existing canonical
// implementations:
//   - lib/comparison/classify.ts    (classifyPerformance, computePercentDiff,
//     getInsightKey, isContextualPosition) — percentile math and
//     classification boundaries are NEVER redefined here.
//   - lib/benchmark/resultStatus.ts (CohortQueryStatus) — the existing
//     four-state status vocabulary, never a parallel enum.
//   - the historical adjacency/delta rule the caller already computes
//     (app/benchmark/HistoricalBenchmarkSection.tsx's own backward scan
//     over lib/media/trend.ts's computeChange) — this module never
//     bridges a calendar gap or invents a comparison itself.
//
// Output is messageKey + params, never rendered prose — actual copy
// lives in lib/i18n/translations.ts. Market position and historical
// change reuse the EXACT existing translation keys
// (benchmarkLive.insight.*, benchmarkLive.historicalDeltaUp/Down) that
// app/benchmark/ComparisonDetail.tsx and
// app/benchmark/HistoricalBenchmarkSection.tsx already ship — no new
// copy, no third independently-maintained interpretation block. Data
// readiness uses the new benchmarkLive.readinessInsight.* keys added
// alongside this module (see lib/i18n/translations.ts), since no
// full-sentence version of those three statuses existed before.
//
// sourceFacts carries only the aggregate numbers/statuses actually used
// to derive the insight — NEVER a dataset id, owner id, campaign id, or
// raw dataset row. Forbidden vocabulary (no "good/bad", no
// winner/best/worst, no recommendations, no causal "because" claims) is
// enforced by scripts/test-deterministic-insights.mts scanning this
// module's actual output strings/keys — there is no such branch to
// avoid here because none was ever written. A market median increasing
// or decreasing is stated as a plain fact, never as an improvement or
// decline.

import {
  classifyPerformance,
  computePercentDiff,
  getInsightKey,
  isContextualPosition,
  type BenchmarkDirection,
} from "@/lib/comparison/classify";
import type { CohortQueryStatus } from "@/lib/benchmark/resultStatus";

export type InsightType = "market_position" | "data_readiness" | "historical_change";

/**
 * The one typed shape every insight-producing function returns.
 * messageKey resolves through the existing t(key, params) mechanism —
 * this module never returns user-facing prose directly. sourceFacts is
 * for traceability/testing only (never rendered) and is restricted to
 * the aggregate facts actually used — see the file header.
 */
export interface DeterministicInsight {
  type: InsightType;
  metricKey: string;
  messageKey: string;
  params: Record<string, string | number>;
  sourceFacts: Record<string, string | number | boolean | null>;
}

// ---------------------------------------------------------------------
// Market position — only ever derived when the current query's status
// is "success" (see deriveInsightsForMetric's gating below, which
// mirrors the exact same precondition app/benchmark/ComparisonDetail.tsx
// already enforces with its own
// `if (p25 === null || median === null || p75 === null) return null`
// guard). Reuses classifyPerformance/getInsightKey verbatim — this
// function performs zero percentile math and defines zero new
// classification boundaries.
// ---------------------------------------------------------------------

export interface MarketPositionFacts {
  metricKey: string;
  benchmarkDirection: BenchmarkDirection;
  userValue: number;
  p25: number;
  median: number;
  p75: number;
}

export function deriveMarketPositionInsight(facts: MarketPositionFacts): DeterministicInsight {
  const stats = { p25: facts.p25, median: facts.median, p75: facts.p75 };
  const classification = classifyPerformance(facts.userValue, stats, facts.benchmarkDirection);
  const percentDiff = computePercentDiff(facts.userValue, facts.median);
  const insightKey = getInsightKey(facts.benchmarkDirection, classification);

  return {
    type: "market_position",
    metricKey: facts.metricKey,
    // Reuses the EXACT existing translation namespace
    // app/benchmark/ComparisonDetail.tsx already renders via
    // getInsightKey — no new copy, no third interpretation block.
    messageKey: `benchmarkLive.insight.${insightKey}`,
    params: {
      metric: facts.metricKey.toUpperCase(),
      absDiff: percentDiff !== null ? Math.abs(percentDiff).toFixed(1).replace(".", ",") : "",
    },
    sourceFacts: {
      classification,
      contextual: isContextualPosition(classification),
      percentDiff,
      p25: facts.p25,
      median: facts.median,
      p75: facts.p75,
      userValue: facts.userValue,
      benchmarkDirection: facts.benchmarkDirection,
    },
  };
}

/**
 * The short "Observación" restatement (value vs. median, plain
 * percentage) is a presentation of the same comparison, not a second
 * interpretation. This is the exact ternary that used to live inline in
 * ComparisonDetail.tsx, now a pure, independently testable function
 * instead of JSX branching. Contextual metrics (Reach, Frequency) and a
 * zero-median percentDiff (null) both fall back to the plain
 * value-only phrasing, exactly as before — behavior is unchanged, only
 * its location moved.
 */
export function resolveObservationMessageKey(contextual: boolean, percentDiff: number | null): string {
  if (contextual || percentDiff === null) return "benchmarkLive.observationContextual";
  return percentDiff >= 0 ? "benchmarkLive.observationAbove" : "benchmarkLive.observationBelow";
}

// ---------------------------------------------------------------------
// Data readiness — one of the three non-success CohortQueryStatus
// values. Reuses the existing status vocabulary from
// lib/benchmark/resultStatus.ts; never a parallel enum. Returns null
// for "success" defensively — the primary contract is
// deriveInsightsForMetric's own `benchmarkStatus !== "success"` gate,
// which never calls this function at all in that case.
// ---------------------------------------------------------------------

export interface DataReadinessFacts {
  metricKey: string;
  benchmarkStatus: CohortQueryStatus;
}

export function deriveDataReadinessInsight(facts: DataReadinessFacts): DeterministicInsight | null {
  if (facts.benchmarkStatus === "success") return null;
  return {
    type: "data_readiness",
    metricKey: facts.metricKey,
    messageKey: `benchmarkLive.readinessInsight.${facts.benchmarkStatus}`,
    params: { metric: facts.metricKey.toUpperCase() },
    sourceFacts: { benchmarkStatus: facts.benchmarkStatus },
  };
}

// ---------------------------------------------------------------------
// Historical change — the caller (app/benchmark/HistoricalBenchmarkSection.tsx)
// already computes the one safe, adjacency-respecting delta via its own
// backward scan (lib/media/trend.ts's computeChange, zero-median
// guarded) — this function never recomputes that scan or bridges a gap
// itself; it only shapes an already-computed delta into a typed
// insight, or returns null when the caller found no adjacent comparable
// successful period (never inventing a comparison in that case, per the
// approved spec).
// ---------------------------------------------------------------------

export interface HistoricalChangeFacts {
  metricKey: string;
  // null = no adjacent comparable successful period was found (the
  // caller's own responsibility to determine). percent is always the
  // non-negative magnitude; direction is carried separately in
  // `increased`, exactly matching the existing historicalDeltaUp/Down
  // convention (never a signed number alongside "aumentó"/"disminuyó").
  delta: { increased: boolean; percent: number } | null;
}

export function deriveHistoricalChangeInsight(facts: HistoricalChangeFacts): DeterministicInsight | null {
  if (facts.delta === null) return null;
  const { increased, percent } = facts.delta;
  return {
    type: "historical_change",
    metricKey: facts.metricKey,
    // Reuses the EXACT existing historicalDeltaUp/Down keys already
    // shipped in HistoricalBenchmarkSection.tsx — no new copy.
    messageKey: increased ? "benchmarkLive.historicalDeltaUp" : "benchmarkLive.historicalDeltaDown",
    params: { percent: Math.abs(percent).toFixed(1).replace(".", ",") },
    sourceFacts: { increased, percent },
  };
}

// ---------------------------------------------------------------------
// Precedence + composition.
// ---------------------------------------------------------------------

const READINESS_RANK: Record<string, number> = {
  methodology_block: 0,
  no_data: 1,
  insufficient_sample: 2,
};

function insightRank(insight: DeterministicInsight): number {
  if (insight.type === "data_readiness") {
    const status = String(insight.sourceFacts.benchmarkStatus);
    return READINESS_RANK[status] ?? 2;
  }
  if (insight.type === "market_position") return 3;
  return 4; // historical_change
}

export const MAX_VISIBLE_INSIGHTS_PER_METRIC = 2;

/**
 * Deterministic precedence: methodology_block > no_data >
 * insufficient_sample > market_position > historical_change.
 * Array.prototype.sort is a stable sort per spec, so identical-rank
 * insights never reorder between calls with the same input. Truncates
 * to MAX_VISIBLE_INSIGHTS_PER_METRIC — never more than 2 insights for
 * one metric, even if more candidates were passed in.
 */
export function selectVisibleInsights(candidates: (DeterministicInsight | null)[]): DeterministicInsight[] {
  const real = candidates.filter((insight): insight is DeterministicInsight => insight !== null);
  return [...real].sort((a, b) => insightRank(a) - insightRank(b)).slice(0, MAX_VISIBLE_INSIGHTS_PER_METRIC);
}

export interface DeriveInsightsInput {
  metricKey: string;
  benchmarkDirection: BenchmarkDirection;
  benchmarkStatus: CohortQueryStatus;
  userValue: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  // undefined = the caller never ran a historical query at all (e.g.
  // the disclosure was never opened) — no historical candidate is
  // produced in that case, distinct from `null` (the query ran, but no
  // adjacent comparable period was found).
  historicalDelta?: { increased: boolean; percent: number } | null;
}

/**
 * The one composition entry point most callers should use. Market
 * position is only ever derived when benchmarkStatus === "success" AND
 * every statistic is present — otherwise a data-readiness insight is
 * derived instead. The two are mutually exclusive by construction, so
 * "redundant insights saying the same thing" cannot occur between them.
 * Historical change is independent (it describes the market's own
 * history, not the current query's outcome) and can appear alongside
 * either one, subject to the 2-insight cap.
 */
export function deriveInsightsForMetric(input: DeriveInsightsInput): DeterministicInsight[] {
  const candidates: (DeterministicInsight | null)[] = [];

  if (input.benchmarkStatus !== "success") {
    candidates.push(deriveDataReadinessInsight({ metricKey: input.metricKey, benchmarkStatus: input.benchmarkStatus }));
  } else if (input.userValue !== null && input.p25 !== null && input.median !== null && input.p75 !== null) {
    candidates.push(
      deriveMarketPositionInsight({
        metricKey: input.metricKey,
        benchmarkDirection: input.benchmarkDirection,
        userValue: input.userValue,
        p25: input.p25,
        median: input.median,
        p75: input.p75,
      })
    );
  }

  if (input.historicalDelta !== undefined) {
    candidates.push(deriveHistoricalChangeInsight({ metricKey: input.metricKey, delta: input.historicalDelta }));
  }

  return selectVisibleInsights(candidates);
}
