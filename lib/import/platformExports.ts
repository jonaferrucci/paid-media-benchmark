import { normalizeHeader, extractCurrencySuffix } from "./mapping";
import type { CanonicalField } from "./types";

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

// Post-MVP row-level fix (§2): Meta's own "Resultados" column is
// objective-dependent — its meaning is only knowable by reading the
// paired "Indicador de resultado" column's actual VALUE, never by the
// header name alone. UNLIKE the file-level resolver this replaces, the
// real canonical fixture for this task proves a single Meta report can
// mix result types PER ROW (one campaign optimizing for profile visits,
// another for landing-page views, another just reporting reach) — so
// this resolves the pairing for ONE row at a time, never assuming a
// uniform meaning across the whole file.
//
// Only indicator values whose meaning is unambiguous AND already backed
// by a real canonical field Cucurucho has are mapped; everything else is
// left as contextual/unmapped rather than guessed. This deliberately
// does not attempt to cover every possible Meta objective.
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
  // Meta's internal action-name form is "actions:<type>", sometimes with
  // a cross-channel "omni_" qualifier (normalizeResultIndicator strips
  // both generically below) — "landing_page_view"/"link_click" resolve
  // to real canonical fields Cucurucho already has, unlike e.g.
  // "total_profile_visits" (no matching field, so left unmapped).
  "landing page view": "landing_page_views",
  "landing page views": "landing_page_views",
  "link click": "link_clicks",
  "link clicks": "link_clicks",
};

// A result whose indicator just re-labels a raw metric Cucurucho already
// captures from its OWN dedicated column (Alcance/Reach, Impresiones/
// Impressions) — mapping it again as a "result" would double-count the
// same figure under a different field, so these are always left
// contextual regardless of SAFE_RESULT_INDICATORS.
const DUPLICATE_METRIC_INDICATORS = new Set(["reach", "alcance", "impressions", "impresiones"]);

// Normalizes a Meta "Indicador de resultado" raw value for lookup:
// reuses normalizeHeader's own lowercase/accent-strip/punctuation
// collapsing (a colon isn't one of normalizeHeader's own stripped
// punctuation characters, so it's turned into a space first), then
// strips Meta's "actions:"/"action_" wrapper and "omni_" qualifier —
// generically, not by hardcoding every possible action name — so e.g.
// "actions:omni_landing_page_view" normalizes the same as a bare
// "landing_page_view".
function normalizeResultIndicator(raw: string): string {
  const normalized = normalizeHeader(raw.replace(/:/g, " "));
  return normalized.replace(/^actions? /, "").replace(/^omni /, "");
}

export type RowResultReason = "mapped" | "duplicates_existing_metric" | "unknown_indicator" | "no_indicator" | "no_result_value";

export interface RowResultResolution {
  canonicalField: CanonicalField | null;
  reason: RowResultReason;
  // The normalized indicator value found, when there was one — used by
  // the review UI to explain a contextual (non-imported) result (e.g.
  // "Indicador: total_profile_visits").
  indicatorSample: string | null;
  // The raw "Resultados" value itself, when present — shown alongside
  // indicatorSample so the review UI can display "type: value" even
  // when the result isn't imported.
  resultValue: string | null;
}

export function resolveMetaResultForRow(resultsRaw: string | undefined, indicatorRaw: string | undefined): RowResultResolution {
  const resultValue = (resultsRaw ?? "").trim() || null;
  if (!resultValue) return { canonicalField: null, reason: "no_result_value", indicatorSample: null, resultValue: null };

  const indicatorTrimmed = (indicatorRaw ?? "").trim();
  if (!indicatorTrimmed) return { canonicalField: null, reason: "no_indicator", indicatorSample: null, resultValue };

  const indicator = normalizeResultIndicator(indicatorTrimmed);
  if (DUPLICATE_METRIC_INDICATORS.has(indicator)) {
    return { canonicalField: null, reason: "duplicates_existing_metric", indicatorSample: indicator, resultValue };
  }

  const field = SAFE_RESULT_INDICATORS[indicator];
  if (!field) return { canonicalField: null, reason: "unknown_indicator", indicatorSample: indicator, resultValue };
  return { canonicalField: field, reason: "mapped", indicatorSample: indicator, resultValue };
}

export type CurrencyDetectionState = "detected" | "ambiguous" | "none";

export interface CurrencyDetectionResult {
  state: CurrencyDetectionState;
  currency: string | null;
}

// Post-MVP row-level fix (§4/§11): real ad-platform exports often
// express the report's currency only as a suffix on monetary column
// headers (e.g. "Importe gastado (USD)") rather than a dedicated
// currency column or value. Deterministic and evidence-based — collects
// the distinct currency codes found across every header. A single
// consistent code across the file is auto-detected; more than one is
// flagged "ambiguous" (never silently picked); none found falls back to
// "none", which callers treat exactly like the existing safe default
// (no FX conversion is ever performed here or anywhere else).
export function detectReportCurrency(headers: string[]): CurrencyDetectionResult {
  const codes = new Set<string>();
  for (const header of headers) {
    const code = extractCurrencySuffix(header);
    if (code) codes.add(code);
  }
  if (codes.size === 0) return { state: "none", currency: null };
  if (codes.size > 1) return { state: "ambiguous", currency: null };
  return { state: "detected", currency: [...codes][0] };
}
