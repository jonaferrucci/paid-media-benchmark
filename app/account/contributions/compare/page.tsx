import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calculateDerivedMetrics, type RawMetricInputs } from "@/lib/metrics/derive";
import { getAvailableCampaignMetrics, type DerivedMetricKey } from "@/lib/contribute/coverage";
import { getMetricBenchmark, getBenchmarksForMetrics } from "@/lib/benchmark/engine";
import { toResponse, type BenchmarkResponse } from "@/lib/benchmark/responseShape";
import type { BenchmarkFormInput } from "@/lib/benchmark/buildQuery";
import { classifyPerformance } from "@/lib/comparison/classify";
import { normalizedMonthlySpend, classifySpendBand, classifyDurationBand } from "@/lib/benchmark/spendBands";
import { SINGLE_METRIC_OPTIONS } from "@/lib/benchmark/singleMetricOptions";
import {
  parseComparisonIds,
  groupCampaignsByCohort,
  isMixedCurrencyRow,
  type CampaignForGrouping,
} from "@/lib/benchmark/campaignComparison";
import { ComparisonMatrix, type ComparisonMatrixRow, type ComparisonMatrixCampaign } from "./ComparisonMatrix";
import { NotEnoughCampaigns } from "./NotEnoughCampaigns";

// CUCURUCHO INTELLIGENCE 3 — Multi-Campaign Comparison.
//
// Server Component doing its own RLS-scoped query, exactly like the
// sibling detail page (app/account/contributions/[id]/page.tsx) — never
// the admin client, never a second read path for the same data. RLS
// ("owners read own datasets") is what actually restricts every query
// below to the signed-in user's own rows: an id belonging to another
// user (or a non-existent id) simply is never returned, with zero
// distinguishable signal either way — see the SECURITY note below.
//
// Query shape mirrors app/account/contributions/page.tsx's own
// established pattern exactly: ONE performance_datasets select with
// dataset_metric_values embedded as a nested PostgREST resource, keyed
// by `.in("id", ids)` — a single round trip for all 2-5 campaigns'
// datasets AND their metric values together, never a per-campaign
// follow-up query and never two separate top-level queries where one
// already does the job.

const RAW_METRIC_KEYS = new Set<keyof RawMetricInputs>([
  "ad_spend", "impressions", "reach", "clicks", "video_views", "engagements", "conversions", "attributed_revenue", "total_revenue",
]);

interface CompareRow {
  id: string;
  start_date: string;
  end_date: string;
  validation_status: string;
  original_currency: string;
  campaign_name: string | null;
  duration_days: number | null;
  superseded_by_dataset_id: string | null;
  platforms: { internal_key: string; display_label: string } | null;
  objectives: { internal_key: string; display_label: string } | null;
  verticals: { internal_key: string; display_label: string } | null;
  countries: { iso_code: string; display_label: string } | null;
  dataset_metric_values: { raw_numeric_value: number; metrics: { internal_key: string } | null }[] | null;
}

