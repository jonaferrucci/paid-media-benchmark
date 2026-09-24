import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeDistribution, flagOutliers } from "./stats";
import { classifyDurationBand, classifySpendBand, normalizedMonthlySpend } from "./spendBands";
import { resolveTimeWindow } from "./timeWindow";
import { DEFAULT_MINIMUM_SAMPLE_SIZE, RELAXATION_ORDER, type CohortDimensions, type RelaxableDimension } from "./cohortRules";
import { deriveBenchmarkStatus, type CohortQueryStatus } from "./resultStatus";
import type { HistoricalPeriodBounds } from "./historicalPeriods";
import type {
  BenchmarkQuery,
  BenchmarkResult,
  CohortDescriptor,
  MatrixCellResult,
  MatrixQuery,
  RelatedBenchmarkSuggestion,
  TrendPoint,
} from "./types";

// -----------------------------------------------------------------------
// PRIVACY / ARCHITECTURE NOTE
//
// This module is the ONE place in the codebase that is expected to read
// performance_datasets / dataset_metric_values across every user, not
// just the caller's own rows -- that's what "benchmark" means. RLS
// (0007_row_level_security.sql) intentionally has NO public read policy
// on those tables, so this module uses the service-role admin client to
// bypass RLS for that purpose specifically, per
// 08-AUTHENTICATION-SECURITY-AND-PRIVACY.md "Public Data": "Public
// benchmark data should be served through... database functions...
// or another controlled aggregation layer" -- this IS that layer.
//
// Every exported function below returns only a typed, aggregated
// BenchmarkResult (or MatrixCellResult / TrendPoint) -- never a raw row,
// never a dataset id, never an owner/org id. If you find yourself
// wanting to return anything from performance_datasets or
// dataset_metric_values directly from here, stop -- that breaks the
// privacy boundary this file exists to enforce.
// -----------------------------------------------------------------------

async function getMinimumSampleSize(): Promise<number> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("benchmark_settings")
    .select("setting_value")
    .eq("setting_key", "minimum_sample_size")
    .eq("active", true)
    .maybeSingle();
  const value = data?.setting_value as { default?: number } | null;
  return value?.default ?? DEFAULT_MINIMUM_SAMPLE_SIZE;
}

interface EligibleDatasetsParams {
  platform: string;
  objective: string;
  vertical: string;
  country: string;
  windowStart: string;
  windowEnd: string;
  businessModel?: string | null;
  audienceStrategy?: string | null;
  funnelStage?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  genderTargeting?: string | null;
  spendBand?: string | null;
  durationBand?: string | null;
  relaxed: Set<RelaxableDimension>;
}

