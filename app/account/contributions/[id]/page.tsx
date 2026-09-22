import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calculateDerivedMetrics, type RawMetricInputs } from "@/lib/metrics/derive";
import { getMetricBenchmark } from "@/lib/benchmark/engine";
import { normalizedMonthlySpend, classifySpendBand, classifyDurationBand } from "@/lib/benchmark/spendBands";
import { SINGLE_METRIC_OPTIONS } from "@/lib/benchmark/singleMetricOptions";
import type { DerivedMetricKey } from "@/lib/contribute/coverage";
import { EXPORT_PROFILE_LABEL_KEYS, type ExportProfileId } from "@/lib/import/platformExports";
import { ContributionDetail, type BenchmarkReadinessEntry, type BenchmarkActivation } from "./ContributionDetail";

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
  const derivedKeys = Object.keys(derived) as DerivedMetricKey[];

  const hasFullCohort = Boolean(
    dataset.platforms?.internal_key && dataset.objectives?.internal_key && dataset.verticals?.internal_key && dataset.countries?.iso_code
  );

  // §6: distinguish "your own data is enough" from "the market cohort
  // isn't" — bounded to THIS one campaign's own derivable metrics only
  // (never every campaign, never every metric), all fetched in parallel.
  // last_12_months mirrors the SAME default /benchmark itself opens
  // with (BenchmarkExplorer's DEFAULT_DRAFT) — never a narrower window
  // invented just for this check, which would make the cohort look
  // artificially small.
  let readiness: BenchmarkReadinessEntry[] = [];
  if (hasFullCohort) {
    const query = {
      platform: dataset.platforms!.internal_key,
      objective: dataset.objectives!.internal_key,
      vertical: dataset.verticals!.internal_key,
      country: dataset.countries!.iso_code,
      timeWindow: { kind: "last_12_months" as const },
    };
    readiness = await Promise.all(
      derivedKeys.map(async (metric) => {
        const result = await getMetricBenchmark(query, metric);
        return { metric, sufficientData: result.sufficientData, cohortSampleSize: result.cohortSampleSize };
      })
    );
  }

  // PHASE 32 (§4/§5): "Comparar con benchmark" only ever offers a
  // metric that (a) this campaign's own raw data actually supports,
  // (b) /benchmark's single-metric selector actually accepts
  // (SINGLE_METRIC_OPTIONS), and (c) the real market cohort already has
  // enough data for (readiness.sufficientData, computed above with no
  // new formula). Never a fabricated metric, never a metric this exact
  // campaign can't actually support.
  //
  // PHASE 34: SINGLE_METRIC_OPTIONS now also includes CPA/ROAS/CPE/
  // ACOS/TACOS after an end-to-end audit confirmed real support for
  // each (raw inputs, formula, unit/direction, engine, UI, saved
  // comparisons — see that file's own comment). CPL remains excluded —
  // this campaign's own "conversions" raw value has no way to tell a
  // sales/purchase count from a leads count, so CPL is deferred rather
  // than guessed.
  const compareOptions: BenchmarkActivation["compareOptions"] = [];
  for (const entry of readiness) {
    if (entry.sufficientData && (SINGLE_METRIC_OPTIONS as readonly string[]).includes(entry.metric)) {
      const value = derived[entry.metric];
      if (value !== undefined) {
        compareOptions.push({ metric: entry.metric, userValue: Math.round(value * 100) / 100 });
      }
    }
  }

  // Reach is a base metric, not a derived one (see lib/metrics/derive.ts's
  // own comment on why it's absent from DerivedMetrics), and the engine
  // hard-requires Spend Range + Duration Band for it (lib/benchmark/
  // engine.ts) — so its own eligibility check is separate from the
  // derived-metrics loop above, reusing the SAME classification
  // functions the engine and /benchmark's own Select options already
  // use (never a re-implemented formula). classifySpendBand returns
  // null for any non-USD currency (no FX normalization exists yet — see
  // that function's own comment), which correctly and honestly means
  // Reach is simply never offered for a non-USD campaign, rather than
  // guessing a band.
  if (hasFullCohort && raw.reach !== undefined && raw.ad_spend !== undefined && dataset.duration_days != null) {
    const normalized = normalizedMonthlySpend(raw.ad_spend, dataset.duration_days);
    const spendBand = normalized !== null ? classifySpendBand(normalized, dataset.original_currency) : null;
    if (spendBand) {
      const durationBand = classifyDurationBand(dataset.duration_days);
      const reachResult = await getMetricBenchmark(
        {
          platform: dataset.platforms!.internal_key,
          objective: dataset.objectives!.internal_key,
          vertical: dataset.verticals!.internal_key,
          country: dataset.countries!.iso_code,
          timeWindow: { kind: "last_12_months" as const },
          spendBand,
          durationBand,
        },
        "reach"
      );
      if (reachResult.sufficientData) {
        compareOptions.push({ metric: "reach", userValue: Math.round(raw.reach * 100) / 100, spendBand, durationBand });
      }
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
      readiness={readiness}
      benchmarkActivation={benchmarkActivation}
    />
  );
}