export default async function ComparePage({ searchParams }: { searchParams: { ids?: string } }) {
  // SECURITY: never trust the URL. parseComparisonIds is a pure
  // function (lib/benchmark/campaignComparison.ts) — it only sanitizes
  // shape (UUID-looking, deduplicated, 2-5 count). It grants no access
  // by itself; the RLS-scoped query below is the real boundary.
  const parsed = parseComparisonIds(searchParams.ids);
  if (!parsed.ok) {
    return <NotEnoughCampaigns reason={parsed.error} />;
  }

  const supabase = createServerSupabaseClient();

  const { data } = await supabase
    .from("performance_datasets")
    .select(
      `id, start_date, end_date, validation_status, original_currency, campaign_name, duration_days, superseded_by_dataset_id,
       platforms(internal_key, display_label),
       objectives(internal_key, display_label),
       verticals(internal_key, display_label),
       countries(iso_code, display_label),
       dataset_metric_values(raw_numeric_value, metrics(internal_key))`
    )
    .in("id", parsed.ids);

  // Never leak which of the requested ids were unreadable (another
  // owner's row, a superseded/deleted id that no longer exists, or a
  // stale link) vs. simply absent — RLS already made that
  // indistinguishable at the query level (a row you can't read never
  // comes back, full stop), so this page never attempts to tell those
  // cases apart either. If what actually came back RLS-scoped is fewer
  // than 2 real, readable campaigns, the comparison itself is not
  // viable — render one neutral, safe state, never a per-id error.
  const rows = (data as unknown as CompareRow[]) ?? [];
  if (rows.length < 2) {
    return <NotEnoughCampaigns reason="unavailable" />;
  }

  // ---------------------------------------------------------------------
  // Per-campaign derived data — pure, no further I/O.
  // ---------------------------------------------------------------------
  const perCampaign = rows.map((row) => {
    const raw: RawMetricInputs = {};
    for (const value of row.dataset_metric_values ?? []) {
      const key = value.metrics?.internal_key;
      if (key && RAW_METRIC_KEYS.has(key as keyof RawMetricInputs)) {
        (raw as Record<string, number>)[key] = value.raw_numeric_value;
      }
    }
    const derived = calculateDerivedMetrics(raw);
    // Same allowlist app/account/contributions/[id]/page.tsx already
    // uses for its own "Comparar con benchmark" activation (never CPL —
    // see SINGLE_METRIC_OPTIONS's own comment) — reused here verbatim,
    // never a second, independently-maintained metric allowlist. Typed
    // as (DerivedMetricKey | "reach")[] rather than DerivedMetricKey[]
    // because Reach (a base metric, never part of DerivedMetrics — see
    // lib/metrics/derive.ts's own comment) is added to this same array
    // further below, once its own eligibility is confirmed.
    const availableMetrics: (DerivedMetricKey | "reach")[] = getAvailableCampaignMetrics(raw).filter((m) =>
      (SINGLE_METRIC_OPTIONS as readonly string[]).includes(m)
    );

    return {
      id: row.id,
      campaignName: row.campaign_name,
      validationStatus: row.validation_status,
      currency: row.original_currency,
      startDate: row.start_date,
      endDate: row.end_date,
      supersededByDatasetId: row.superseded_by_dataset_id,
      platformKey: row.platforms?.internal_key ?? null,
      objectiveKey: row.objectives?.internal_key ?? null,
      verticalKey: row.verticals?.internal_key ?? null,
      countryKey: row.countries?.iso_code ?? null,
      platformLabel: row.platforms?.display_label ?? "—",
      objectiveLabel: row.objectives?.display_label ?? "—",
      verticalLabel: row.verticals?.display_label ?? "—",
      countryLabel: row.countries?.display_label ?? "—",
      raw,
      derived,
      availableMetrics,
      durationDays: row.duration_days,
    };
  });

  // ---------------------------------------------------------------------
  // Cohort grouping — pure (lib/benchmark/campaignComparison.ts). Never
  // campaign × metric: one getBenchmarksForMetrics call per DISTINCT
  // cohort among the 2-5 selected campaigns, reusing the exact same
  // batched engine entry point app/account/contributions/[id]/page.tsx
  // already relies on for a single campaign.
  // ---------------------------------------------------------------------
  const grouping: CampaignForGrouping[] = perCampaign.map((c) => ({
    id: c.id,
    platformKey: c.platformKey,
    objectiveKey: c.objectiveKey,
    verticalKey: c.verticalKey,
    countryKey: c.countryKey,
  }));
  const { groups, ungroupedCampaignIds } = groupCampaignsByCohort(grouping);

  // metric -> cohortKey -> BenchmarkResponse. One entry per (metric,
  // group) pair actually queried — never per (metric, campaign).
  const marketByMetricAndGroup = new Map<string, Map<string, BenchmarkResponse>>();

  for (const group of groups) {
    const membersMetrics = perCampaign
      .filter((c) => group.campaignIds.includes(c.id))
      .flatMap((c) => c.availableMetrics);
    const unionMetrics = Array.from(new Set(membersMetrics)).filter((m) => m !== "reach");
    if (unionMetrics.length === 0) continue;

    const query = {
      platform: group.platformKey,
      objective: group.objectiveKey,
      vertical: group.verticalKey,
      country: group.countryKey,
      timeWindow: { kind: "last_12_months" as const },
    };
    const results = await getBenchmarksForMetrics(query, unionMetrics);

    for (const result of results) {
      const input: BenchmarkFormInput = {
        metric: result.metric,
        platform: query.platform,
        objective: query.objective,
        vertical: query.vertical,
        country: query.country,
        timeWindow: "last_12_months",
        relaxedDimensions: [],
      };
      const response = toResponse(input, result);
      if (!marketByMetricAndGroup.has(result.metric)) marketByMetricAndGroup.set(result.metric, new Map());
      marketByMetricAndGroup.get(result.metric)!.set(group.key, response);
    }
  }

  // Reach keeps its existing, unmodified per-campaign methodology
  // (spend band + duration band are properties of ONE campaign's own
  // spend/duration, not of a shared taxonomy cohort — see
  // lib/benchmark/engine.ts's own comment on why getBenchmarksForMetrics
  // refuses "reach"). This is exactly the same one-call-per-eligible-
  // campaign cost app/account/contributions/[id]/page.tsx already pays
  // today; Multi-Campaign Comparison introduces no new Reach query
  // strategy.
  const reachByCampaign = new Map<string, BenchmarkResponse>();
  const reachEligibleCampaignIds = new Set<string>();
  for (const c of perCampaign) {
    if (!c.platformKey || !c.objectiveKey || !c.verticalKey || !c.countryKey) continue;
    if (c.raw.reach === undefined || c.raw.ad_spend === undefined || c.durationDays == null) continue;
    const normalized = normalizedMonthlySpend(c.raw.ad_spend, c.durationDays);
    const spendBand = normalized !== null ? classifySpendBand(normalized, c.currency) : null;
    if (!spendBand) continue;
    const durationBand = classifyDurationBand(c.durationDays);
    const reachQuery = {
      platform: c.platformKey,
      objective: c.objectiveKey,
      vertical: c.verticalKey,
      country: c.countryKey,
      timeWindow: { kind: "last_12_months" as const },
      spendBand,
      durationBand,
    };
    const reachResult = await getMetricBenchmark(reachQuery, "reach");
    const reachInput: BenchmarkFormInput = {
      metric: "reach",
      platform: reachQuery.platform,
      objective: reachQuery.objective,
      vertical: reachQuery.vertical,
      country: reachQuery.country,
      timeWindow: "last_12_months",
      spendBand,
      durationBand,
      relaxedDimensions: [],
    };
    reachByCampaign.set(c.id, toResponse(reachInput, reachResult));
    reachEligibleCampaignIds.add(c.id);
  }
  // Reach is a base metric (not part of getAvailableCampaignMetrics'
  // derived-metric output), so it never appeared in availableMetrics
  // above — mark it now, only for campaigns confirmed eligible.
  for (const c of perCampaign) {
    if (reachEligibleCampaignIds.has(c.id)) c.availableMetrics.push("reach");
  }

  // ---------------------------------------------------------------------
  // Assemble the matrix: rows = union of metrics available in at least
  // one selected campaign. Never invent a row for a metric nobody has.
  // ---------------------------------------------------------------------
  const metricOrder = [...SINGLE_METRIC_OPTIONS];
  const rowMetrics = metricOrder.filter((m) => perCampaign.some((c) => c.availableMetrics.includes(m)));

  const cohortKeyByCampaignId = new Map<string, string | null>();
  for (const c of perCampaign) {
    cohortKeyByCampaignId.set(
      c.id,
      c.platformKey && c.objectiveKey && c.verticalKey && c.countryKey
        ? [c.platformKey, c.objectiveKey, c.verticalKey, c.countryKey].join("|")
        : null
    );
  }

  const matrixCampaigns: ComparisonMatrixCampaign[] = perCampaign.map((c) => ({
    id: c.id,
    campaignName: c.campaignName,
    platformLabel: c.platformLabel,
    objectiveLabel: c.objectiveLabel,
    verticalLabel: c.verticalLabel,
    countryLabel: c.countryLabel,
    objectiveKey: c.objectiveKey,
    verticalKey: c.verticalKey,
    countryKey: c.countryKey,
    currency: c.currency,
    validationStatus: c.validationStatus,
    startDate: c.startDate,
    endDate: c.endDate,
    hasFullCohort: !ungroupedCampaignIds.includes(c.id),
  }));

  const matrixRows: ComparisonMatrixRow[] = rowMetrics.map((metric) => {
    const isReach = metric === "reach";
    const perGroupResponses = isReach ? undefined : marketByMetricAndGroup.get(metric);

    // Resolve `unit`/`benchmarkDirection` from whichever real response
    // is available for this metric — a metric's unit type is a global
    // fact about the metric itself (from the `metrics` table via the
    // engine), never cohort-dependent, so any one response for it is
    // authoritative for the whole row.
    const anyResponse = isReach
      ? [...reachByCampaign.values()][0]
      : perGroupResponses
        ? [...perGroupResponses.values()][0]
        : undefined;
    const unit = anyResponse?.unit ?? "count";
    const benchmarkDirection = anyResponse?.benchmarkDirection ?? "contextual";

    const rawCells = perCampaign.map((c) => {
      const hasMetric = c.availableMetrics.includes(metric as DerivedMetricKey | "reach");
      if (!hasMetric) {
        return { campaignId: c.id, value: null as number | null, currency: c.currency, response: undefined as BenchmarkResponse | undefined };
      }
      const value = isReach ? c.raw.reach! : c.derived[metric as DerivedMetricKey]!;
      const rounded = Math.round(value * 100) / 100;
      const groupKey = isReach ? null : cohortKeyByCampaignId.get(c.id) ?? null;
      const response = isReach ? reachByCampaign.get(c.id) : groupKey ? perGroupResponses?.get(groupKey) : undefined;
      return { campaignId: c.id, value: rounded, currency: c.currency, response };
    });

    const currenciesInRow = rawCells.filter((cell) => cell.value !== null).map((cell) => cell.currency);
    const currencyMixed = isMixedCurrencyRow(unit, currenciesInRow);

    // Mixed-currency rows still show each campaign's own real value and
    // its currency (per the spec's CURRENCY RULES: "Still preserve the
    // underlying campaign values/currency where useful"), but never a
    // classification pill or a % diff — those imply direct
    // comparability, which an FX-free app cannot honestly claim across
    // currencies. Stripped here, in the ONE place this row's data is
    // assembled, rather than trusted to every render call site.
    const cells = rawCells.map((cell) => {
      if (currencyMixed || cell.value === null || !cell.response || cell.response.status !== "success") {
        return { ...cell, classification: null };
      }
      const { p25, median, p75 } = cell.response.statistics;
      const classification =
        p25 !== null && median !== null && p75 !== null
          ? classifyPerformance(cell.value, { p25, median, p75 }, cell.response.benchmarkDirection)
          : null;
      return { ...cell, classification };
    });

    // Market context: for a shared-cohort metric, one entry per distinct
    // cohort group that actually produced a response (usually 1, unless
    // the selected campaigns span more than one cohort). For Reach,
    // market context is embedded per-cell above instead (its methodology
    // is inherently per-campaign) — this list stays empty for that row
    // so the UI never renders a misleading "shared" chip for a metric
    // that was never actually shared.
    const marketContexts = isReach
      ? []
      : groups
          .filter((g) => perGroupResponses?.has(g.key))
          .map((g) => {
            const anyMember = perCampaign.find((c) => g.campaignIds.includes(c.id));
            return {
              cohortKey: g.key,
              platformLabel: anyMember?.platformLabel ?? g.platformKey,
              objectiveLabel: anyMember?.objectiveLabel ?? g.objectiveKey,
              verticalLabel: anyMember?.verticalLabel ?? g.verticalKey,
              countryLabel: anyMember?.countryLabel ?? g.countryKey,
              objectiveKey: g.objectiveKey,
              verticalKey: g.verticalKey,
              countryKey: g.countryKey,
              response: perGroupResponses!.get(g.key)!,
            };
          });

    return { metric, unit, benchmarkDirection, cells, currencyMixed, marketContexts, isReach, multipleCohorts: groups.length > 1 };
  });

  return (
    <ComparisonMatrix
      campaigns={matrixCampaigns}
      rows={matrixRows}
      ungroupedCampaignIds={ungroupedCampaignIds}
    />
  );
}