async function fetchEligibleDatasetIds(params: EligibleDatasetsParams): Promise<string[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from("performance_datasets")
    .select("id, platforms!inner(internal_key), objectives!inner(internal_key), verticals!inner(internal_key), countries!inner(iso_code)")
    .eq("validation_status", "valid")
    .eq("platforms.internal_key", params.platform)
    .eq("objectives.internal_key", params.objective)
    .eq("verticals.internal_key", params.vertical)
    .eq("countries.iso_code", params.country)
    .gte("start_date", params.windowStart)
    .lte("start_date", params.windowEnd);

  if (params.businessModel) {
    const { data: bm } = await supabase
      .from("business_models")
      .select("id")
      .eq("internal_key", params.businessModel)
      .maybeSingle();
    if (bm) query = query.eq("business_model_id", bm.id);
  }

  if (params.audienceStrategy && !params.relaxed.has("audience_strategy")) {
    const { data: as } = await supabase
      .from("audience_strategies")
      .select("id")
      .eq("internal_key", params.audienceStrategy)
      .maybeSingle();
    if (as) query = query.eq("audience_strategy_id", as.id);
  }

  if (params.funnelStage && !params.relaxed.has("funnel_stage")) {
    const { data: fs } = await supabase
      .from("funnel_stages")
      .select("id")
      .eq("internal_key", params.funnelStage)
      .maybeSingle();
    if (fs) query = query.eq("funnel_stage_id", fs.id);
  }

  if (params.minAge != null && params.maxAge != null && !params.relaxed.has("age")) {
    query = query.eq("min_age", params.minAge).eq("max_age", params.maxAge);
  }

  if (params.genderTargeting && !params.relaxed.has("gender")) {
    query = query.eq("gender_targeting", params.genderTargeting as never);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  let ids = data.map((row) => row.id);

  // Spend Range / Duration Band: real cohort filters (Phase 4.1), not
  // just required Reach parameters. Applied as a post-filter since
  // duration_days is a generated column but normalized monthly spend
  // requires a join to dataset_metric_values (ad_spend), and spend-band
  // classification additionally depends on original_currency.
  if ((params.spendBand && !params.relaxed.has("spend_range")) || (params.durationBand && !params.relaxed.has("duration_band"))) {
    ids = await filterByScaleBands(ids, params.spendBand, params.durationBand, params.relaxed);
  }

  return ids;
}

/**
 * Narrows a dataset id list down to those matching the requested
 * Spend Range / Duration Band. Currency-unsafe classifications
 * (non-USD spend, since band labels are USD-denominated and there is
 * no FX normalization) are excluded, not silently included — see
 * classifySpendBand in spendBands.ts.
 */
async function filterByScaleBands(
  datasetIds: string[],
  spendBand: string | null | undefined,
  durationBand: string | null | undefined,
  relaxed: Set<RelaxableDimension>
): Promise<string[]> {
  if (datasetIds.length === 0) return [];
  const supabase = createAdminClient();

  const { data: datasets } = await supabase
    .from("performance_datasets")
    .select("id, duration_days, original_currency")
    .in("id", datasetIds);
  if (!datasets) return [];

  const wantSpendBand = spendBand && !relaxed.has("spend_range") ? spendBand : null;
  const wantDurationBand = durationBand && !relaxed.has("duration_band") ? durationBand : null;

  let adSpendByDataset = new Map<string, number>();
  if (wantSpendBand) {
    const { data: metric } = await supabase.from("metrics").select("id").eq("internal_key", "ad_spend").maybeSingle();
    if (metric) {
      const { data: spendRows } = await supabase
        .from("dataset_metric_values")
        .select("dataset_id, raw_numeric_value")
        .eq("metric_id", metric.id)
        .in("dataset_id", datasetIds);
      if (spendRows) {
        adSpendByDataset = new Map(spendRows.map((r) => [r.dataset_id, r.raw_numeric_value]));
      }
    }
  }

  const kept: string[] = [];
  for (const d of datasets) {
    if (wantDurationBand) {
      const actualBand = classifyDurationBand(d.duration_days);
      if (actualBand !== wantDurationBand) continue;
    }
    if (wantSpendBand) {
      const rawSpend = adSpendByDataset.get(d.id);
      if (rawSpend === undefined) continue; // no ad_spend recorded — cannot classify, exclude
      const normalized = normalizedMonthlySpend(rawSpend, d.duration_days);
      if (normalized === null) continue;
      const actualBand = classifySpendBand(normalized, d.original_currency);
      if (actualBand === null || actualBand !== wantSpendBand) continue; // null = non-USD, excluded per currency-safety rule
    }
    kept.push(d.id);
  }
  return kept;
}

interface MetricValueGroup {
  variantId: string | null;
  values: number[];
}

async function fetchMetricValueGroups(datasetIds: string[], metricInternalKey: string): Promise<MetricValueGroup[]> {
  if (datasetIds.length === 0) return [];
  const supabase = createAdminClient();

  const { data: metric } = await supabase.from("metrics").select("id").eq("internal_key", metricInternalKey).maybeSingle();
  if (!metric) return [];

  const { data, error } = await supabase
    .from("dataset_metric_values")
    .select("raw_numeric_value, metric_definition_variant_id")
    .eq("metric_id", metric.id)
    .in("dataset_id", datasetIds);

  if (error || !data) return [];

  const groups = new Map<string, number[]>();
  for (const row of data) {
    const key = row.metric_definition_variant_id ?? "__null__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row.raw_numeric_value);
  }

  return Array.from(groups.entries()).map(([key, values]) => ({
    variantId: key === "__null__" ? null : key,
    values,
  }));
}

function resolveVariantGroup(groups: MetricValueGroup[]): MetricValueGroup | null {
  if (groups.length === 0) return null;
  return groups.reduce((largest, g) => (g.values.length > largest.values.length ? g : largest));
}

function buildCohortDescriptor(query: BenchmarkQuery, relaxed: Set<RelaxableDimension>): CohortDescriptor {
  return {
    platform: query.platform,
    objective: query.objective,
    vertical: query.vertical,
    country: query.country,
    audienceStrategy: relaxed.has("audience_strategy") ? null : query.audienceStrategy ?? null,
    funnelStage: relaxed.has("funnel_stage") ? null : query.funnelStage ?? null,
    businessModel: query.businessModel ?? null,
    timeWindow: query.timeWindow.kind,
    spendBand: relaxed.has("spend_range") ? null : query.spendBand ?? null,
    durationBand: relaxed.has("duration_band") ? null : query.durationBand ?? null,
  };
}

interface MetricRowMeta {
  unit_type: string;
  benchmark_direction: "lower_is_better" | "higher_is_better" | "contextual";
}

async function getMetricRowMeta(metricKey: string): Promise<MetricRowMeta | null> {
  const { data } = await createAdminClient()
    .from("metrics")
    .select("unit_type, benchmark_direction")
    .eq("internal_key", metricKey)
    .maybeSingle();
  return data ?? null;
}

// HISTORICAL BENCHMARKS ARCHITECTURE: extracted from getMetricBenchmark
// below with ZERO behavior change (verified by the existing regression
// suite, including the canonical CPM median=3.85/sampleSize=15 check) so
// the new getHistoricalBenchmark can run this exact same cohort-
// selection/percentile logic once per period WITHOUT re-fetching
// minimumSampleSize or the metric's own unit_type/benchmark_direction on
// every iteration — those never change across periods for the same
// query+metric, so the caller resolves them once and passes them in.
// getMetricBenchmark itself still resolves them internally, so its own
// signature and behavior are completely unchanged for every existing
// caller.
async function computeMetricBenchmarkCore(
  query: BenchmarkQuery,
  metricKey: string,
  minimumSampleSize: number,
  // undefined = not yet resolved; fetched lazily below ONLY if the
  // success branch is actually reached — preserves getMetricBenchmark's
  // exact original query count (a Reach-block/no-data/insufficient
  // result never touched the metrics table before this extraction, and
  // still doesn't). getHistoricalBenchmark passes an already-resolved
  // value (or null) instead, since it needs the same metric's meta
  // across every period and resolving it once up front is cheaper than
  // up to N lazy fetches inside the loop.
  metricMeta?: MetricRowMeta | null,
  // CUCURUCHO INTELLIGENCE 2 (§10 — Campaign Explorer query strategy):
  // undefined (the default, and the ONLY value every existing caller —
  // getMetricBenchmark, getHistoricalBenchmark — ever passes) means
  // "resolve relaxed/window/datasetIds exactly as before this change,
  // with zero behavior difference." getBenchmarksForMetrics below is the
  // one and only caller that ever supplies this, having already resolved
  // relaxed/window/datasetIds ONCE for a whole batch of metrics that
  // share the exact same cohort — since every one of those fields is
  // fully determined by `query` alone (never by metricKey), reusing them
  // across metrics is safe: it changes nothing about what each metric's
  // result would have been, it only avoids re-running the identical
  // eligible-dataset join query N times in a row for the same cohort.
  precomputedCohort?: { relaxed: Set<RelaxableDimension>; window: { startDate: string; endDate: string }; datasetIds: string[] }
): Promise<BenchmarkResult> {
  const relaxed = precomputedCohort?.relaxed ?? new Set(query.relaxedDimensions ?? []);
  const window = precomputedCohort?.window ?? resolveTimeWindow(query.timeWindow);

  // Reach requires Spend Range + Duration Band for any DIRECT benchmark.
  // If either is missing OR has been explicitly relaxed away (Phase 4.1
  // item 5), the engine refuses outright rather than silently falling
  // back to a broader, methodologically-invalid comparison. This is a
  // hard stop, not a sample-size question — even with 1,000 eligible
  // datasets, Reach without scale context is not comparable. Applied
  // per-period here exactly like the live single query (§8 of the
  // Historical Benchmarks spec: "Reach debe conservar sus requisitos
  // metodológicos especiales"), and per-metric here exactly like before
  // this extraction even when a precomputedCohort is supplied — this
  // check depends only on metricKey/query, never on the dataset id list
  // itself, so a Reach block still returns cohortSampleSize 0 (never the
  // shared batch's own dataset count) exactly as it always has.
  const reachScaleContextRelaxed = relaxed.has("spend_range") || relaxed.has("duration_band");
  if (metricKey === "reach" && (!query.spendBand || !query.durationBand || reachScaleContextRelaxed)) {
    return emptyResult(metricKey, query, relaxed, window, 0);
  }

  const datasetIds =
    precomputedCohort?.datasetIds ??
    (await fetchEligibleDatasetIds({
      platform: query.platform,
      objective: query.objective,
      vertical: query.vertical,
      country: query.country,
      windowStart: window.startDate,
      windowEnd: window.endDate,
      businessModel: query.businessModel,
      audienceStrategy: query.audienceStrategy,
      funnelStage: query.funnelStage,
      minAge: query.minAge,
      maxAge: query.maxAge,
      genderTargeting: query.genderTargeting,
      spendBand: query.spendBand,
      durationBand: query.durationBand,
      relaxed,
    }));

  const cohortSampleSize = datasetIds.length;
  const groups = await fetchMetricValueGroups(datasetIds, metricKey);
  const chosen = resolveVariantGroup(groups);

  if (!chosen || chosen.values.length < minimumSampleSize) {
    return emptyResult(metricKey, query, relaxed, window, cohortSampleSize, chosen?.values.length ?? 0);
  }

  const stats = computeDistribution(chosen.values);
  const outliers = flagOutliers(chosen.values);
  const resolvedMeta = metricMeta !== undefined ? metricMeta : await getMetricRowMeta(metricKey);

  return {
    metric: metricKey,
    statistic: "median",
    value: stats.median,
    unit: resolvedMeta?.unit_type ?? "count",
    benchmarkDirection: resolvedMeta?.benchmark_direction ?? "contextual",
    p25: stats.p25,
    p75: stats.p75,
    mean: stats.mean,
    metricSampleSize: chosen.values.length,
    cohortSampleSize,
    cohort: buildCohortDescriptor(query, relaxed),
    metricDefinitionVariantId: chosen.variantId,
    relaxedDimensions: Array.from(relaxed),
    sufficientData: true,
    outlierFlaggedCount: outliers.flaggedCount,
    freshness: { start: window.startDate, end: window.endDate, generatedAt: new Date().toISOString() },
  };
}

export async function getMetricBenchmark(query: BenchmarkQuery, metricKey: string): Promise<BenchmarkResult> {
  const minimumSampleSize = await getMinimumSampleSize();
  // metricMeta omitted -> resolved lazily inside computeMetricBenchmarkCore
  // ONLY if the success branch is reached, exactly matching this
  // function's behavior/query count from before the extraction above.
  return computeMetricBenchmarkCore(query, metricKey, minimumSampleSize);
}

// CUCURUCHO INTELLIGENCE 2 (§10 — Campaign Explorer query strategy).
//
// The existing getBenchmark(query, metricKeys) below already batches N
// metrics for the same cohort, but it does so with Promise.all over
// getMetricBenchmark — meaning it (and every other existing caller that
// loops getMetricBenchmark per metric, e.g. app/account/contributions/
// [id]/page.tsx's per-campaign "Resultados comparables" readiness check)
// re-runs fetchEligibleDatasetIds's full platform/objective/vertical/
// country(+optional dimensions) join query once PER metric, even though
// that query's result depends only on `query` — never on which metric is
// being asked about. For a campaign with 8-10 comparable metrics that is
// 8-10 physically identical cohort joins for one page load.
//
// getBenchmarksForMetrics resolves relaxed/window/datasetIds exactly
// ONCE for the whole list of metricKeys, then reuses
// computeMetricBenchmarkCore's exact same per-metric tail (fetch that
// metric's own dataset_metric_values, resolve its variant, compute
// distribution, build the result) for each one — so every metric's
// RESULT is identical to what calling getMetricBenchmark(query, metric)
// for it individually would have returned; only the number of
// eligible-dataset queries changes (1 instead of N). getMetricBenchmark
// and getHistoricalBenchmark are completely untouched — neither passes
// precomputedCohort, so neither changes behavior or query count.
//
// Reach is deliberately NOT a valid metricKey for this function: its
// query additionally depends on spendBand/durationBand, which change
// which datasets are eligible — sharing this batch's datasetIds with
// Reach would silently apply the wrong (unfiltered) cohort to it. A
// caller that also needs Reach must still call getMetricBenchmark for
// it separately, exactly as before this change (see
// app/account/contributions/[id]/page.tsx, which does exactly this).
export async function getBenchmarksForMetrics(query: BenchmarkQuery, metricKeys: string[]): Promise<BenchmarkResult[]> {
  if (metricKeys.some((m) => m === "reach")) {
    throw new Error("getBenchmarksForMetrics: reach requires its own spendBand/durationBand-scoped query — call getMetricBenchmark for it separately.");
  }
  if (metricKeys.length === 0) return [];

  const minimumSampleSize = await getMinimumSampleSize();
  const relaxed = new Set(query.relaxedDimensions ?? []);
  const window = resolveTimeWindow(query.timeWindow);
  const datasetIds = await fetchEligibleDatasetIds({
    platform: query.platform,
    objective: query.objective,
    vertical: query.vertical,
    country: query.country,
    windowStart: window.startDate,
    windowEnd: window.endDate,
    businessModel: query.businessModel,
    audienceStrategy: query.audienceStrategy,
    funnelStage: query.funnelStage,
    minAge: query.minAge,
    maxAge: query.maxAge,
    genderTargeting: query.genderTargeting,
    spendBand: query.spendBand,
    durationBand: query.durationBand,
    relaxed,
  });
  const precomputedCohort = { relaxed, window, datasetIds };

  return Promise.all(metricKeys.map((metricKey) => computeMetricBenchmarkCore(query, metricKey, minimumSampleSize, undefined, precomputedCohort)));
}

function emptyResult(
  metricKey: string,
  query: BenchmarkQuery,
  relaxed: Set<RelaxableDimension>,
  window: { startDate: string; endDate: string },
  cohortSampleSize: number,
  metricSampleSize = 0
): BenchmarkResult {
  return {
    metric: metricKey,
    statistic: "median",
    value: null,
    unit: "count",
    benchmarkDirection: "contextual",
    p25: null,
    p75: null,
    mean: null,
    metricSampleSize,
    cohortSampleSize,
    cohort: buildCohortDescriptor(query, relaxed),
    metricDefinitionVariantId: null,
    relaxedDimensions: Array.from(relaxed),
    sufficientData: false,
    outlierFlaggedCount: 0,
    freshness: { start: null, end: null, generatedAt: new Date().toISOString() },
  };
}

export async function getBenchmark(query: BenchmarkQuery, metricKeys: string[]): Promise<BenchmarkResult[]> {
  return Promise.all(metricKeys.map((m) => getMetricBenchmark(query, m)));
}

export async function suggestCohortRelaxation(query: BenchmarkQuery, metricKey: string) {
  const minimumSampleSize = await getMinimumSampleSize();
  const window = resolveTimeWindow(query.timeWindow);

  const dims: CohortDimensions = {
    platform: query.platform,
    vertical: query.vertical,
    timeWindow: query.timeWindow.kind,
    country: query.country,
    objective: query.objective,
    businessModel: query.businessModel ?? null,
    age: query.minAge != null ? `${query.minAge}-${query.maxAge}` : null,
    gender: query.genderTargeting ?? null,
    funnelStage: query.funnelStage ?? null,
    audienceStrategy: query.audienceStrategy ?? null,
    campaignType: query.campaignTypeId ?? null,
    spendRange: query.spendBand ?? null,
    durationBand: query.durationBand ?? null,
  };

  const keyMap: Record<RelaxableDimension, keyof CohortDimensions> = {
    age: "age", gender: "gender", funnel_stage: "funnelStage", audience_strategy: "audienceStrategy",
    campaign_type: "campaignType", spend_range: "spendRange", duration_band: "durationBand",
  };

  for (const dimension of RELAXATION_ORDER) {
    const key = keyMap[dimension];
    if (!dims[key]) continue;

    const relaxed = new Set<RelaxableDimension>([dimension]);
    const ids = await fetchEligibleDatasetIds({
      platform: query.platform, objective: query.objective, vertical: query.vertical, country: query.country,
      windowStart: window.startDate, windowEnd: window.endDate, businessModel: query.businessModel,
      audienceStrategy: query.audienceStrategy, funnelStage: query.funnelStage,
      minAge: query.minAge, maxAge: query.maxAge, genderTargeting: query.genderTargeting,
      spendBand: query.spendBand, durationBand: query.durationBand, relaxed,
    });
    const groups = await fetchMetricValueGroups(ids, metricKey);
    const size = resolveVariantGroup(groups)?.values.length ?? 0;
    if (size >= minimumSampleSize) {
      return { dimension, estimatedSampleSize: size };
    }
  }
  return null;
}

export async function getBenchmarkMatrix(query: MatrixQuery, verticals: string[], audienceStrategies: string[]): Promise<MatrixCellResult[]> {
  const minimumSampleSize = await getMinimumSampleSize();
  const window = resolveTimeWindow(query.timeWindow);
  const cells: MatrixCellResult[] = [];

  for (const verticalKey of verticals) {
    for (const audienceKey of audienceStrategies) {
      const datasetIds = await fetchEligibleDatasetIds({
        platform: query.platform,
        objective: query.objective,
        vertical: verticalKey,
        country: query.country,
        windowStart: window.startDate,
        windowEnd: window.endDate,
        audienceStrategy: audienceKey,
        relaxed: new Set(),
      });
      const groups = await fetchMetricValueGroups(datasetIds, query.metric);
      const chosen = resolveVariantGroup(groups);
      const sampleSize = chosen?.values.length ?? 0;
      const sufficientData = sampleSize >= minimumSampleSize;
      cells.push({
        verticalKey,
        audienceStrategyKey: audienceKey,
        value: sufficientData ? computeDistribution(chosen!.values).median : null,
        sampleSize,
        sufficientData,
      });
    }
  }
  return cells;
}

export async function getRelatedBenchmarks(
  query: BenchmarkQuery,
  metricKey: string,
  candidateAudiences: string[],
  candidateVerticals: string[]
): Promise<RelatedBenchmarkSuggestion[]> {
  const minimumSampleSize = await getMinimumSampleSize();
  const window = resolveTimeWindow(query.timeWindow);
  const suggestions: RelatedBenchmarkSuggestion[] = [];

  for (const audienceKey of candidateAudiences) {
    if (audienceKey === query.audienceStrategy) continue;
    const ids = await fetchEligibleDatasetIds({
      platform: query.platform, objective: query.objective, vertical: query.vertical, country: query.country,
      windowStart: window.startDate, windowEnd: window.endDate, audienceStrategy: audienceKey, relaxed: new Set(),
    });
    const groups = await fetchMetricValueGroups(ids, metricKey);
    const size = resolveVariantGroup(groups)?.values.length ?? 0;
    if (size >= minimumSampleSize) {
      suggestions.push({
        label: "same vertical, audience: " + audienceKey,
        query: { ...query, audienceStrategy: audienceKey },
        sampleSize: size,
      });
    }
  }

  for (const verticalKey of candidateVerticals) {
    if (verticalKey === query.vertical) continue;
    const ids = await fetchEligibleDatasetIds({
      platform: query.platform, objective: query.objective, vertical: verticalKey, country: query.country,
      windowStart: window.startDate, windowEnd: window.endDate, audienceStrategy: query.audienceStrategy, relaxed: new Set(),
    });
    const groups = await fetchMetricValueGroups(ids, metricKey);
    const size = resolveVariantGroup(groups)?.values.length ?? 0;
    if (size >= minimumSampleSize) {
      suggestions.push({
        label: "same audience, vertical: " + verticalKey,
        query: { ...query, vertical: verticalKey },
        sampleSize: size,
      });
    }
  }

  return suggestions;
}

export async function getHistoricalTrend(query: BenchmarkQuery, metricKey: string, months: number = 12): Promise<TrendPoint[]> {
  const minimumSampleSize = await getMinimumSampleSize();
  const now = new Date();
  const points: TrendPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const periodStart = new Date(now);
    periodStart.setUTCMonth(periodStart.getUTCMonth() - i, 1);
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1, 0);

    const startStr = periodStart.toISOString().slice(0, 10);
    const endStr = periodEnd.toISOString().slice(0, 10);
    const period = startStr.slice(0, 7);

    const ids = await fetchEligibleDatasetIds({
      platform: query.platform, objective: query.objective, vertical: query.vertical, country: query.country,
      windowStart: startStr, windowEnd: endStr, audienceStrategy: query.audienceStrategy, relaxed: new Set(),
    });
    const groups = await fetchMetricValueGroups(ids, metricKey);
    const chosen = resolveVariantGroup(groups);
    const sampleSize = chosen?.values.length ?? 0;
    const sufficientData = sampleSize >= minimumSampleSize;

    points.push({ period, value: sufficientData ? computeDistribution(chosen!.values).median : null, sampleSize, sufficientData });
  }

  return points;
}

