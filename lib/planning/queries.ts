import { createServerSupabaseClient } from "@/lib/supabase/server";
import { platformsForCategory, platformsForCountry, formatsForCategory, latestSnapshotPerMetric } from "@/lib/media/filter";
import { groupRateCardsByIdentity, type RateCardIdentity, type RateCardLike } from "@/lib/media/rateCardHistory";
import { buildOpportunities, type OpportunityTaxonomyCombo, type PlanningOpportunity } from "./opportunity";

// Phase 20 §3/§4/§34: discovery + opportunity assembly. Batched
// queries only (never N+1 per outlet) — every table is fetched once
// per call, scoped to the already-matched platform ids, matching the
// exact batching discipline lib/media/catalog.ts already established.

export interface PlanningFilters {
  countryId?: string | null;
  categoryId?: string | null;
  platformId?: string | null;
  mediaFormatId?: string | null;
}

interface RateCardRow extends RateCardLike, RateCardIdentity {
  id: string;
  source: string;
  sourceReference: string | null;
}

export interface PlatformRow {
  id: string;
  internal_key: string;
  display_label: string;
  media_category_id: string | null;
  is_global: boolean;
}

export interface PublicSignalEntry {
  platform_id: string;
  metric_definition_id: string;
  value: number;
  observed_at: string;
  source: string;
}

export interface PlanningResult {
  opportunities: PlanningOpportunity<RateCardRow>[];
  platforms: PlatformRow[];
  categories: { id: string; internal_key: string; display_label: string }[];
  formats: { id: string; media_category_id: string; internal_key: string; display_label: string }[];
  properties: { id: string; platform_id: string; internal_key: string; display_label: string }[];
  metricDefinitions: { id: string; internal_key: string; display_label: string; unit_type: string }[];
  // Latest observation per public metric, per platform — never the
  // full history (a planning glance, not a chart; matches the same
  // "latest snapshot per metric" discipline getMediaProfile uses).
  latestSignalsByPlatform: Record<string, { metric_definition_id: string; value: number; observed_at: string; source: string }[]>;
}

async function assembleOpportunities(supabase: ReturnType<typeof createServerSupabaseClient>, combos: OpportunityTaxonomyCombo[], platformIds: string[]) {
  if (platformIds.length === 0) {
    return { opportunities: [] as PlanningOpportunity<RateCardRow>[], latestSignalsByPlatform: {} as PlanningResult["latestSignalsByPlatform"], metricDefinitions: [] as PlanningResult["metricDefinitions"] };
  }

  const [rateCards, snapshots, metricDefs] = await Promise.all([
    // §5: only active + superseded are fetched — pending/rejected are
    // never eligible as a canonical current or previous price, and
    // future-dated/expired rows are excluded by resolveCurrentRateCard
    // (reused inside groupRateCardsByIdentity below), not re-filtered
    // here.
    supabase
      .from("media_rate_cards")
      .select("id, platform_id, media_property_id, media_format_id, price, currency, pricing_unit, valid_from, valid_to, source, source_reference, status")
      .in("platform_id", platformIds)
      .in("status", ["active", "superseded"]),
    // §12/§19B precedent: only status="active" public signals are ever
    // shown — a pending audience-metric submission is never presented
    // as a verified public signal.
    supabase
      .from("public_media_metric_snapshots")
      .select("platform_id, metric_definition_id, value, observed_at, source")
      .in("platform_id", platformIds)
      .eq("status", "active")
      .order("observed_at", { ascending: false }),
    supabase.from("public_media_metric_definitions").select("id, internal_key, display_label, unit_type"),
  ]);

  const rateCardInputs: RateCardRow[] = (rateCards.data ?? []).map((rc) => ({
    id: rc.id,
    platformId: rc.platform_id,
    propertyId: rc.media_property_id,
    mediaFormatId: rc.media_format_id,
    price: rc.price,
    currency: rc.currency,
    pricingUnit: rc.pricing_unit,
    status: rc.status as "active" | "superseded",
    validFrom: rc.valid_from,
    validTo: rc.valid_to,
    source: rc.source,
    sourceReference: rc.source_reference,
  }));

  const rateCardGroups = groupRateCardsByIdentity(rateCardInputs, new Date());
  const opportunities = buildOpportunities(combos, rateCardGroups);

  const snapshotsByPlatform = new Map<string, PublicSignalEntry[]>();
  for (const row of (snapshots.data ?? []) as PublicSignalEntry[]) {
    const list = snapshotsByPlatform.get(row.platform_id) ?? [];
    list.push(row);
    snapshotsByPlatform.set(row.platform_id, list);
  }
  const latestSignalsByPlatform: PlanningResult["latestSignalsByPlatform"] = {};
  for (const [platformId, rows] of snapshotsByPlatform.entries()) {
    latestSignalsByPlatform[platformId] = Array.from(latestSnapshotPerMetric(rows).values());
  }

  return { opportunities, latestSignalsByPlatform, metricDefinitions: metricDefs.data ?? [] };
}

