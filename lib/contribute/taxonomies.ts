import { createServerSupabaseClient } from "@/lib/supabase/server";

// All reference/taxonomy tables allow public SELECT of active rows
// (see 0007_row_level_security.sql), so this works with the same
// RLS-scoped server client used everywhere else — no service-role
// client needed just to read taxonomy data.
//
// Phase 9 diagnostic addition: logs only safe, non-secret information
// (env presence, URL protocol, a redacted hostname, format red flags).
// Never logs NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// or the full URL value. NEXT_PUBLIC_SUPABASE_URL is technically public
// (it ships in the browser bundle by design), but this stays
// conservative anyway and only ever logs a redacted form server-side.
function auditSupabaseUrlFormat(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKeyPresent = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url) {
    console.error("[taxonomies][url-audit] NEXT_PUBLIC_SUPABASE_URL is MISSING. anon key present:", anonKeyPresent);
    return;
  }

  const hasLeadingOrTrailingWhitespace = url !== url.trim();
  const hasSurroundingQuotes = /^['"].*['"]$/.test(url);
  const trimmed = url.trim().replace(/^['"]|['"]$/g, "");

  let parsed: URL | null = null;
  try {
    parsed = new URL(trimmed);
  } catch {
    console.error("[taxonomies][url-audit] NEXT_PUBLIC_SUPABASE_URL is not a parseable URL at all.", {
      envPresent: true,
      anonKeyPresent,
      hasLeadingOrTrailingWhitespace,
      hasSurroundingQuotes,
      length: url.length,
    });
    return;
  }

  const redactedHostname = parsed.hostname.replace(/^[^.]+/, "***");
  const looksLikePostgresConnectionString = trimmed.startsWith("postgres://") || trimmed.startsWith("postgresql://");
  const containsRestPath = parsed.pathname.includes("/rest/v1");
  const isLocalhost = ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname);
  const looksLikeSupabaseHost = parsed.hostname.endsWith(".supabase.co") || parsed.hostname.endsWith(".supabase.in");

  console.error("[taxonomies][url-audit]", {
    envPresent: true,
    anonKeyPresent,
    protocol: parsed.protocol,
    hostnameRedacted: redactedHostname,
    hasLeadingOrTrailingWhitespace,
    hasSurroundingQuotes,
    isHttps: parsed.protocol === "https:",
    isLocalhost,
    looksLikeSupabaseHost,
    looksLikePostgresConnectionString,
    containsRestPath,
    pathname: parsed.pathname || "(empty)",
  });
}

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
    mediaCategories,
    platformCountries,
    mediaFormats,
    categoryMetrics,
  ] = await Promise.all([
    // Phase 19B item 2: media_category_id/is_global added (additive
    // select columns only) so the wizard can reuse the SAME category/
    // country filtering already proven by lib/media/filter.ts, rather
    // than a second parallel taxonomy just for contribution.
    supabase.from("platforms").select("id, internal_key, display_label, media_category_id, is_global").eq("active", true).order("display_order"),
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
    supabase.from("media_categories").select("id, internal_key, display_label, display_order").eq("active", true).order("display_order"),
    supabase.from("platform_countries").select("platform_id, country_id"),
    supabase.from("media_formats").select("id, media_category_id, internal_key, display_label, display_order").eq("active", true).order("display_order"),
    supabase.from("media_category_metrics").select("media_category_id, metric_id, required"),
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
    mediaCategories,
    platformCountries,
    mediaFormats,
    categoryMetrics,
  };

  let hasError = false;
  for (const [key, result] of Object.entries(results)) {
    if (result.error) {
      hasError = true;

      // Server-side only — visible in Vercel's function logs, never
      // sent to the browser. Supabase-js/postgrest-js already embeds
      // the underlying network-level cause (DNS/connection/timeout
      // code, e.g. ENOTFOUND/ECONNREFUSED/ETIMEDOUT) INSIDE the
      // `details` string when the raw fetch() call itself throws
      // (rather than PostgREST returning a normal error response) —
      // see node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts.
      // That string can be long/multi-line and easy to miss or have
      // truncated by a log viewer, so it's logged on its own,
      // explicitly labeled line here rather than nested inside an
      // object a viewer might collapse.
      console.error(`[taxonomies] "${key}" query failed — message: ${result.error.message}`);
      console.error(`[taxonomies] "${key}" FULL cause/details (do not truncate): ${result.error.details || "(none)"}`);
      console.error(`[taxonomies] "${key}" code: ${result.error.code || "(empty)"} hint: ${result.error.hint || "(none)"}`);

      // Extract just the "Caused by: X: Y (CODE)" line if present, as a
      // compact one-line summary alongside the full text above.
      const causeMatch = /Caused by: ([^\n]+)/.exec(result.error.details ?? "");
      if (causeMatch) {
        console.error(`[taxonomies] "${key}" extracted cause summary: ${causeMatch[1]}`);
      }
    }
  }

  // Only runs the (cheap, one-time) URL format audit when at least one
  // query actually failed — avoids noise on every successful request.
  if (hasError) {
    auditSupabaseUrlFormat();
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
    // Phase 19B item 2 — additive fields for the category-aware
    // wizard. Existing consumers that don't read them are completely
    // unaffected; every previously-existing field keeps its original
    // shape and meaning.
    mediaCategories: mediaCategories.data ?? [],
    platformCountries: platformCountries.data ?? [],
    mediaFormats: mediaFormats.data ?? [],
    categoryMetrics: categoryMetrics.data ?? [],
    hasError,
  };
}

export type ContributionTaxonomies = Awaited<ReturnType<typeof getContributionTaxonomies>>;