// -----------------------------------------------------------------------
// HISTORICAL BENCHMARKS ARCHITECTURE.
//
// getHistoricalTrend above predates this and is unused anywhere in the
// app (dead code, left untouched per "no cambiar lógica existente sin
// necesidad") — it only ever resolves a median per calendar month and
// only ever varies audienceStrategy alongside the four required
// dimensions, missing funnelStage/businessModel/spendBand/durationBand/
// Reach's methodology block entirely, and returns no P25/P75/cohort
// sample size. getHistoricalBenchmark below is its real, complete
// successor: it reuses the SAME cohort-selection/percentile/minimum-
// sample logic as the live single query (computeMetricBenchmarkCore,
// shared with getMetricBenchmark above) for every real cohort dimension
// BenchmarkQuery supports, and the SAME status precedence
// (deriveBenchmarkStatus, shared with app/benchmark/actions.ts) — so a
// historical period and the live "current" result can never silently
// disagree about what counts as comparable or sufficient.
//
// Each period is just a `{kind: "custom", startDate, endDate}` override
// of the SAME query's timeWindow — "custom" was already a fully
// implemented, real TimeWindowInput case (lib/benchmark/timeWindow.ts)
// that no UI path had ever exercised. No new query-building capability,
// no new cohort-matching rule, no new percentile math.
// -----------------------------------------------------------------------