// §3: discovery — builds the taxonomy-driven combo list from the
// user's filters, reusing the exact SAME generic filter functions
// (platformsForCategory/platformsForCountry/formatsForCategory) the
// media catalog and the contribution wizard already use — never a
// third, parallel implementation of category/country filtering.
export async function getPlanningOpportunities(filters: PlanningFilters): Promise<PlanningResult> {
  const supabase = createServerSupabaseClient();

  const [categories, platformsRes, platformCountries, formatsRes, outletFormats] = await Promise.all([
    supabase.from("media_categories").select("id, internal_key, display_label").eq("active", true),
    // §5 applied to the outlet itself: only status="active" platforms
    // are eligible planning opportunities — a pending media entity
    // (e.g. one still awaiting curator review) never appears here,
    // same governance boundary the curator queue already enforces.
    // `active` (boolean) defaults true even for pending-status rows
    // (migration 0013), so `status` is the field that actually gates
    // this — both are checked for clarity.
    supabase.from("platforms").select("id, internal_key, display_label, media_category_id, is_global, status").eq("active", true).eq("status", "active"),
    supabase.from("platform_countries").select("platform_id, country_id"),
    supabase.from("media_formats").select("id, media_category_id, internal_key, display_label").eq("active", true),
    supabase.from("media_outlet_formats").select("platform_id, media_format_id"),
  ]);

  let matchedPlatforms = platformsForCategory(platformsRes.data ?? [], filters.categoryId ?? null);
  matchedPlatforms = platformsForCountry(matchedPlatforms, platformCountries.data ?? [], filters.countryId ?? null);
  if (filters.platformId) matchedPlatforms = matchedPlatforms.filter((p) => p.id === filters.platformId);

  const platformIds = matchedPlatforms.map((p) => p.id);

  const properties =
    platformIds.length > 0
      ? await supabase.from("media_properties").select("id, platform_id, internal_key, display_label").in("platform_id", platformIds).eq("active", true)
      : { data: [] as { id: string; platform_id: string; internal_key: string; display_label: string }[] };

  const outletFormatsByPlatform = new Map<string, Set<string>>();
  for (const row of outletFormats.data ?? []) {
    const set = outletFormatsByPlatform.get(row.platform_id) ?? new Set<string>();
    set.add(row.media_format_id);
    outletFormatsByPlatform.set(row.platform_id, set);
  }

  const combos: OpportunityTaxonomyCombo[] = [];
  for (const platform of matchedPlatforms) {
    const categoryFormats = platform.media_category_id ? formatsForCategory(formatsRes.data ?? [], platform.media_category_id) : [];
    // Outlet-specific override (media_outlet_formats) narrows the
    // generic category list when present — matches the migration's own
    // documented intent ("optional override/addition on top of the
    // category-level applicability... not required for every outlet").
    // Falls back to the full category list otherwise, the same
    // additive-fallback shape Phase 19B already used for paid-media
    // categories with no seeded media_category_metrics rows.
    const override = outletFormatsByPlatform.get(platform.id);
    let allowedFormatIds = override && override.size > 0 ? Array.from(override) : categoryFormats.map((f) => f.id);
    if (filters.mediaFormatId) allowedFormatIds = allowedFormatIds.filter((id) => id === filters.mediaFormatId);

    const platformProperties = (properties.data ?? []).filter((p) => p.platform_id === platform.id);
    const propertyIds: (string | null)[] = platformProperties.length > 0 ? platformProperties.map((p) => p.id) : [null];

    for (const formatId of allowedFormatIds) {
      for (const propertyId of propertyIds) {
        combos.push({ platformId: platform.id, propertyId, mediaFormatId: formatId });
      }
    }
  }

  const assembled = await assembleOpportunities(supabase, combos, platformIds);

  return {
    opportunities: assembled.opportunities,
    platforms: matchedPlatforms,
    categories: categories.data ?? [],
    formats: formatsRes.data ?? [],
    properties: properties.data ?? [],
    metricDefinitions: assembled.metricDefinitions,
    latestSignalsByPlatform: assembled.latestSignalsByPlatform,
  };
}

// §28/§29: recalculation for a saved scenario — takes the exact
// identities that were stored (never a derived value) and re-resolves
// current rate cards/public signals from scratch, exactly as if the
// planner had just selected them again. Used by getScenarioAction on
// reopen; never called with data read from anywhere but the DB.
export async function getOpportunitiesByIdentities(combos: OpportunityTaxonomyCombo[]): Promise<PlanningOpportunity<RateCardRow>[]> {
  if (combos.length === 0) return [];
  const supabase = createServerSupabaseClient();
  const platformIds = Array.from(new Set(combos.map((c) => c.platformId)));
  const assembled = await assembleOpportunities(supabase, combos, platformIds);
  return assembled.opportunities;
}
