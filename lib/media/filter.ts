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

export function platformsForCategory(platforms: Platform[], categoryId: string | null): Platform[] {
  if (!categoryId) return platforms;
  return platforms.filter((p) => p.media_category_id === categoryId);
}

export function platformsForCountry(
  platforms: Platform[],
  platformCountries: MediaCatalog["platformCountries"],
  countryId: string | null
): Platform[] {
  if (!countryId) return platforms;
  const availableIds = new Set(platformCountries.filter((pc) => pc.country_id === countryId).map((pc) => pc.platform_id));
  // A global platform is available everywhere even without an
  // explicit platform_countries row (see migration 0012 comment on
  // platforms.is_global) — never silently excluded from a country
  // filter just because no join row exists.
  return platforms.filter((p) => p.is_global || availableIds.has(p.id));
}

export function formatsForCategory(formats: MediaCatalog["formats"], categoryId: string): MediaCatalog["formats"] {
  return formats.filter((f) => f.media_category_id === categoryId);
}

export function metricsForCategory(
  categoryMetrics: MediaCatalog["categoryMetrics"],
  metrics: MediaCatalog["metrics"],
  categoryId: string
): { metric: MediaCatalog["metrics"][number]; required: boolean }[] {
  const applicable = categoryMetrics.filter((cm) => cm.media_category_id === categoryId);
  return applicable
    .map((cm) => {
      const metric = metrics.find((m) => m.id === cm.metric_id);
      return metric ? { metric, required: cm.required } : null;
    })
    .filter((x): x is { metric: MediaCatalog["metrics"][number]; required: boolean } => x !== null);
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
