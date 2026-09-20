import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calculateDerivedMetrics, type RawMetricInputs } from "@/lib/metrics/derive";
import { getMetricBenchmark } from "@/lib/benchmark/engine";
import type { DerivedMetricKey } from "@/lib/contribute/coverage";
import { EXPORT_PROFILE_LABEL_KEYS, type ExportProfileId } from "@/lib/import/platformExports";
import { ContributionDetail, type BenchmarkReadinessEntry } from "./ContributionDetail";

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
  // PHASE 25 (§4/§5/§15): identity/provenance additions — all
  // nullable, all backward-compatible with any pre-migration-0018 row.
  campaign_name: string | null;
  platforms: { internal_key: string; display_label: string } | null;
  objectives: { internal_key: string; display_label: string } | null;
  verticals: { internal_key: string; display_label: string } | null;
  countries: { iso_code: string; display_label: string } | null;
  campaign_types: { display_label: string } | null;
  import_batches: { source_filename: string | null; export_profile: string | null } | null;
  dataset_metric_values: { raw_numeric_value: number; metrics: { internal_key: string } | null }[] | null;
}

export default async function ContributionDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("performance_datasets")
    .select(
      `id, start_date, end_date, validation_status, created_at, data_source, original_currency, campaign_name,
       platforms(internal_key, display_label),
       objectives(internal_key, display_label),
       verticals(internal_key, display_label),
       countries(iso_code, display_label),
       campaign_types(display_label),
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
  const derivedKeys = Object.keys(calculateDerivedMetrics(raw)) as DerivedMetricKey[];

  // §6: distinguish "your own data is enough" from "the market cohort
  // isn't" — bounded to THIS one campaign's own derivable metrics only
  // (never every campaign, never every metric), all fetched in parallel.
  // last_12_months mirrors the SAME default /benchmark itself opens
  // with (BenchmarkExplorer's DEFAULT_DRAFT) — never a narrower window
  // invented just for this check, which would make the cohort look
  // artificially small.
  let readiness: BenchmarkReadinessEntry[] = [];
  if (dataset.platforms?.internal_key && dataset.objectives?.internal_key && dataset.verticals?.internal_key && dataset.countries?.iso_code) {
    const query = {
      platform: dataset.platforms.internal_key,
      objective: dataset.objectives.internal_key,
      vertical: dataset.verticals.internal_key,
      country: dataset.countries.iso_code,
      timeWindow: { kind: "last_12_months" as const },
    };
    readiness = await Promise.all(
      derivedKeys.map(async (metric) => {
        const result = await getMetricBenchmark(query, metric);
        return { metric, sufficientData: result.sufficientData, cohortSampleSize: result.cohortSampleSize };
      })
    );
  }

  const exportProfileLabelKey = dataset.import_batches?.export_profile
    ? EXPORT_PROFILE_LABEL_KEYS[dataset.import_batches.export_profile as ExportProfileId] ?? null
    : null;

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
    />
  );
}
