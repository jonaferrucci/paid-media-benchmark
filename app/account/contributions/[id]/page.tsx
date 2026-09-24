import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calculateDerivedMetrics, type RawMetricInputs } from "@/lib/metrics/derive";
import { getMetricBenchmark, getBenchmarksForMetrics } from "@/lib/benchmark/engine";
import { toResponse } from "@/lib/benchmark/responseShape";
import type { BenchmarkFormInput } from "@/lib/benchmark/buildQuery";
import { classifyPerformance } from "@/lib/comparison/classify";
import { normalizedMonthlySpend, classifySpendBand, classifyDurationBand } from "@/lib/benchmark/spendBands";
import { SINGLE_METRIC_OPTIONS } from "@/lib/benchmark/singleMetricOptions";
import { getAvailableCampaignMetrics, type DerivedMetricKey } from "@/lib/contribute/coverage";
import { EXPORT_PROFILE_LABEL_KEYS, type ExportProfileId } from "@/lib/import/platformExports";
import { ContributionDetail, type BenchmarkActivation } from "./ContributionDetail";

// PHASE 26 (§11): a compact, owner-only contribution detail view.
// Server Component doing its own scoped query, exactly like the parent
// list page (app/account/contributions/page.tsx) — no admin client, no
// new persistence. RLS ("owners read own datasets") makes another
// owner's id simply not exist from this session's point of view, the
// same pattern app/comparisons/actions.ts's getSavedComparisonAction and
// app/planner/actions.ts's getScenarioAction already rely on.

const RAW_METRIC_KEYS = new Set<keyof RawMetricInputs>([
  "ad_spend", "impressions", "reach", "clicks", "video_views", "engagements", "conversions", "attributed_revenue", "total_revenue",
]);

interface DetailRow {
  id: string;
  start_date: string;
  end_date: string;
  validation_status: string;
  created_at: string;
  data_source: string;
  original_currency: string;
  // PHASE 32 (§3/§4): duration_days is the SAME generated column
  // (migration 0004) the engine's own duration-band classification
  // already relies on — never re-derived from start/end date here.
  duration_days: number | null;
  // PHASE 25 (§4/§5/§15): identity/provenance additions — all
  // nullable, all backward-compatible with any pre-migration-0018 row.
  campaign_name: string | null;
  platforms: { internal_key: string; display_label: string } | null;
  objectives: { internal_key: string; display_label: string } | null;
  verticals: { internal_key: string; display_label: string } | null;
  countries: { iso_code: string; display_label: string } | null;
  campaign_types: { display_label: string } | null;
  // PHASE 32 (§3): the campaign's own real audience/funnel/business-
  // model context, when it has one — all nullable FKs on
  // performance_datasets (migration 0004/0008), read-only here, never
  // inferred or defaulted.
  audience_strategies: { internal_key: string } | null;
  funnel_stages: { internal_key: string } | null;
  business_models: { internal_key: string } | null;
  import_batches: { source_filename: string | null; export_profile: string | null } | null;
  dataset_metric_values: { raw_numeric_value: number; metrics: { internal_key: string } | null }[] | null;
}

