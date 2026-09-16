import { createServerSupabaseClient } from "@/lib/supabase/server";
import { latestSnapshotPerMetric } from "./filter";

// Phase 17: fetches the full media catalog in a small, fixed number
// of queries (not N+1 per platform) — public reference taxonomy only,
// same RLS pattern as getContributionTaxonomies. Never touches
// performance_datasets/dataset_metric_values (private contribution
// data stays exactly as private as before this phase).
export async function getMediaCatalog() {
  const supabase = createServerSupabaseClient();

  const [categories, platforms, platformCountries, countries, formats, metricFamilies, categoryMetrics, metrics] = await Promise.all([
    supabase.from("media_categories").select("id, internal_key, display_label, display_order").eq("active", true).order("display_order"),
    supabase.from("platforms").select("id, internal_key, display_label, media_category_id, is_global, status, display_order").eq("active", true).order("display_order"),
    supabase.from("platform_countries").select("platform_id, country_id"),
    supabase.from("countries").select("id, iso_code, display_label").eq("active", true).order("display_order"),
    supabase.from("media_formats").select("id, media_category_id, internal_key, display_label, display_order").eq("active", true).order("display_order"),
    supabase.from("metric_families").select("id, internal_key, display_label, display_order").order("display_order"),
    supabase.from("media_category_metrics").select("media_category_id, metric_id, required"),
    supabase.from("metrics").select("id, internal_key, display_label").eq("active", true),
  ]);

  return {
    categories: categories.data ?? [],
    platforms: platforms.data ?? [],
    platformCountries: platformCountries.data ?? [],
    countries: countries.data ?? [],
    formats: formats.data ?? [],
    metricFamilies: metricFamilies.data ?? [],
    categoryMetrics: categoryMetrics.data ?? [],
    metrics: metrics.data ?? [],
    hasError: !!(categories.error || platforms.error || platformCountries.error || countries.error || formats.error),
  };
}

export type MediaCatalog = Awaited<ReturnType<typeof getMediaCatalog>>;

// Phase 17 extension: single-outlet profile data. Latest snapshot per
// metric only (not the full history — a profile is a glance, not a
// chart), and only currently-active rate cards. Both queries are
// filtered server-side, not loaded-then-filtered client-side, per
// item 59 (avoid loading the whole catalog everywhere).
export async function getMediaProfile(slug: string) {
  const supabase = createServerSupabaseClient();

  const { data: platform } = await supabase
    .from("platforms")
    .select("id, internal_key, display_label, media_category_id, is_global, status, website_domain")
    .eq("internal_key", slug)
    .maybeSingle();

  if (!platform) return null;

  const [category, platformCountryRows, allCountries, snapshots, metricDefs, rateCards, formats] = await Promise.all([
    platform.media_category_id
      ? supabase.from("media_categories").select("id, internal_key, display_label").eq("id", platform.media_category_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("platform_countries").select("country_id").eq("platform_id", platform.id),
    supabase.from("countries").select("id, iso_code, display_label"),
    supabase.from("public_media_metric_snapshots").select("metric_definition_id, value, observed_at, source").eq("platform_id", platform.id).order("observed_at", { ascending: false }),
    supabase.from("public_media_metric_definitions").select("id, internal_key, display_label, unit_type"),
    supabase.from("media_rate_cards").select("id, media_format_id, price, currency, pricing_unit, valid_from, valid_to, source, status").eq("platform_id", platform.id).eq("status", "active").order("valid_from", { ascending: false }),
    platform.media_category_id
      ? supabase.from("media_formats").select("id, internal_key, display_label").eq("media_category_id", platform.media_category_id).eq("active", true)
      : Promise.resolve({ data: [] }),
  ]);

  const countryIds = new Set((platformCountryRows.data ?? []).map((r) => r.country_id));
  const countries = (allCountries.data ?? []).filter((c) => countryIds.has(c.id));

  // Reduce snapshots to the latest observation per metric definition —
  // the query above is already ordered desc by observed_at, so the
  // pure helper's "first occurrence wins" reduction gives the latest.
  const latestByMetric = latestSnapshotPerMetric(snapshots.data ?? []);

  return {
    platform,
    category: category.data,
    countries,
    latestMetrics: Array.from(latestByMetric.entries()).map(([metricDefinitionId, snap]) => ({
      definition: (metricDefs.data ?? []).find((d) => d.id === metricDefinitionId) ?? null,
      ...snap,
    })).filter((m) => m.definition !== null),
    metricDefinitions: metricDefs.data ?? [],
    rateCards: (rateCards.data ?? []).map((rc) => ({
      ...rc,
      format: (formats.data ?? []).find((f) => f.id === rc.media_format_id) ?? null,
    })),
    formats: formats.data ?? [],
  };
}

export type MediaProfile = NonNullable<Awaited<ReturnType<typeof getMediaProfile>>>;