export interface HistoricalPeriodResult {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  // "error" is deliberately distinct from "no_data" — a query that ran
  // and genuinely found nothing is a different, honest fact from a
  // query that failed to run at all. Conflating the two would hide a
  // real technical failure behind a legitimate-looking result, which
  // the project's own data-visualization guidance explicitly rules out
  // ("Do not hide methodological limitations to make the interface look
  // complete").
  status: CohortQueryStatus | "error";
  metricSampleSize: number;
  cohortSampleSize: number;
  p25: number | null;
  median: number | null;
  p75: number | null;
}

export interface HistoricalBenchmarkResult {
  metric: string;
  unit: string;
  benchmarkDirection: "lower_is_better" | "higher_is_better" | "contextual";
  periods: HistoricalPeriodResult[];
}

/**
 * Runs the SAME cohort query once per given period boundary, reusing
 * every real filter the query already carries (platform/objective/
 * vertical/country/audienceStrategy/funnelStage/businessModel/spendBand/
 * durationBand/relaxedDimensions) — only `timeWindow` changes per
 * iteration. minimumSampleSize and the metric's own unit/direction are
 * each resolved exactly ONCE up front (not once per period) — see
 * computeMetricBenchmarkCore's own comment for why, and for the one
 * documented trade-off this introduces (an extra, otherwise-avoidable
 * metrics-table lookup when every single period turns out reach-blocked
 * or empty).
 *
 * Never applies cohort relaxation per period — a suggested relaxation is
 * a live single-query concept (suggestCohortRelaxation above); silently
 * broadening one period's cohort but not another's would make periods
 * incomparable, which is exactly what this feature must never do (§8).
 */
