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
