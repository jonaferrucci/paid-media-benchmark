import { normalizeHeader } from "./mapping";

// Post-MVP usability improvement: real ad-platform export detection.
// Pure, deterministic, no external/AI dependency — exactly the same
// kind of static lookup lib/import/mapping.ts's ALIASES already is,
// just scored evidence instead of a single string match. This module
// only ever DETECTS which known export shape a file looks like; it
// never invents a canonical field or bypasses validation — the actual
// mapping still goes through the existing detectMapping/normalizeAndValidateRow
// pipeline unchanged.

export type AdPlatformId = "meta_ads" | "google_ads" | "tiktok_ads" | "pinterest_ads" | "mercado_libre_ads";

export interface AdPlatformProfile {
  id: AdPlatformId;
  // The EXACT real platforms.display_label this resolves to (see
  // supabase/seed.sql) — matched via the existing matchTaxonomyValue(),
  // never a new/invented taxonomy value.
  displayLabel: string;
}

export const AD_PLATFORM_PROFILES: AdPlatformProfile[] = [
  { id: "meta_ads", displayLabel: "Meta Ads" },
  { id: "google_ads", displayLabel: "Google Ads" },
  { id: "tiktok_ads", displayLabel: "TikTok Ads" },
  { id: "pinterest_ads", displayLabel: "Pinterest Ads" },
  { id: "mercado_libre_ads", displayLabel: "Mercado Libre Ads" },
];

// Evidence signatures, already written in normalizeHeader's own output
// shape (lowercase, accents stripped, "_-." -> space, collapsed) so
// comparison is a plain string equality, never a second regex pass.
// STRONG signatures are columns essentially unique to that platform's
// native export; SUPPORTING signatures are real but weaker/shared
// evidence that only counts alongside something else. Generic metrics
// every platform reports (Impressions, Clicks, CTR, Conversions, …) are
// deliberately absent from both lists — they carry no real evidence.
const STRONG_WEIGHT = 2;
const SUPPORTING_WEIGHT = 1;

const SIGNATURES: Record<AdPlatformId, { strong: string[]; supporting: string[] }> = {
  meta_ads: {
    strong: [
      "ad set name",
      "amount spent",
      "importe gastado",
      "ctr (link click through rate)",
      "website purchases conversion value",
      "purchase conversion value",
    ],
    supporting: ["link clicks", "reach"],
  },
  google_ads: {
    strong: ["campaign type", "avg cpc", "cost / conv", "search impr share"],
    supporting: ["impr", "conv value"],
  },
  tiktok_ads: {
    // "6-Second Video Views" is distinctive enough on its own (a fixed
    // TikTok completion definition no other platform in this list
    // reports) to reach the detection threshold by itself.
    strong: ["6 second video views"],
    supporting: ["ad group name", "video views"],
  },
  pinterest_ads: {
    strong: ["pin clicks", "outbound clicks"],
    supporting: ["spend"],
  },
  mercado_libre_ads: {
    strong: ["acos", "facturación", "facturacion"],
    supporting: ["inversión", "inversion", "ventas", "campaña", "campana"],
  },
};

export type PlatformDetectionState = "detected" | "ambiguous" | "unknown";

export interface PlatformDetectionResult {
  state: PlatformDetectionState;
  platformId: AdPlatformId | null;
  // Exposed for tests and for an "ambiguous" UI hint (e.g. listing the
  // candidates) — never used to silently pick a winner.
  scoresById: Record<AdPlatformId, number>;
}

// §D: deterministic evidence scoring only. Never chooses a platform on
// weak evidence — a single supporting-only match, or a tie between two
// platforms' top scores, both resolve to "ambiguous", not a guess.
export function detectExportPlatform(headers: string[]): PlatformDetectionResult {
  const normalizedHeaders = new Set(headers.map((h) => normalizeHeader(h)));

  const scoresById = {} as Record<AdPlatformId, number>;
  for (const profile of AD_PLATFORM_PROFILES) {
    const sig = SIGNATURES[profile.id];
    let score = 0;
    for (const s of sig.strong) if (normalizedHeaders.has(s)) score += STRONG_WEIGHT;
    for (const s of sig.supporting) if (normalizedHeaders.has(s)) score += SUPPORTING_WEIGHT;
    scoresById[profile.id] = score;
  }

  const maxScore = Math.max(...Object.values(scoresById));
  if (maxScore === 0) return { state: "unknown", platformId: null, scoresById };

  const topIds = (Object.keys(scoresById) as AdPlatformId[]).filter((id) => scoresById[id] === maxScore);
  if (maxScore >= 2 && topIds.length === 1) {
    return { state: "detected", platformId: topIds[0], scoresById };
  }
  // Either the strongest signal alone is too weak (a single supporting
  // match, score 1) or two+ platforms are tied — both are genuine
  // uncertainty, never resolved by a coin flip.
  return { state: "ambiguous", platformId: null, scoresById };
}

export function findAdPlatformProfile(id: AdPlatformId): AdPlatformProfile {
  // AD_PLATFORM_PROFILES is a fixed, exhaustive literal covering every
  // AdPlatformId — this lookup cannot fail for a valid id.
  return AD_PLATFORM_PROFILES.find((p) => p.id === id)!;
}
