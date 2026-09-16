"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calculateDerivedMetrics, type RawMetricInputs } from "@/lib/metrics/derive";
import type { NormalizedRow } from "@/lib/import/types";

// Phase 16 bulk-import persistence. Reuses the exact same canonical
// path as the single-entry contribution flow (app/contribute/
// actions.ts's submitContributionAction): performance_datasets +
// dataset_metric_values, calculateDerivedMetrics for every derived
// value, RLS-enforced ownership via the session-aware client. Never
// reimplements the normalization math — imported data only ever
// reaches the benchmark engine through the same path manual
// contributions already use.
//
// Only rows already marked "valid" by lib/import/validate.ts are
// accepted here; this is a defensive second check (server-side
// validation is authoritative, per Phase 16 item 43), not the
// primary validation pass.

const RAW_METRIC_KEYS = [
  "impressions", "reach", "clicks", "link_clicks", "landing_page_views",
  "video_views", "engagements", "conversions", "attributed_revenue", "total_revenue",
] as const;

export interface BulkImportResult {
  ok: boolean;
  imported: number;
  failed: number;
  error?: "not_authenticated" | "no_valid_rows" | "taxonomy_lookup_failed";
}

export async function bulkSubmitContributionsAction(
  rows: NormalizedRow[],
  dataSource: "csv" | "xlsx" | "manual"
): Promise<BulkImportResult> {
  // The DB's data_source enum has no distinct "xlsx" value (it's
  // "manual" | "csv" | "api" | "admin_import" | "other") — xlsx
  // imports are recorded as "other" rather than silently miscoding
  // them as "csv", which would misrepresent the actual source.
  const dbDataSource = dataSource === "xlsx" ? "other" : dataSource;
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, imported: 0, failed: 0, error: "not_authenticated" };

  const validRows = rows.filter((r) => r.status === "valid" && r.platform && r.objective && r.vertical && r.country && r.startDate && r.endDate && r.adSpend !== null);
  if (validRows.length === 0) return { ok: false, imported: 0, failed: 0, error: "no_valid_rows" };

  // Resolve every taxonomy internal_key/iso_code -> real row id, and
  // every metric internal_key -> real metric id, in a small constant
  // number of queries (not one per row) — Phase 16 item 47.
  const [platformsRes, objectivesRes, verticalsRes, countriesRes, businessModelsRes, audienceStrategiesRes, funnelStagesRes, metricsRes] = await Promise.all([
    supabase.from("platforms").select("id, internal_key"),
    supabase.from("objectives").select("id, internal_key"),
    supabase.from("verticals").select("id, internal_key"),
    supabase.from("countries").select("id, iso_code"),
    supabase.from("business_models").select("id, internal_key"),
    supabase.from("audience_strategies").select("id, internal_key"),
    supabase.from("funnel_stages").select("id, internal_key"),
    supabase.from("metrics").select("id, internal_key").in("internal_key", ["ad_spend", ...RAW_METRIC_KEYS, "cpm", "ctr", "cpc", "frequency", "cpv", "cpe", "cpa", "cpl", "roas", "acos", "tacos"]),
  ]);

  if (platformsRes.error || objectivesRes.error || verticalsRes.error || countriesRes.error || metricsRes.error) {
    console.error("[bulk-import] taxonomy lookup failed", { platformsRes, objectivesRes, verticalsRes, countriesRes, metricsRes });
    return { ok: false, imported: 0, failed: 0, error: "taxonomy_lookup_failed" };
  }

  const byKey = (rows: { id: string; internal_key?: string; iso_code?: string }[] | null) =>
    new Map((rows ?? []).map((r) => [r.internal_key ?? r.iso_code ?? "", r.id]));

  const platformIds = byKey(platformsRes.data);
  const objectiveIds = byKey(objectivesRes.data);
  const verticalIds = byKey(verticalsRes.data);
  const countryIds = byKey(countriesRes.data);
  const businessModelIds = byKey(businessModelsRes.data);
  const audienceStrategyIds = byKey(audienceStrategiesRes.data);
  const funnelStageIds = byKey(funnelStagesRes.data);
  const metricIds = byKey(metricsRes.data);

  let imported = 0;
  let failed = 0;

  for (const row of validRows) {
    const platformId = platformIds.get(row.platform!);
    const objectiveId = objectiveIds.get(row.objective!);
    const verticalId = verticalIds.get(row.vertical!);
    const countryId = countryIds.get(row.country!);
    if (!platformId || !objectiveId || !verticalId || !countryId) {
      failed++;
      continue;
    }

    const { data: dataset, error: datasetError } = await supabase
      .from("performance_datasets")
      .insert({
        owner_user_id: user.id,
        platform_id: platformId,
        campaign_type_id: null,
        objective_id: objectiveId,
        vertical_id: verticalId,
        country_id: countryId,
        business_model_id: row.businessModel ? businessModelIds.get(row.businessModel) ?? null : null,
        performance_scope: "individual_campaign",
        audience_strategy_id: row.audienceStrategy ? audienceStrategyIds.get(row.audienceStrategy) ?? null : null,
        funnel_stage_id: row.funnelStage ? funnelStageIds.get(row.funnelStage) ?? null : null,
        min_age: null,
        max_age: null,
        gender_targeting: "not_specified",
        geographic_scope: null,
        start_date: row.startDate!,
        end_date: row.endDate!,
        original_currency: row.currency,
        data_source: dbDataSource,
        validation_status: "pending",
      })
      .select("id")
      .single();

    if (datasetError || !dataset) {
      failed++;
      continue;
    }

    const rawInputs: RawMetricInputs = { ad_spend: row.adSpend ?? undefined, ...row.rawMetrics };
    type ValueRow = { dataset_id: string; metric_id: string; raw_numeric_value: number; metric_definition_variant_id: null };
    const valueRows: ValueRow[] = [];

    const rawEntries: [string, number | undefined][] = [["ad_spend", row.adSpend ?? undefined], ...RAW_METRIC_KEYS.map((k): [string, number | undefined] => [k, row.rawMetrics[k]])];
    for (const [key, value] of rawEntries) {
      const metricId = metricIds.get(key);
      if (!metricId || value === undefined || value === null || Number.isNaN(value)) continue;
      valueRows.push({ dataset_id: dataset.id, metric_id: metricId, raw_numeric_value: value, metric_definition_variant_id: null });
    }

    // Same canonical derivation used by the single-entry flow — never
    // reimplemented here.
    const derived = calculateDerivedMetrics(rawInputs);
    for (const [key, value] of Object.entries(derived)) {
      const metricId = metricIds.get(key);
      if (!metricId || value === undefined) continue;
      valueRows.push({ dataset_id: dataset.id, metric_id: metricId, raw_numeric_value: value, metric_definition_variant_id: null });
    }

    if (valueRows.length > 0) {
      const { error: valuesError } = await supabase.from("dataset_metric_values").insert(valueRows);
      if (valuesError) {
        failed++;
        continue;
      }
    }
    imported++;
  }

  return { ok: imported > 0, imported, failed };
}
