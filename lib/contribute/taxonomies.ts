import { createServerSupabaseClient } from "@/lib/supabase/server";

// All reference/taxonomy tables allow public SELECT of active rows
// (see 0007_row_level_security.sql), so this works with the same
// RLS-scoped server client used everywhere else — no service-role
// client needed just to read taxonomy data.
export async function getContributionTaxonomies() {
  const supabase = createServerSupabaseClient();

  const [
    platforms,
    campaignTypes,
    objectives,
    verticals,
    countries,
    businessModels,
    audienceStrategies,
    funnelStages,
    metrics,
    platformMetrics,
    metricVariants,
  ] = await Promise.all([
    supabase.from("platforms").select("id, internal_key, display_label").eq("active", true).order("display_order"),
    supabase.from("campaign_types").select("id, platform_id, internal_key, display_label").eq("active", true).order("display_order"),
    supabase.from("objectives").select("id, internal_key, display_label").eq("active", true).order("display_order"),
    supabase.from("verticals").select("id, internal_key, display_label").eq("active", true).order("display_order"),
    supabase.from("countries").select("id, iso_code, display_label").eq("active", true).order("display_order"),
    supabase.from("business_models").select("id, internal_key, display_label").eq("active", true).order("display_order"),
    supabase.from("audience_strategies").select("id, internal_key, display_label").eq("active", true).order("display_order"),
    supabase.from("funnel_stages").select("id, internal_key, display_label").eq("active", true).order("display_order"),
    supabase.from("metrics").select("id, internal_key, display_label, metric_kind, unit_type").eq("active", true),
    supabase.from("platform_metrics").select("platform_id, metric_id, required").eq("active", true),
    supabase.from("metric_definition_variants").select("id, metric_id, internal_key, display_label, is_unknown_default").eq("active", true),
  ]);

  return {
    platforms: platforms.data ?? [],
    campaignTypes: campaignTypes.data ?? [],
    objectives: objectives.data ?? [],
    verticals: verticals.data ?? [],
    countries: countries.data ?? [],
    businessModels: businessModels.data ?? [],
    audienceStrategies: audienceStrategies.data ?? [],
    funnelStages: funnelStages.data ?? [],
    metrics: metrics.data ?? [],
    platformMetrics: platformMetrics.data ?? [],
    metricVariants: metricVariants.data ?? [],
  };
}

export type ContributionTaxonomies = Awaited<ReturnType<typeof getContributionTaxonomies>>;
