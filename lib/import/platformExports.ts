import { normalizeHeader, extractCurrencySuffix } from "./mapping";
import type { CanonicalField, DetectedMapping, RawTable } from "./types";

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
  // POST-MVP IMPORT FIX 3 (§L): only ever set when a platform's own
  // export notation is UNAMBIGUOUSLY known upfront (a real Google Ads
  // export is always English-style comma-thousands/dot-decimal) —
  // never inferred from the numbers themselves. Omitted (undefined)
  // keeps the existing LATAM-primary ambiguity handling exactly as
  // before, for every platform that doesn't set it.
  numberFormat?: "us";
  // ADAPTIVE PROFILE ARCHITECTURE (§19/§20): an i18n key for this
  // platform's own concise export-path guidance (e.g. "Ads Manager →
  // Campaigns → ... → CSV"). Only set for platforms whose real export
  // path has been confirmed against an actual fixture in this project
  // (Meta, Google) — never invented for a platform Cucurucho has no
  // real sample of. Omitted (undefined) falls back to one generic
  // "upload it as-is" line naming the platform, so every platform still
  // gets SOME guidance without fabricating menu paths Cucurucho hasn't
  // verified (see the generic fallback + "genuine unresolved issues").
  downloadGuidanceKey?: string;
}

export const AD_PLATFORM_PROFILES: AdPlatformProfile[] = [
  { id: "meta_ads", displayLabel: "Meta Ads", downloadGuidanceKey: "contribute.import.downloadGuidanceMeta" },
  { id: "google_ads", displayLabel: "Google Ads", numberFormat: "us", downloadGuidanceKey: "contribute.import.downloadGuidanceGoogle" },
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
    // Confirmed against a real Google Ads export (POST-MVP IMPORT FIX
    // 3, §F): each of these is essentially unique Google Ads Editor/UI
    // terminology, so a single one is already strong evidence — a
    // report exported with only English-locale headers would have hit
    // "campaign type"/"avg cpc"/etc. instead, still recognized below.
    strong: [
      "campaign type", "avg cpc", "cost / conv", "search impr share",
      "codigo de moneda", "tipo de campana", "nivel de optimizacion",
      "tipo de estrategia de oferta", "valor de conv /costo",
      "vistas de trueview", "prom cpc", "costo/conv",
    ],
    supporting: ["impr", "conv value", "cpm prom", "usuarios unicos"],
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

// PHASE 24 (§17): the single source of truth for "verified with a real
// export" — reuses downloadGuidanceKey's own existing meaning (see its
// comment above: only ever set once a platform's real export path has
// been confirmed against an actual fixture in this project) rather than
// inventing a second, separately-maintained "verified" flag that could
// silently drift out of sync with it. Today this is Meta and Google
// only; TikTok/Pinterest/Mercado Libre Ads stay honestly unverified
// until a real fixture for each is added and checked in.
export function isVerifiedWithRealExport(profile: AdPlatformProfile): boolean {
  return !!profile.downloadGuidanceKey;
}

// ===========================================================================
// ADAPTIVE PLATFORM IMPORT ARCHITECTURE
//
// §2: platform and EXPORT PROFILE (variant) are two separate decisions.
// detectExportPlatform above answers "which platform" — this section
// answers "which recognizable FAMILY of that platform's exports" (a
// campaign-level report vs. a Search-only subset vs. a Performance Max
// report vs. a video report, etc., per §1). A profile never changes
// WHICH columns get recognized (that's still the single ALIASES/
// IGNORED_HEADERS dictionary in mapping.ts, shared across every
// platform/profile per §4's "global aliases" design) — it only labels
// what kind of report this evidently is, purely for the UI banner
// (§22: "Detectamos Meta Ads / Reporte de campañas") and, where a
// profile is confirmed against real fixture evidence, a number-format
// hint. Detection is 100% deterministic evidence-matching — no LLM,
// no invented signal, never a guess when evidence is absent (falls
// back to the generic "campaign_report" profile instead).
// ===========================================================================

// One id per platform, prefixed so ids never collide across platforms.
// Only ids with REAL fixture evidence in this project are ever returned
// by classifyExportProfile below (see its own comments) — the others
// exist as a documented, honest placeholder for a future real sample.
export type ExportProfileId =
  | "meta_campaign_report"
  | "meta_unknown_export"
  | "google_campaign_report"
  | "google_search_campaign_report"
  | "google_performance_max_report"
  | "google_video_campaign_report"
  | "generic_campaign_report";

export interface ExportProfileResult {
  profileId: ExportProfileId;
  // i18n key for the profile's own short display label (e.g. "Reporte
  // de campañas") — resolved by the caller's translation function, this
  // module never renders text itself.
  labelKey: string;
}

const GENERIC_PROFILE: ExportProfileResult = { profileId: "generic_campaign_report", labelKey: "contribute.import.profile.campaignReport" };

// Header evidence for Google's video-report variant (§11) — the exact
// real quartile/TrueView headers from the real Google fixture
// (POST-MVP IMPORT FIX 3, §I), already normalizeHeader-shaped.
const GOOGLE_VIDEO_EVIDENCE = ["vistas de trueview", "video reproducido al 25 %", "video reproducido al 50 %", "video reproducido al 75 %", "video reproducido al 100 %"];

// §11: Google's own "Tipo de campaña" VALUES (not headers — this is
// per-row evidence a header-only signature scan can't see) distinguish
// a Search-only export from a Performance Max export when every row
// agrees. Confirmed against the real Google fixture's own real values
// ("Búsqueda", "Máximo rendimiento") — never invented labels.
function classifyGoogleProfile(table: RawTable, mappings: DetectedMapping[]): ExportProfileResult {
  const normalizedHeaders = new Set(table.headers.map((h) => normalizeHeader(h)));
  if (GOOGLE_VIDEO_EVIDENCE.some((h) => normalizedHeaders.has(h))) {
    return { profileId: "google_video_campaign_report", labelKey: "contribute.import.profile.googleVideo" };
  }

  const campaignTypeMapping = mappings.find((m) => m.state === "mapped" && m.canonicalField === "campaign_type");
  if (campaignTypeMapping) {
    const values = table.rows
      .map((r) => normalizeHeader((r[campaignTypeMapping.sourceColumnIndex] ?? "").trim()))
      .filter((v) => v !== "");
    if (values.length > 0) {
      if (values.every((v) => v === "busqueda" || v === "search")) {
        return { profileId: "google_search_campaign_report", labelKey: "contribute.import.profile.googleSearch" };
      }
      if (values.every((v) => v === "maximo rendimiento" || v === "performance max")) {
        return { profileId: "google_performance_max_report", labelKey: "contribute.import.profile.googlePmax" };
      }
    }
  }
  // Mixed campaign types, no campaign-type column at all, or a shape
  // that doesn't uniformly match one known variant: the safe, honest
  // default — never guessed into a more specific label than the
  // evidence actually supports.
  return { profileId: "google_campaign_report", labelKey: "contribute.import.profile.campaignReport" };
}

// §1: deterministic, evidence-based, never LLM. Only called once a
// platform is already CONFIDENTLY detected (never for "ambiguous"/
// "unknown" — there is no profile to classify without a platform).
// Meta and the platforms with no real export sample in this project
// (TikTok/Pinterest/Mercado Libre Ads) always resolve to one honest
// generic profile — see the "genuine unresolved issues" note this
// pass's final response calls out for why finer Meta/other-platform
// variants (ad-level, adset-level reports) aren't fingerprinted yet:
// building a real fingerprint from an invented header list, rather
// than a real export sample, would be exactly the kind of unsafe guess
// this architecture is built to avoid.
export function classifyExportProfile(platformId: AdPlatformId, table: RawTable, mappings: DetectedMapping[]): ExportProfileResult {
  if (platformId === "google_ads") return classifyGoogleProfile(table, mappings);
  if (platformId === "meta_ads") return { profileId: "meta_campaign_report", labelKey: "contribute.import.profile.campaignReport" };
  return GENERIC_PROFILE;
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
  // POST-MVP IMPORT FIX 3 (§M): which strategy produced this result —
  // exposed for tests and so the review UI can explain itself (e.g.
  // "ARS detectado" from a real currency column vs. a header-suffix
  // inference) — never used to change validation behavior.
  source: "column" | "header_suffix" | "none";
}

// Post-MVP row-level fix (§4/§11), renamed in POST-MVP IMPORT FIX 3
// (§M) now that a second, stronger strategy exists below: real
// ad-platform exports often express the report's currency only as a
// suffix on monetary column headers (e.g. "Importe gastado (USD)")
// rather than a dedicated currency column or value. Deterministic and
// evidence-based — collects the distinct currency codes found across
// every header. A single consistent code across the file is
// auto-detected; more than one is flagged "ambiguous" (never silently
// picked); none found falls back to "none", which callers treat
// exactly like the existing safe default (no FX conversion is ever
// performed here or anywhere else). Behavior is completely unchanged
// from before this task — Meta continues using this strategy exactly
// as it always has.
export function detectCurrencyFromHeaderSuffixes(headers: string[]): CurrencyDetectionResult {
  const codes = new Set<string>();
  for (const header of headers) {
    const code = extractCurrencySuffix(header);
    if (code) codes.add(code);
  }
  if (codes.size === 0) return { state: "none", currency: null, source: "none" };
  if (codes.size > 1) return { state: "ambiguous", currency: null, source: "header_suffix" };
  return { state: "detected", currency: [...codes][0], source: "header_suffix" };
}

// POST-MVP IMPORT FIX 3 (§M): a real Google Ads export states its
// currency directly, per row, in its own "Código de moneda" column —
// stronger, more direct evidence than inferring one from a header
// suffix. Reads whichever column the standard mapping pipeline already
// resolved to the "currency" canonical field (ALIASES.currency), so
// this needs no Google-specific knowledge at all: any platform with a
// real currency COLUMN benefits identically. A single consistent code
// across every row auto-applies; conflicting values are flagged
// "ambiguous", never silently picked.
export function detectCurrencyFromColumn(table: RawTable, mappings: DetectedMapping[]): CurrencyDetectionResult {
  const currencyMapping = mappings.find((m) => m.state === "mapped" && m.canonicalField === "currency");
  if (!currencyMapping) return { state: "none", currency: null, source: "none" };

  const codes = new Set<string>();
  for (const row of table.rows) {
    const raw = (row[currencyMapping.sourceColumnIndex] ?? "").trim().toUpperCase();
    if (raw) codes.add(raw);
  }
  if (codes.size === 0) return { state: "none", currency: null, source: "none" };
  if (codes.size > 1) return { state: "ambiguous", currency: null, source: "column" };
  return { state: "detected", currency: [...codes][0], source: "column" };
}

// POST-MVP IMPORT FIX 3 (§M): the common currency-detection interface
// supporting both strategies. Tries the stronger column-based strategy
// first (a real currency column, when mapped, is more direct evidence
// than a header-suffix inference); falls back to the header-suffix
// strategy only when no currency column was found/mapped at all. A
// Meta-style export (no currency column) is completely unaffected — it
// falls straight through to the exact same header-suffix detection
// used before this task.
export function detectReportCurrency(table: RawTable, mappings: DetectedMapping[]): CurrencyDetectionResult {
  const columnResult = detectCurrencyFromColumn(table, mappings);
  if (columnResult.state !== "none") return columnResult;
  return detectCurrencyFromHeaderSuffixes(table.headers);
}
