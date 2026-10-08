import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdPlatformCategory } from "./filter";

// Phase 19B item 3 — read-side of the minimal governance workflow.
// Mirrors lib/media/catalog.ts's shape (a few fixed queries, never
// N+1) and lib/contribute/taxonomies.ts's "check every result for an
// error" discipline, since a silently-empty queue is indistinguishable
// from "nothing pending" otherwise.

export async function getCurrentProfileIsCurator(): Promise<{ userId: string | null; isCurator: boolean }> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, isCurator: false };

  const { data: profile } = await supabase.from("profiles").select("is_curator").eq("id", user.id).maybeSingle();
  return { userId: user.id, isCurator: profile?.is_curator === true };
}

export async function getGovernanceQueue() {
  const supabase = createServerSupabaseClient();

  // RLS (migration 0014) is what actually restricts these rows to
  // curators for the write side; the SELECT policies for rate cards
  // and snapshots have always been "publicly readable" (0012's own
  // design — see that migration's comment on why pending stays
  // readable, just never canonical), and platforms' pending rows are
  // already covered by the public "active=true" policy since a
  // pending platform's `active` boolean defaults to true (0002). So
  // this query works for a curator exactly like any other read — the
  // page itself gates who gets to SEE the review UI at all (see
  // requireCurator in governanceActions.ts / app/curation/page.tsx).
  const [
    pendingRateCards,
    pendingSnapshots,
    pendingPlatforms,
    platforms,
    formats,
    metricDefinitions,
    mediaCategories,
    countries,
    platformCountries,
  ] = await Promise.all([
    supabase
      .from("media_rate_cards")
      .select("id, platform_id, media_format_id, price, currency, pricing_unit, valid_from, valid_to, source, source_reference, notes, submitted_by, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("public_media_metric_snapshots")
      .select("id, platform_id, metric_definition_id, value, observed_at, source, source_reference, submitted_by, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    // Media Experience & Governance phase, item B: media_category_id/
    // is_global/website_domain are additive select columns (same
    // columns Catalog/Profile already read) so a pending card can show
    // real entity-type/category/geography context instead of just a
    // name and a key — never a new table or column.
    supabase
      .from("platforms")
      .select("id, internal_key, display_label, status, media_category_id, is_global, website_domain")
      .eq("status", "pending")
      .order("display_order"),
    supabase.from("platforms").select("id, internal_key, display_label"),
    supabase.from("media_formats").select("id, internal_key, display_label"),
    supabase.from("public_media_metric_definitions").select("id, internal_key, display_label"),
    supabase.from("media_categories").select("id, internal_key, display_label"),
    supabase.from("countries").select("id, iso_code, display_label"),
    supabase.from("platform_countries").select("platform_id, country_id"),
  ]);

  const hasError = !!(
    pendingRateCards.error ||
    pendingSnapshots.error ||
    pendingPlatforms.error ||
    platforms.error ||
    formats.error ||
    metricDefinitions.error ||
    mediaCategories.error ||
    countries.error ||
    platformCountries.error
  );
  if (hasError) {
    console.error("[governance] queue lookup failed", {
      pendingRateCards: pendingRateCards.error,
      pendingSnapshots: pendingSnapshots.error,
      pendingPlatforms: pendingPlatforms.error,
      mediaCategories: mediaCategories.error,
      countries: countries.error,
      platformCountries: platformCountries.error,
    });
  }

  const platformById = new Map((platforms.data ?? []).map((p) => [p.id, p]));
  const formatById = new Map((formats.data ?? []).map((f) => [f.id, f]));
  const metricDefById = new Map((metricDefinitions.data ?? []).map((m) => [m.id, m]));

  // Item B: entity-type derivation reuses the SAME category-key
  // heuristic Catalog/Planner already use (lib/media/filter.ts) — never
  // a second classification rule, never a new "entity_type" column.
  const categoryById = new Map((mediaCategories.data ?? []).map((c) => [c.id, c]));
  const countryById = new Map((countries.data ?? []).map((c) => [c.id, c]));
  const countryIdsByPlatform = new Map<string, string[]>();
  for (const pc of platformCountries.data ?? []) {
    const list = countryIdsByPlatform.get(pc.platform_id) ?? [];
    list.push(pc.country_id);
    countryIdsByPlatform.set(pc.platform_id, list);
  }

  const enrichedPendingPlatforms = (pendingPlatforms.data ?? []).map((p) => {
    const category = p.media_category_id ? categoryById.get(p.media_category_id) ?? null : null;
    const countryIds = countryIdsByPlatform.get(p.id) ?? [];
    return {
      ...p,
      category,
      countries: countryIds.map((id) => countryById.get(id)).filter((c): c is NonNullable<typeof c> => !!c),
      isAdPlatform: isAdPlatformCategory(category?.internal_key ?? null),
    };
  });

  return {
    hasError,
    rateCards: (pendingRateCards.data ?? []).map((rc) => ({
      ...rc,
      platform: platformById.get(rc.platform_id) ?? null,
      format: formatById.get(rc.media_format_id) ?? null,
    })),
    snapshots: (pendingSnapshots.data ?? []).map((s) => ({
      ...s,
      platform: platformById.get(s.platform_id) ?? null,
      metricDefinition: metricDefById.get(s.metric_definition_id) ?? null,
    })),
    platforms: enrichedPendingPlatforms,
  };
}

export type GovernanceQueue = Awaited<ReturnType<typeof getGovernanceQueue>>;
