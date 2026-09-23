// Phase 38 (release-candidate cleanup) note: this file is the Phase 1
// prototype's fabricated-number generator. It was already fully
// disconnected from production by Phase 29 (see app/page.tsx's PHASE
// 29 comment) — no route, layout, or production component reaches it.
// Its last remaining consumers in this repo (GlobalInsights, MiniTrend,
// FeaturedModules, ExploreMarket, MetricTrendChart,
// VerticalAudienceMatrix, VerticalComparisonChart,
// AudienceComparisonChart, DistributionChart) were themselves
// completely orphaned — imported by nothing outside their own mutual
// cluster — and were deleted in Phase 38. This file (and
// lib/mock/random.ts) is intentionally left in place, unlike those
// components, because scripts/test-phase30-home-discovery-taxonomy.mts
// asserts it still exists on disk (a Phase 30 "verify unreachability,
// don't delete" regression) — deleting it would break a passing test
// for no product benefit. lib/mock/taxonomies.ts is a different,
// still-actively-used file (real static reference vocabulary, not a
// number generator) and is untouched.
import {
  CohortFilters,
  CohortStep,
  DistributionPoint,
  KPIResult,
  MatrixCell,
  MetricKey,
  ReachBenchmark,
  TrendPoint,
  AudienceComparisonPoint,
  VerticalComparisonPoint,
} from "@/lib/types";
import { seededRandom, randomInRange, randomIntInRange } from "@/lib/mock/random";
import { AUDIENCE_STRATEGIES, VERTICALS, VERTICALS_WITH_DATA } from "@/lib/mock/taxonomies";
import { METRIC_DIRECTION, METRIC_UNIT } from "@/lib/config/metrics";
import { METRIC_LABELS } from "@/lib/config/objectiveKpis";

// ---------------------------------------------------------------------------
// MOCK DATA LAYER
//
// Everything in this file produces fabricated but internally-consistent
// numbers. Nothing here should be mistaken for real benchmark output —
// production data will come from the benchmark engine described in
// 07-BENCHMARK-ENGINE-AND-STATISTICAL-RULES.md. Components should only
// ever import from this module (or a future real equivalent with the
// same function signatures) — never generate ad hoc numbers themselves.
// ---------------------------------------------------------------------------

export const MIN_SAMPLE_SIZE = 10;

// Approximate realistic ranges per metric, used only to keep mock output
// plausible. These are not derived from any real dataset.
const METRIC_RANGE: Record<MetricKey, [number, number]> = {
  cpm: [2.2, 9.5],
  ctr: [0.6, 2.8],
  cpc: [0.08, 0.65],
  reach: [120000, 900000],
  frequency: [1.4, 4.8],
  cpv: [0.015, 0.11],
  vtr: [22, 58],
  impressions: [800000, 6500000],
  engagement_rate: [0.8, 6.5],
  cpe: [0.03, 0.32],
  cpa: [8, 45],
  conversion_rate: [1, 8],
  roas: [1.5, 6.5],
  cpl: [3, 25],
};

function cohortSeed(filters: CohortFilters, extra = ""): string {
  return [
    filters.platform,
    filters.country,
    filters.timeWindow,
    filters.verticalId,
    filters.objective,
    filters.audienceStrategy ?? "any",
    filters.funnelStage ?? "any",
    filters.minAge ?? "any",
    filters.maxAge ?? "any",
    filters.spendBand ?? "any",
    filters.durationBand ?? "any",
    extra,
  ].join("|");
}

// Fewer active narrowing dimensions => larger base sample. Each applied
// filter shrinks the sample, and verticals without seeded mock data
// shrink it drastically — simulating a real "not enough contributions
// yet" scenario rather than hiding the case.
function estimateSampleSize(filters: CohortFilters, extra = ""): number {
  const rand = seededRandom(cohortSeed(filters, extra));
  let base = 1800;

  if (!VERTICALS_WITH_DATA.has(filters.verticalId)) {
    return randomIntInRange(rand, 0, 4);
  }

  base *= 0.5; // country narrows
  base *= 0.42; // vertical narrows
  if (filters.objective) base *= 0.6;
  if (filters.audienceStrategy) base *= 0.42;
  if (filters.funnelStage) base *= 0.62;
  if (filters.minAge !== null || filters.maxAge !== null) base *= 0.32;
  if (filters.spendBand) base *= 0.55;
  if (filters.durationBand) base *= 0.7;

  const jitter = randomInRange(rand, 0.85, 1.15);
  return Math.max(0, Math.round(base * jitter));
}

