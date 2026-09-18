import { normalizeHeader } from "./mapping";
import type { CanonicalField, RawTable } from "./types";

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
      // Confirmed against a real Meta Ads export (post-MVP fix) — each
      // is essentially unique Meta/Instagram terminology.
      "indicador de resultado",
      "coste por 1000 cuentas de meta alcanzadas",
      "seguidores de instagram",
    ],
    supporting: [
      "link clicks",
      "reach",
      // "campana" (accent-stripped "campaña") here is Meta's own
      // "Entrega de la campaña" (delivery status) column, not a
      // standalone "campaign" word — kept SUPPORTING (not strong)
      // since "campaign delivery" as a concept isn't unique to Meta.
      "entrega de la campana",
    ],
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

// §5/post-MVP real-Meta-export fix: Meta's own "Resultados" column is
// objective-dependent — its meaning is only knowable by reading the
// paired "Indicador de resultado" column's actual VALUE, never by the
// header name alone (unlike every other field, this is a per-file,
// value-based decision, not a static header alias). This resolves
// that pairing ONCE per file — a Meta report is one objective for its
// whole date range, so the indicator is expected to be constant across
// rows — into, at most, a single dynamic "Resultados" -> canonical
// field mapping, and ONLY for indicator values whose meaning is
// unambiguous and already supported by Cucurucho's own conversions
// concept. An unrecognized, missing, or inconsistent indicator leaves
// "Resultados" unmapped (needs_review) rather than guessed — this
// deliberately does NOT attempt to generalize to every possible Meta
// objective (video views, engagement, reach, awareness); it only ever
// resolves the common "this is a conversion count" case the task's
// own examples describe.
const SAFE_RESULT_INDICATORS: Record<string, CanonicalField> = {
  leads: "conversions",
  lead: "conversions",
  "clientes potenciales": "conversions",
  purchases: "conversions",
  purchase: "conversions",
  compras: "conversions",
  conversions: "conversions",
  conversiones: "conversions",
  sales: "conversions",
  ventas: "conversions",
};

export type MetaResultsReason = "mapped" | "unknown_indicator" | "inconsistent_indicator" | "no_indicator_column" | "no_results_column";

export interface MetaResultsResolution {
  canonicalField: CanonicalField | null;
  reason: MetaResultsReason;
  // The (normalized) indicator value found, when there was one — used
  // by the UI to explain an unresolved "Resultados" mapping (e.g.
  // "Indicador de resultado: {indicatorSample}").
  indicatorSample: string | null;
}

export function resolveMetaResultsMapping(table: RawTable): MetaResultsResolution {
  const resultsIdx = table.headers.findIndex((h) => normalizeHeader(h) === "resultados");
  if (resultsIdx === -1) return { canonicalField: null, reason: "no_results_column", indicatorSample: null };

  // Deliberately the PRIMARY "Indicador de resultado" only — never its
  // "(inicial)" companion, which lib/import/mapping.ts's IGNORED_HEADERS
  // already keeps out of any interpretation to avoid double-counting
  // the same conversion concept from two paired columns.
  const indicatorIdx = table.headers.findIndex((h) => normalizeHeader(h) === "indicador de resultado");
  if (indicatorIdx === -1) return { canonicalField: null, reason: "no_indicator_column", indicatorSample: null };

  const values = new Set(
    table.rows
      .map((row) => normalizeHeader(row[indicatorIdx] ?? ""))
      .filter((v) => v !== "")
  );
  if (values.size === 0) return { canonicalField: null, reason: "no_indicator_column", indicatorSample: null };
  if (values.size > 1) {
    // A single report mixing more than one result type can't be
    // safely collapsed into one field — flag for review rather than
    // arbitrarily picking one.
    return { canonicalField: null, reason: "inconsistent_indicator", indicatorSample: [...values][0] };
  }

  const indicator = [...values][0];
  const field = SAFE_RESULT_INDICATORS[indicator];
  if (!field) return { canonicalField: null, reason: "unknown_indicator", indicatorSample: indicator };
  return { canonicalField: field, reason: "mapped", indicatorSample: indicator };
}
