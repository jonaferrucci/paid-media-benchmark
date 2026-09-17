import type { MediaCatalog } from "./catalog";

type Platform = MediaCatalog["platforms"][number];

// Item 45: "catalog filtering" / "catalog search" pure helpers.

// Item 39/60: reduces a time-ordered (desc by observed_at) list of
// snapshots to the LATEST observation per metric — never averages or
// overwrites history in storage (history stays in the DB), this only
// picks what a profile glance should show. Pure/testable in isolation
// from any Supabase call.
export function latestSnapshotPerMetric<T extends { metric_definition_id: string }>(
  snapshotsDescByDate: T[]
): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of snapshotsDescByDate) {
    if (!latest.has(row.metric_definition_id)) latest.set(row.metric_definition_id, row);
  }
  return latest;
}

// Item 20/21: a rate card is "current" only if status === "active" —
// superseded/pending rows must never be shown as today's price. Pure
// filter so this rule is independently testable and reused wherever
// "current price" needs to be resolved.
export function currentRateCards<T extends { status: string }>(rateCards: T[]): T[] {
  return rateCards.filter((rc) => rc.status === "active");
}

// Phase 19B item 2: widened to a minimal structural generic (rather
// than the specific MediaCatalog["platforms"] shape) so the SAME
// filtering logic is reusable from the contribution wizard's taxonomy
// query (lib/contribute/taxonomies.ts), which selects a slightly
// different column subset than getMediaCatalog — never a second,
// parallel copy of this filtering rule.
export function platformsForCategory<T extends { media_category_id: string | null }>(
  platforms: T[],
  categoryId: string | null
): T[] {
  if (!categoryId) return platforms;
  return platforms.filter((p) => p.media_category_id === categoryId);
}

export function platformsForCountry<T extends { id: string; is_global: boolean }>(
  platforms: T[],
  platformCountries: MediaCatalog["platformCountries"],
  countryId: string | null
): T[] {
  if (!countryId) return platforms;
  const availableIds = new Set(platformCountries.filter((pc) => pc.country_id === countryId).map((pc) => pc.platform_id));
  // A global platform is available everywhere even without an
  // explicit platform_countries row (see migration 0012 comment on
  // platforms.is_global) — never silently excluded from a country
  // filter just because no join row exists.
  return platforms.filter((p) => p.is_global || availableIds.has(p.id));
}

export function formatsForCategory<T extends { media_category_id: string }>(formats: T[], categoryId: string): T[] {
  return formats.filter((f) => f.media_category_id === categoryId);
}

// Phase 19B item 2: `metrics` widened to a minimal structural generic
// (id + internal_key, same requirement as before) so the contribution
// wizard's taxonomy shape (which carries extra metric_kind/unit_type
// fields getMediaCatalog doesn't select) flows through with its full
// type intact — same filtering rule, reused rather than duplicated.
export function metricsForCategory<T extends { id: string; internal_key: string }>(
  categoryMetrics: MediaCatalog["categoryMetrics"],
  metrics: T[],
  categoryId: string
): { metric: T; required: boolean }[] {
  const applicable = categoryMetrics.filter((cm) => cm.media_category_id === categoryId);
  return applicable
    .map((cm) => {
      const metric = metrics.find((m) => m.id === cm.metric_id);
      return metric ? { metric, required: cm.required } : null;
    })
    .filter((x): x is { metric: T; required: boolean } => x !== null);
}

// Phase 20D item 6: the next catalog-expansion phase is scoped to
// DIGITAL media only. Non-digital categories (television, radio, ooh,
// dooh, print) stay in media_categories/platforms for later — this is
// a presentational/query filter, never a schema change, and nothing
// here stops a category from being surfaced again by removing its key.
// A platform with no category at all is treated as digital-eligible
// (never silently excluded just because media_category_id is null).
const NON_DIGITAL_CATEGORY_KEYS = new Set(["television", "radio", "ooh", "dooh", "print"]);

export function isDigitalMediaCategory<T extends { internal_key: string }>(category: T): boolean {
  return !NON_DIGITAL_CATEGORY_KEYS.has(category.internal_key);
}

export function digitalMediaCategories<T extends { internal_key: string }>(categories: T[]): T[] {
  return categories.filter(isDigitalMediaCategory);
}

export function digitalMediaPlatforms<
  C extends { id: string; internal_key: string },
  P extends { media_category_id: string | null }
>(platforms: P[], categories: C[]): P[] {
  const nonDigitalIds = new Set(categories.filter((c) => !isDigitalMediaCategory(c)).map((c) => c.id));
  return platforms.filter((p) => p.media_category_id === null || !nonDigitalIds.has(p.media_category_id));
}

// Phase 20D item 5: PLATAFORMAS (Meta Ads, Google Ads, TikTok Ads,
// Mercado Libre Ads, Pinterest, Programmatic) and MEDIOS (streaming
// outlets, digital publishers, etc.) are different concepts and should
// never render as one undifferentiated grid — this is the single place
// that draws the line, by category, so catalog/planner views split
// consistently rather than each guessing independently.
const AD_PLATFORM_CATEGORY_KEYS = new Set(["paid_social", "search", "marketplace_ads", "programmatic"]);

export function isAdPlatformCategory(categoryInternalKey: string | null): boolean {
  return categoryInternalKey !== null && AD_PLATFORM_CATEGORY_KEYS.has(categoryInternalKey);
}

export function splitPlatformsAndMedia<
  C extends { id: string; internal_key: string },
  P extends { media_category_id: string | null }
>(platforms: P[], categories: C[]): { adPlatforms: P[]; media: P[] } {
  const categoryKeyById = new Map(categories.map((c) => [c.id, c.internal_key]));
  const adPlatforms: P[] = [];
  const media: P[] = [];
  for (const p of platforms) {
    const key = p.media_category_id ? categoryKeyById.get(p.media_category_id) ?? null : null;
    (isAdPlatformCategory(key) ? adPlatforms : media).push(p);
  }
  return { adPlatforms, media };
}

// Case/accent-insensitive substring search across display name and
// (loosely) category — no external search service needed (item 23).
export function searchCatalog(platforms: Platform[], query: string): Platform[] {
  const normalized = query.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized === "") return platforms;
  return platforms.filter((p) =>
    p.display_label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(normalized)
  );
}

// Item 24/25: an arbitrary user-typed outlet name is NEVER treated as
// a match against the canonical catalog — this is the explicit
// "escape hatch" boundary. Returns true only if the exact same
// normalized string is already a real catalog entry.
export function isKnownCatalogOutlet(platforms: Platform[], userInput: string): boolean {
  const normalized = userInput.trim().toLowerCase();
  return platforms.some((p) => p.display_label.toLowerCase() === normalized || p.internal_key === normalized);
}