export function getCohortSteps(filters: CohortFilters): CohortStep[] {
  const steps: CohortStep[] = [];
  steps.push({ key: "platform", sampleSize: 1842 });

  const withCountry = { ...filters };
  steps.push({ key: "country", sampleSize: estimateSampleSize(withCountry, "step-country") });

  steps.push({
    key: "vertical",
    sampleSize: estimateSampleSize(filters, "step-vertical"),
  });

  if (filters.objective) {
    steps.push({
      key: "objective",
      sampleSize: estimateSampleSize(filters, "step-objective"),
    });
  }
  if (filters.audienceStrategy) {
    steps.push({
      key: "audience",
      sampleSize: estimateSampleSize(filters, "step-audience"),
    });
  }
  if (filters.funnelStage) {
    steps.push({
      key: "funnel",
      sampleSize: estimateSampleSize(filters, "step-funnel"),
    });
  }
  if (filters.minAge !== null || filters.maxAge !== null) {
    steps.push({
      key: "age",
      ageRange: `${filters.minAge ?? ""}–${filters.maxAge ?? ""}`,
      sampleSize: estimateSampleSize(filters, "step-age"),
    });
  }

  return steps;
}

export function getKpiResults(filters: CohortFilters, metrics: MetricKey[]): KPIResult[] {
  return metrics.map((metric) => {
    const seed = cohortSeed(filters, metric);
    const rand = seededRandom(seed);
    const [min, max] = METRIC_RANGE[metric];
    const sampleSize = estimateSampleSize(filters, metric);
    const insufficientData = sampleSize < MIN_SAMPLE_SIZE;

    const median = randomInRange(rand, min, max);
    const spread = (max - min) * 0.18;
    const p25Raw = median - spread;
    const p75Raw = median + spread;
    const p25 = Math.min(p25Raw, p75Raw);
    const p75 = Math.max(p25Raw, p75Raw);

    const yourValue = insufficientData ? null : randomInRange(rand, p25 * 0.85, p75 * 1.15);
    const percentile =
      yourValue === null ? null : Math.round(randomInRange(rand, 8, 96));

    const previousPeriodMedian = insufficientData
      ? null
      : median * randomInRange(rand, 0.9, 1.08);

    return {
      metric,
      label: METRIC_LABELS[metric],
      unit: METRIC_UNIT[metric],
      direction: METRIC_DIRECTION[metric],
      yourValue,
      median,
      p25,
      p75,
      percentile,
      sampleSize,
      previousPeriodMedian,
      insufficientData,
    };
  });
}

export function getReachBenchmark(filters: CohortFilters): ReachBenchmark {
  // Reach requires Spend Range + Duration Band as mandatory cohort
  // dimensions before any direct comparison is produced
  // (07-BENCHMARK-ENGINE-AND-STATISTICAL-RULES.md — Reach section).
  const effectiveFilters: CohortFilters = {
    ...filters,
    spendBand: filters.spendBand ?? "2000_10000",
    durationBand: filters.durationBand ?? "15_30",
  };
  const rand = seededRandom(cohortSeed(effectiveFilters, "reach"));
  const sampleSize = estimateSampleSize(effectiveFilters, "reach");
  const insufficientData = sampleSize < MIN_SAMPLE_SIZE;

  const cohortMedianReach = randomInRange(rand, 250000, 650000);
  const yourReach = insufficientData ? 0 : cohortMedianReach * randomInRange(rand, 0.78, 1.28);
  const [freqMin, freqMax] = METRIC_RANGE.frequency;
  const frequency = randomInRange(rand, freqMin, freqMax);

  const spendLabels: Record<string, string> = {
    under_500: "Under USD 500 / month",
    "500_2000": "USD 500–2,000 / month",
    "2000_10000": "USD 2,000–10,000 / month",
    "10000_50000": "USD 10,000–50,000 / month",
    "50000_100000": "USD 50,000–100,000 / month",
    "100000_plus": "USD 100,000+ / month",
  };
  const durationLabels: Record<string, string> = {
    "1_7": "1–7 days",
    "8_14": "8–14 days",
    "15_30": "15–30 days",
    "31_60": "31–60 days",
    "61_90": "61–90 days",
    "91_180": "91–180 days",
    "181_365": "181–365 days",
  };

  return {
    yourReach,
    cohortMedianReach,
    frequency,
    spendBandLabel: spendLabels[effectiveFilters.spendBand ?? "2000_10000"],
    durationBandLabel: durationLabels[effectiveFilters.durationBand ?? "15_30"],
    sampleSize,
    insufficientData,
  };
}