export default async function ContributionDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("performance_datasets")
    .select(
      `id, start_date, end_date, validation_status, created_at, data_source, original_currency, campaign_name, duration_days,
       platforms(internal_key, display_label),
       objectives(internal_key, display_label),
       verticals(internal_key, display_label),
       countries(iso_code, display_label),
       campaign_types(display_label),
       audience_strategies(internal_key),
       funnel_stages(internal_key),
       business_models(internal_key),
       import_batches(source_filename, export_profile),
       dataset_metric_values(raw_numeric_value, metrics(internal_key))`
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error || !data) notFound();
  const dataset = data as unknown as DetailRow;

  const raw: RawMetricInputs = {};
  for (const value of dataset.dataset_metric_values ?? []) {
    const key = value.metrics?.internal_key;
    if (key && RAW_METRIC_KEYS.has(key as keyof RawMetricInputs)) {
      (raw as Record<string, number>)[key] = value.raw_numeric_value;
    }
  }
  const derived = calculateDerivedMetrics(raw);
  // CUCURUCHO INTELLIGENCE 2 (§7 — metric availability engine): reuses
  // the one named, documented getAvailableCampaignMetrics helper instead
  // of re-deriving Object.keys(derived) inline — same real behavior
  // (calculateDerivedMetrics already omits a key whenever any required
  // raw input is missing or its denominator is invalid), just with one
  // explicit, self-documenting entry point.
  const derivedKeys = getAvailableCampaignMetrics(raw);

  const hasFullCohort = Boolean(
    dataset.platforms?.internal_key && dataset.objectives?.internal_key && dataset.verticals?.internal_key && dataset.countries?.iso_code
  );

  // CUCURUCHO INTELLIGENCE 2 (§9/§10/§11 — Campaign Explorer market
  // comparison).
  //
  // §10 query strategy: every candidate metric below shares the exact
  // same cohort (same platform/objective/vertical/country/timeWindow —
  // Reach is the one exception, handled separately further down because
  // its query also depends on spendBand/durationBand). The previous
  // implementation called getMetricBenchmark once PER derived metric,
  // each independently re-running the full eligible-dataset join query
  // for that identical cohort — for a campaign with 8-10 comparable
  // metrics, that was 8-10 physically redundant queries on every page
  // load. getBenchmarksForMetrics (lib/benchmark/engine.ts) resolves
  // that cohort ONCE and reuses it for every metric — same real
  // per-metric result as before (see that function's own comment for
  // why this is a zero-behavior-change optimization), 1 cohort query
  // instead of N. Reach adds one more query of its own below, so this
  // page now runs at most 2 cohort-resolution queries total (down from
  // up to derivedKeys.length + 1).
  //
  // §11 per-metric states: every candidate metric now gets its OWN real
  // status — success / insufficient_sample / no_data / methodology_block
  // (the exact same deriveBenchmarkStatus precedence /benchmark itself
  // uses, via the shared toResponse() shaping) — never silently dropped
  // just because it isn't "success" the way the old per-entry
  // sufficient-data-only filter did. The 5th state, "unavailable",
  // is a fact about the CAMPAIGN's own data (a metric derivedKeys simply
  // doesn't contain) rather than a market-comparison outcome, so — per
  // §6's "no empty cards" — it never becomes a compareOptions row at
  // all; the "Métricas calculadas" list elsewhere on this page already
  // states which metrics this campaign's own data supports.
  const compareOptions: BenchmarkActivation["compareOptions"] = [];

  if (hasFullCohort) {
    const query = {
      platform: dataset.platforms!.internal_key,
      objective: dataset.objectives!.internal_key,
      vertical: dataset.verticals!.internal_key,
      country: dataset.countries!.iso_code,
      timeWindow: { kind: "last_12_months" as const },
    };

    // PHASE 32 (§4/§5), unchanged: "Comparar con benchmark" only ever
    // offers a metric this campaign's own raw data actually supports AND
    // /benchmark's single-metric selector actually accepts
    // (SINGLE_METRIC_OPTIONS) — CPL remains excluded (no canonical lead
    // semantic distinct from a sales/purchase conversion count).
    const candidateMetrics = derivedKeys.filter((m) => (SINGLE_METRIC_OPTIONS as readonly string[]).includes(m));
    const results = candidateMetrics.length > 0 ? await getBenchmarksForMetrics(query, candidateMetrics) : [];

    for (const result of results) {
      const value = derived[result.metric as DerivedMetricKey];
      if (value === undefined) continue; // defensive only — candidateMetrics is already sourced from derivedKeys
      const userValue = Math.round(value * 100) / 100;
      // Reuses the exact same BenchmarkResult -> BenchmarkResponse
      // shaping /benchmark itself uses (lib/benchmark/responseShape.ts)
      // so this page's status/message can never silently drift from
      // what /benchmark would show for the identical query+metric.
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
      const { p25, median, p75 } = response.statistics;
      // Reuses the exact same classification function CampaignExplorer.tsx
      // and /benchmark's own ComparisonDetail already use — never a
      // second "is this good or bad" implementation.
      const classification =
        response.status === "success" && p25 !== null && median !== null && p75 !== null
          ? classifyPerformance(userValue, { p25, median, p75 }, response.benchmarkDirection)
          : null;
      compareOptions.push({ metric: result.metric, status: response.status, classification, response, userValue });
    }
  }

  // Reach is a base metric, not a derived one (see lib/metrics/derive.ts's
  // own comment on why it's absent from DerivedMetrics), and the engine
  // hard-requires Spend Range + Duration Band for it (lib/benchmark/
  // engine.ts) — so its own eligibility check stays separate from the
  // shared-cohort batch above (its query has a DIFFERENT cohort — see
  // getBenchmarksForMetrics's own comment on why it refuses "reach").
  // classifySpendBand returns null for any non-USD currency (no FX
  // normalization exists yet), which correctly and honestly means Reach
  // is simply never offered for a non-USD campaign, rather than guessing
  // a band. CUCURUCHO INTELLIGENCE 2 (§11): once Reach IS a candidate
  // (a real spend/duration band was classifiable), it now gets its own
  // real status too — including methodology_block — instead of being
  // silently omitted whenever it wasn't sufficient.
  if (hasFullCohort && raw.reach !== undefined && raw.ad_spend !== undefined && dataset.duration_days != null) {
    const normalized = normalizedMonthlySpend(raw.ad_spend, dataset.duration_days);
    const spendBand = normalized !== null ? classifySpendBand(normalized, dataset.original_currency) : null;
    if (spendBand) {
      const durationBand = classifyDurationBand(dataset.duration_days);
      const reachQuery = {
        platform: dataset.platforms!.internal_key,
        objective: dataset.objectives!.internal_key,
        vertical: dataset.verticals!.internal_key,
        country: dataset.countries!.iso_code,
        timeWindow: { kind: "last_12_months" as const },
        spendBand,
        durationBand,
      };
      const reachResult = await getMetricBenchmark(reachQuery, "reach");
      const reachUserValue = Math.round(raw.reach * 100) / 100;
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
      const reachResponse = toResponse(reachInput, reachResult);
      const { p25, median, p75 } = reachResponse.statistics;
      const reachClassification =
        reachResponse.status === "success" && p25 !== null && median !== null && p75 !== null
          ? classifyPerformance(reachUserValue, { p25, median, p75 }, reachResponse.benchmarkDirection)
          : null;
      compareOptions.push({
        metric: "reach",
        status: reachResponse.status,
        classification: reachClassification,
        response: reachResponse,
        userValue: reachUserValue,
        spendBand,
        durationBand,
      });
    }
  }

  const exportProfileLabelKey = dataset.import_batches?.export_profile
    ? EXPORT_PROFILE_LABEL_KEYS[dataset.import_batches.export_profile as ExportProfileId] ?? null
    : null;

  // PHASE 32 (§3): the same five real cohort fields the existing Home ->
  // /benchmark prefill mechanism already carries (Phase 30), extended
  // with funnelStage/businessModel — both already real, existing
  // /benchmark Draft fields (never invented ones) — read only when this
  // campaign actually has them.
  const benchmarkActivation: BenchmarkActivation = {
    context: {
      platform: dataset.platforms?.internal_key ?? null,
      objective: dataset.objectives?.internal_key ?? null,
      vertical: dataset.verticals?.internal_key ?? null,
      country: dataset.countries?.iso_code ?? null,
      audienceStrategy: dataset.audience_strategies?.internal_key ?? null,
      funnelStage: dataset.funnel_stages?.internal_key ?? null,
      businessModel: dataset.business_models?.internal_key ?? null,
    },
    compareOptions,
  };

  return (
    <ContributionDetail
      dataset={{
        id: dataset.id,
        startDate: dataset.start_date,
        endDate: dataset.end_date,
        validationStatus: dataset.validation_status,
        createdAt: dataset.created_at,
        dataSource: dataset.data_source,
        currency: dataset.original_currency,
        campaignName: dataset.campaign_name,
        campaignTypeLabel: dataset.campaign_types?.display_label ?? null,
        sourceFilename: dataset.import_batches?.source_filename ?? null,
        exportProfileLabelKey,
        platformLabel: dataset.platforms?.display_label ?? "—",
        objectiveLabel: dataset.objectives?.display_label ?? "—",
        verticalLabel: dataset.verticals?.display_label ?? "—",
        countryLabel: dataset.countries?.display_label ?? "—",
      }}
      raw={raw}
      derivedKeys={derivedKeys}
      benchmarkActivation={benchmarkActivation}
    />
  );
}