export async function getHistoricalBenchmark(
  query: BenchmarkQuery,
  metricKey: string,
  periods: HistoricalPeriodBounds[]
): Promise<HistoricalBenchmarkResult> {
  const minimumSampleSize = await getMinimumSampleSize();
  const metricMeta = await getMetricRowMeta(metricKey);

  const results: HistoricalPeriodResult[] = [];
  for (const period of periods) {
    const periodQuery: BenchmarkQuery = {
      ...query,
      timeWindow: { kind: "custom", startDate: period.start, endDate: period.end },
    };

    try {
      const result = await computeMetricBenchmarkCore(periodQuery, metricKey, minimumSampleSize, metricMeta);
      const status = deriveBenchmarkStatus({
        metricKey,
        spendBand: query.spendBand,
        durationBand: query.durationBand,
        relaxedDimensions: query.relaxedDimensions,
        sufficientData: result.sufficientData,
        cohortSampleSize: result.cohortSampleSize,
      });
      results.push({
        periodKey: period.periodKey,
        periodStart: period.start,
        periodEnd: period.end,
        status,
        metricSampleSize: result.metricSampleSize,
        cohortSampleSize: result.cohortSampleSize,
        p25: result.p25,
        median: result.value,
        p75: result.p75,
      });
    } catch (err) {
      // One period's query failing (a transient DB issue, never a
      // methodological one) must never take down every other period's
      // already-valid result — degrade only that period, exactly like
      // runBenchmarkQuery's own top-level catch degrades to a generic
      // "error" rather than throwing through to the UI.
      console.error(`[benchmark] getHistoricalBenchmark failed for period ${period.periodKey}:`, err);
      results.push({
        periodKey: period.periodKey,
        periodStart: period.start,
        periodEnd: period.end,
        status: "error",
        metricSampleSize: 0,
        cohortSampleSize: 0,
        p25: null,
        median: null,
        p75: null,
      });
    }
  }

  return {
    metric: metricKey,
    unit: metricMeta?.unit_type ?? "count",
    benchmarkDirection: metricMeta?.benchmark_direction ?? "contextual",
    periods: results,
  };
}