export function getTrend(filters: CohortFilters, metric: MetricKey): TrendPoint[] {
  const rand = seededRandom(cohortSeed(filters, `trend-${metric}`));
  const [min, max] = METRIC_RANGE[metric];
  const base = randomInRange(rand, min, max);
  const points: TrendPoint[] = [];
  const months = [
    "Oct 25",
    "Nov 25",
    "Dec 25",
    "Jan 26",
    "Feb 26",
    "Mar 26",
    "Apr 26",
    "May 26",
    "Jun 26",
    "Jul 26",
    "Aug 26",
    "Sep 26",
  ];
  let value = base;
  for (const period of months) {
    value = value * randomInRange(rand, 0.94, 1.07);
    points.push({ period, value });
  }
  return points;
}

export function getDistribution(
  kpi: KPIResult
): DistributionPoint[] {
  return [
    { label: "p25", value: kpi.p25 },
    { label: "median", value: kpi.median },
    { label: "p75", value: kpi.p75 },
    { label: "yourResult", value: kpi.yourValue ?? 0 },
  ];
}

export function getVerticalComparison(
  filters: CohortFilters,
  metric: MetricKey
): VerticalComparisonPoint[] {
  const [min, max] = METRIC_RANGE[metric];
  return VERTICALS.filter((v) => VERTICALS_WITH_DATA.has(v.id))
    .map((v) => {
      const perVerticalFilters = { ...filters, verticalId: v.id };
      const rand = seededRandom(cohortSeed(perVerticalFilters, `vc-${metric}`));
      const sampleSize = estimateSampleSize(perVerticalFilters, `vc-${metric}`);
      return {
        verticalId: v.id,
        verticalLabel: v.label,
        value: randomInRange(rand, min, max),
        sampleSize,
      };
    })
    .sort((a, b) => a.value - b.value);
}

export function getAudienceComparison(
  filters: CohortFilters,
  metric: MetricKey
): AudienceComparisonPoint[] {
  const [min, max] = METRIC_RANGE[metric];
  return AUDIENCE_STRATEGIES.map((a) => {
    const perAudienceFilters = { ...filters, audienceStrategy: a.id };
    const rand = seededRandom(cohortSeed(perAudienceFilters, `ac-${metric}`));
    const sampleSize = estimateSampleSize(perAudienceFilters, `ac-${metric}`);
    return {
      audienceStrategy: a.id,
      label: a.label,
      value: randomInRange(rand, min, max),
      sampleSize,
    };
  }).sort((a, b) => a.value - b.value);
}

export function getVerticalAudienceMatrix(
  filters: CohortFilters,
  metric: MetricKey
): MatrixCell[] {
  const [min, max] = METRIC_RANGE[metric];
  const cells: MatrixCell[] = [];
  for (const vertical of VERTICALS) {
    for (const audience of AUDIENCE_STRATEGIES) {
      const cellFilters = {
        ...filters,
        verticalId: vertical.id,
        audienceStrategy: audience.id,
      };
      const sampleSize = estimateSampleSize(cellFilters, `matrix-${metric}`);
      const insufficientData = sampleSize < MIN_SAMPLE_SIZE;
      const rand = seededRandom(cohortSeed(cellFilters, `matrix-${metric}`));
      cells.push({
        verticalId: vertical.id,
        audienceStrategy: audience.id,
        value: insufficientData ? null : randomInRange(rand, min, max),
        sampleSize,
        insufficientData,
      });
    }
  }
  return cells;
}

// Ranks verticals by their overall (audience-agnostic) sample size within
// the active cohort, so the matrix can default to a "top 10 by sample
// size" view instead of the full taxonomy — the default view should
// prioritize readability over density.
export function getVerticalRanking(
  filters: CohortFilters
): { verticalId: string; label: string; sampleSize: number }[] {
  return VERTICALS.map((v) => {
    const rankFilters = { ...filters, verticalId: v.id };
    return {
      verticalId: v.id,
      label: v.label,
      sampleSize: estimateSampleSize(rankFilters, "vertical-rank"),
    };
  }).sort((a, b) => b.sampleSize - a.sampleSize);
}
