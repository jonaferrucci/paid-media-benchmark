import { createServerSupabaseClient } from "@/lib/supabase/server";
import { latestSnapshotPerMetric, digitalMediaCategories, digitalMediaPlatforms } from "./filter";
import { resolveLatestAndPrevious, computeChange, isChangeMeaningful, trendEligibility } from "./trend";
import { groupRateCardsByIdentity } from "./rateCardHistory";

// Phase 17: fetches the full media catalog in a small, fixed number
// of queries (not N+1 per platform) — public reference taxonomy only,
// same RLS pattern as getContributionTaxonomies. Never touches
// performance_datasets/dataset_metric_values (private contribution
// data stays exactly as private as before this phase).
export async function getMediaCatalog() {
  const supabase = createServerSupabaseClient();

  const [categories, platforms, platformCountries, countries, formats, metricFamilies, categoryMetrics, metrics, activeRateCards, activeSnapshots] = await Promise.all([
    supabase.from("media_categories").select("id, internal_key, display_label, display_order").eq("active", true).order("display_order"),
    supabase.from("platforms").select("id, internal_key, display_label, media_category_id, is_global, status, display_order").eq("active", true).order("display_order"),
    supabase.from("platform_countries").select("platform_id, country_id"),
    supabase.from("countries").select("id, iso_code, display_label").eq("active", true).order("display_order"),
    supabase.from("media_formats").select("id, media_category_id, internal_key, display_label, display_order").eq("active", true).order("display_order"),
    supabase.from("metric_families").select("id, internal_key, display_label, display_order").order("display_order"),
    supabase.from("media_category_metrics").select("media_category_id, metric_id, required"),
    supabase.from("metrics").select("id, internal_key, display_label").eq("active", true),
    // Phase 20D item 11: a presence-only check (which outlets have a
    // currently active rate card) so media cards can honestly say
    // "Tarifario disponible" / "Sin tarifario" — never a price value,
    // just whether one exists, and never N+1 (one query, all rows).
    supabase.from("media_rate_cards").select("platform_id").eq("status", "active"),
    // Phase 21B item 8: a second, equally presence-only check — which
    // outlets have at least one ACTIVE public metric snapshot — so a
    // media card can distinguish "no rate card but real public data
    // exists" from "genuinely nothing yet" instead of collapsing both
    // into one "Sin tarifario" message. Still never a value, just
    // whether a row exists; still one query, no N+1.
    supabase.from("public_media_metric_snapshots").select("platform_id").eq("status", "active"),
  ]);

  // Phase 20D item 6: digital-only scope for the current catalog-
  // expansion phase — see lib/media/filter.ts. Schema/data untouched;
  // non-digital categories simply don't surface in discovery yet.
  const allCategories = categories.data ?? [];
  return {
    categories: digitalMediaCategories(allCategories),
    platforms: digitalMediaPlatforms(platforms.data ?? [], allCategories),
    platformCountries: platformCountries.data ?? [],
    countries: countries.data ?? [],
    formats: formats.data ?? [],
    metricFamilies: metricFamilies.data ?? [],
    categoryMetrics: categoryMetrics.data ?? [],
    metrics: metrics.data ?? [],
    platformsWithRateCard: Array.from(new Set((activeRateCards.data ?? []).map((rc) => rc.platform_id))),
    platformsWithPublicData: Array.from(new Set((activeSnapshots.data ?? []).map((s) => s.platform_id))),
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
    // Phase 19B item 3: only status="active" snapshots are shown on
    // the public profile — a pending submission is never presented as
    // a verified public signal (same governance shape rate cards
    // already had). Existing rows were backfilled to "active" by
    // migration 0014, so previously-visible data is unaffected.
    supabase.from("public_media_metric_snapshots").select("metric_definition_id, value, observed_at, source").eq("platform_id", platform.id).eq("status", "active").order("observed_at", { ascending: false }),
    supabase.from("public_media_metric_definitions").select("id, internal_key, display_label, unit_type"),
    // Phase 19B item 1: fetches active+superseded+pending (not just
    // active) so the profile can compute previous-compatible-price/
    // change/compact-history (needs superseded rows) and can honestly
    // note pending submissions awaiting review (needs pending rows,
    // counted only — never shown as a price, per groupRateCardsByIdentity).
    // "rejected" rows are excluded — a curator-rejected submission was
    // never a real price and should never surface here at all.
    supabase.from("media_rate_cards").select("id, media_property_id, media_format_id, price, currency, pricing_unit, valid_from, valid_to, source, source_reference, status").eq("platform_id", platform.id).in("status", ["active", "superseded", "pending"]).order("valid_from", { ascending: false }),
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

  // Full per-metric history (already desc-ordered from the query) for
  // change/trend computation — same underlying query, no extra round
  // trip (item 16: avoid N+1 / redundant queries).
  const historyByMetric = new Map<string, typeof snapshots.data>();
  for (const row of snapshots.data ?? []) {
    const list = historyByMetric.get(row.metric_definition_id) ?? [];
    list.push(row);
    historyByMetric.set(row.metric_definition_id, list);
  }

  const metricIntelligence = Array.from(latestByMetric.entries()).map(([metricDefinitionId, snap]) => {
    const definition = (metricDefs.data ?? []).find((d) => d.id === metricDefinitionId) ?? null;
    const history = historyByMetric.get(metricDefinitionId) ?? [];
    const { latest, previous } = resolveLatestAndPrevious(history);
    const change = latest && previous && definition && isChangeMeaningful(definition.unit_type)
      ? computeChange(previous.value, latest.value)
      : null;
    return {
      definition,
      latest: snap,
      previous,
      change,
      eligibility: trendEligibility(history.length),
      history,
    };
  }).filter((m) => m.definition !== null);

  // Phase 19B item 1: shape the raw rows into the RateCardLike &
  // RateCardIdentity structure lib/media/rateCardHistory.ts's pure
  // helpers expect, then group by exact compatible identity — the
  // page renders current/previous/change/history per group, it never
  // re-derives any of this comparison logic itself.
  const rateCardInputs = (rateCards.data ?? []).map((rc) => ({
    id: rc.id,
    platformId: platform.id,
    propertyId: rc.media_property_id,
    mediaFormatId: rc.media_format_id,
    price: rc.price,
    currency: rc.currency,
    pricingUnit: rc.pricing_unit,
    status: rc.status as "active" | "superseded" | "pending",
    validFrom: rc.valid_from,
    validTo: rc.valid_to,
    source: rc.source,
    sourceReference: rc.source_reference,
  }));

  const rateCardGroups = groupRateCardsByIdentity(rateCardInputs, new Date()).map((group) => ({
    ...group,
    format: (formats.data ?? []).find((f) => f.id === group.identity.mediaFormatId) ?? null,
  }));

  return {
    platform,
    category: category.data,
    countries,
    latestMetrics: metricIntelligence,
    metricDefinitions: metricDefs.data ?? [],
    rateCardGroups,
    formats: formats.data ?? [],
  };
}

export type MediaProfile = NonNullable<Awaited<ReturnType<typeof getMediaProfile>>>;

