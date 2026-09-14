import { createServerSupabaseClient } from "@/lib/supabase/server";

// All reference/taxonomy tables allow public SELECT of active rows
// (see 0007_row_level_security.sql), so this works with the same
// RLS-scoped server client used everywhere else — no service-role
// client needed just to read taxonomy data.
//
// Phase 9 production-blocker fix: every field below used to be
// `X.data ?? []`, which silently turned ANY Supabase error (RLS denial,
// missing grant, connection issue, wrong table name, anything) into an
// empty array indistinguishable from "this table is legitimately
// empty." That is exactly why /benchmark's selectors could render
// empty in production with zero trace in any log. Every query result
// is now checked for `.error` — if any occurred, it's logged
// server-side (visible in Vercel's function logs) and the overall
// result is marked `hasError: true` so the UI can show a real failure
// state instead of silently rendering empty dropdowns.
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

  const results = {
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
  };

  let hasError = false;
  for (const [key, result] of Object.entries(results)) {
    if (result.error) {
      hasError = true;
      // Server-side only — visible in Vercel's function logs, never
      // sent to the browser. Logs the table/query key and Supabase's
      // error code/message so a real failure (RLS denial, missing
      // grant, connection issue, etc.) is finally observable instead
      // of silently becoming an empty dropdown.
      console.error(`[taxonomies] "${key}" query failed:`, {
        message: result.error.message,
        code: result.error.code,
        details: result.error.details,
        hint: result.error.hint,
      });
    }
  }

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
    // New, additive field — existing consumers that don't read it are
    // completely unaffected; every array field keeps its original
    // shape and meaning.
    hasError,
  };
}

export type ContributionTaxonomies = Awaited<ReturnType<typeof getContributionTaxonomies>>;
