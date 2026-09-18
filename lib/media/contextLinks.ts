// Phase 22 — pure, DB-free helpers for cross-product navigation
// context (§D "Media -> Planner", §E "Benchmark -> Planner", §R/§S
// "Contribution from context / prefill"). Every function here only
// ever builds or reads a query string out of identifiers the app
// already has elsewhere (platforms.internal_key, a category/country
// id) — never a new database requirement (§R: "Only use safe,
// existing identifiers"), and never trusted blindly: resolveMediaContext
// is the one place a query param coming back IN is used, and it only
// resolves against the caller's own already-fetched, real catalog
// list — an unknown/stale slug resolves to null rather than being
// guessed or partially trusted (§S: "Do not prefill unknown values.
// Do not bypass validation.").

export interface MediaLinkContext {
  mediaSlug?: string | null;
  categoryId?: string | null;
  countryId?: string | null;
}

export function plannerHrefForMedia(context: MediaLinkContext): string {
  const qs = new URLSearchParams();
  if (context.mediaSlug) qs.set("media", context.mediaSlug);
  if (context.categoryId) qs.set("category", context.categoryId);
  if (context.countryId) qs.set("country", context.countryId);
  const query = qs.toString();
  return query ? `/planner?${query}` : "/planner";
}

export function contributeRateCardHref(mediaSlug?: string | null): string {
  return mediaSlug ? `/contribute/rate-cards?media=${encodeURIComponent(mediaSlug)}` : "/contribute/rate-cards";
}

export function contributePublicDataHref(mediaSlug?: string | null): string {
  return mediaSlug ? `/contribute/public-metrics?media=${encodeURIComponent(mediaSlug)}` : "/contribute/public-metrics";
}

// Resolves a "media" query-param value against a REAL, already-loaded
// list before it is ever shown or used for anything. Returns null for
// anything that isn't an exact match — never a fuzzy/partial guess —
// so a stale or hand-edited URL never surfaces false context.
export function resolveMediaContext<T extends { internal_key: string }>(
  mediaSlugParam: string | null | undefined,
  knownPlatforms: T[]
): T | null {
  if (!mediaSlugParam) return null;
  return knownPlatforms.find((p) => p.internal_key === mediaSlugParam) ?? null;
}

// Same validated-resolution shape as resolveMediaContext, for the
// planner's optional ?category=/?country= params — only ever an id
// that already exists in the caller's own loaded taxonomy list.
export function resolveIdContext<T extends { id: string }>(idParam: string | null | undefined, known: T[]): T | null {
  if (!idParam) return null;
  return known.find((item) => item.id === idParam) ?? null;
}
