"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calculateDerivedMetrics, type RawMetricInputs } from "@/lib/metrics/derive";
import { isSupportedCurrencyCode } from "@/lib/config/currencies";

export interface ContributionPayload {
  platformId: string;
  campaignTypeId: string | null;
  objectiveId: string;
  verticalId: string;
  countryId: string;
  businessModelId: string | null;
  performanceScope: string;
  audienceStrategyId: string | null;
  funnelStageId: string | null;
  minAge: number | null;
  maxAge: number | null;
  genderTargeting: string;
  geographicScope: string | null;
  startDate: string;
  endDate: string;
  currency: string;
  adSpend: number;
  rawMetrics: Partial<Record<string, number>>;
  videoViewVariantId: string | null;
}

export interface SubmitContributionResult {
  error?: string;
  datasetId?: string;
}

// Metric internal_keys this form collects as raw/base values, beyond
// ad_spend (handled separately since it's always required).
const RAW_METRIC_KEYS = [
  "impressions",
  "reach",
  "clicks",
  "link_clicks",
  "landing_page_views",
  "video_views",
  "engagements",
  "conversions",
  "attributed_revenue",
  "total_revenue",
] as const;

export async function submitContributionAction(
  payload: ContributionPayload
): Promise<SubmitContributionResult> {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "not_authenticated" };

  // Server-side validation — never trust the client, even though the
  // form also validates these before allowing submission.
  if (new Date(payload.endDate) < new Date(payload.startDate)) {
    return { error: "invalid_date_range" };
  }
  if (!Number.isFinite(payload.adSpend) || payload.adSpend < 0) {
    return { error: "invalid_spend" };
  }
  // Phase 19B item 4: controlled supported set, not a length check —
  // see lib/config/currencies.ts (centralized list).
  if (!isSupportedCurrencyCode(payload.currency)) {
    return { error: "invalid_currency" };
  }

  const { data: dataset, error: datasetError } = await supabase
    .from("performance_datasets")
    .insert({
      owner_user_id: user.id,
      platform_id: payload.platformId,
      campaign_type_id: payload.campaignTypeId,
      objective_id: payload.objectiveId,
      vertical_id: payload.verticalId,
      country_id: payload.countryId,
      business_model_id: payload.businessModelId,
      performance_scope: payload.performanceScope as never,
      audience_strategy_id: payload.audienceStrategyId,
      funnel_stage_id: payload.funnelStageId,
      min_age: payload.minAge,
      max_age: payload.maxAge,
      gender_targeting: payload.genderTargeting as never,
      geographic_scope: payload.geographicScope as never,
      start_date: payload.startDate,
      end_date: payload.endDate,
      original_currency: payload.currency.toUpperCase(),
      data_source: "manual",
      validation_status: "pending",
    })
    .select("id")
    .single();

  if (datasetError || !dataset) {
    return { error: "generic_error" };
  }

  // Look up metric ids for every internal_key we might insert, in one
  // query, rather than one round-trip per metric.
  const neededKeys = ["ad_spend", ...RAW_METRIC_KEYS, "cpm", "ctr", "cpc", "frequency", "cpv", "cpe", "cpa", "cpl", "roas", "acos", "tacos"];
  const { data: metricRows } = await supabase
    .from("metrics")
    .select("id, internal_key")
    .in("internal_key", neededKeys);

  const metricIdByKey = new Map((metricRows ?? []).map((m) => [m.internal_key, m.id]));

  const rawInputs: RawMetricInputs = {
    ad_spend: payload.adSpend,
    impressions: payload.rawMetrics.impressions,
    reach: payload.rawMetrics.reach,
    clicks: payload.rawMetrics.clicks,
    video_views: payload.rawMetrics.video_views,
    engagements: payload.rawMetrics.engagements,
    conversions: payload.rawMetrics.conversions,
    attributed_revenue: payload.rawMetrics.attributed_revenue,
    total_revenue: payload.rawMetrics.total_revenue,
  };

  type ValueRow = { dataset_id: string; metric_id: string; raw_numeric_value: number; metric_definition_variant_id: string | null };
  const rows: ValueRow[] = [];

  // Raw values: ad_spend always, plus whichever optional raw metrics
  // the user actually entered (never insert a metric the user left
  // blank — that would fabricate a zero observation).
  const rawEntries: [string, number | undefined, string | null][] = [
    ["ad_spend", payload.adSpend, null],
    ...RAW_METRIC_KEYS.map(
      (key): [string, number | undefined, string | null] => [
        key,
        payload.rawMetrics[key],
        key === "video_views" ? payload.videoViewVariantId : null,
      ]
    ),
  ];

  for (const [key, value, variantId] of rawEntries) {
    const metricId = metricIdByKey.get(key);
    if (!metricId || value === undefined || value === null || Number.isNaN(value)) continue;
    rows.push({ dataset_id: dataset.id, metric_id: metricId, raw_numeric_value: value, metric_definition_variant_id: variantId });
  }

  // Derived values, computed server-side from the same raw inputs —
  // never trust a client-computed derived value.
  const derived = calculateDerivedMetrics(rawInputs);
  for (const [key, value] of Object.entries(derived)) {
    const metricId = metricIdByKey.get(key);
    if (!metricId || value === undefined) continue;
    // cpv inherits the video_views variant, since it's defined from the
    // same underlying view event. Other derived metrics (ctr, cpc) have
    // no captured variant in this MVP form — stored as the "no variant"
    // case (null), a known scope limitation, not silently invented
    // cross-platform equivalence.
    const variantId = key === "cpv" ? payload.videoViewVariantId : null;
    rows.push({ dataset_id: dataset.id, metric_id: metricId, raw_numeric_value: value, metric_definition_variant_id: variantId });
  }

  if (rows.length > 0) {
    const { error: valuesError } = await supabase.from("dataset_metric_values").insert(rows);
    if (valuesError) {
      // The dataset row exists but its values failed — surface this
      // rather than silently returning success with partial data.
      return { error: "generic_error", datasetId: dataset.id };
    }
  }

  return { datasetId: dataset.id };
}
