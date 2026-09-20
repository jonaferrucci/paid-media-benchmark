// PHASE 25 — §5: campaign type resolution.
//
// Resolves a raw, review-only campaign-type string (NormalizedRow.
// campaignType — see lib/import/types.ts, never taxonomy-resolved
// there) against the REAL, already-seeded, platform-scoped
// campaign_types taxonomy (supabase/seed.sql) — never a freshly
// invented mapping.
//
// Deliberately narrow: only Google Ads' two real-fixture-confirmed
// "Tipo de campaña" values are resolved, reusing the exact same
// normalized-value comparison lib/import/platformExports.ts's
// classifyGoogleProfile already established for the SAME raw values
// (confirmed against the real Google fixture: "Búsqueda"/"Search" and
// "Máximo rendimiento"/"Performance Max"). Every other platform, and
// every other Google value (including "Video" — only header-level
// evidence exists for a video REPORT, never per-row campaign-type
// values, so resolving it here would be an unconfirmed guess) resolves
// to null: the raw value stays visible for display/context (§5: "If
// unresolved: preserve display/context if possible, but do not create
// taxonomy values automatically"), it just isn't matched to a
// campaign_types.id.
//
// Never maps arbitrary text across platforms — a platform with only a
// 'standard' campaign_types row (Meta, TikTok, Pinterest, DSP) never
// resolves anything here, by design; 'standard' is not a real-world
// distinction a source export reports, so there's nothing to resolve
// FROM.

import { normalizeHeader } from "@/lib/import/mapping";

// Mirrors the AdPlatformId union already used by lib/import/platformExports.ts
// and lib/import/types.ts's NormalizedRow.platform, but only the one key
// this resolver ever matches against is referenced directly.
const GOOGLE_ADS_PLATFORM_KEY = "google_ads";

// The exact internal_key values seeded for google_ads in supabase/seed.sql
// (migration 0002's taxonomies) — never invented here.
export type ResolvedGoogleCampaignTypeKey = "search" | "performance_max";

/**
 * Resolves a raw campaign-type string from a normalized import row to a
 * real, existing campaign_types.internal_key for the given platform —
 * or null when the platform/value combination isn't one of the
 * confirmed, real-fixture-backed cases.
 *
 * Pure and synchronous: the caller is responsible for looking up the
 * actual campaign_types.id for (platformId, internal_key) once, via a
 * normal taxonomy query — this function never touches the database.
 */
export function resolveCampaignType(
  platformKey: string,
  rawCampaignType: string | null | undefined
): ResolvedGoogleCampaignTypeKey | null {
  if (platformKey !== GOOGLE_ADS_PLATFORM_KEY) return null;
  if (!rawCampaignType) return null;

  const normalized = normalizeHeader(rawCampaignType);
  if (normalized === "busqueda" || normalized === "search") return "search";
  if (normalized === "maximo rendimiento" || normalized === "performance max") return "performance_max";
  return null;
}
