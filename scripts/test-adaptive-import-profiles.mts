// POST-MVP IMPORT ARCHITECTURE — ADAPTIVE PLATFORM EXPORT PROFILES (§23).
//
// Exercises the new export-profile classification layer
// (lib/import/platformExports.ts: classifyExportProfile) and per-field
// confidence layer (lib/import/mapping.ts: classifyFieldConfidence)
// against real-fixture-derived HEADER SUBSETS — never a fabricated
// header list — simulating the variants a real advertiser export can
// legitimately omit columns for (an awareness-only Meta campaign with
// no purchase results; a Search-only or Performance Max-only Google
// account export; a video campaign report). This is additive coverage
// alongside (never a replacement for) the existing full-fixture
// regression tests: test-real-meta-import.mts, test-row-level-meta-
// import.mts, and test-google-ads-import.mts.
//
// Per §23, this verifies: platform detection, profile detection,
// header/preamble detection generalized beyond Google, safe mapping of
// whatever subset of columns is present, missing-columns-allowed
// readiness (§12 — a row need not carry every metric), derived/
// contextual fields staying non-blocking, currency detection, row
// exclusions, import readiness counts, the generic fallback path when
// no platform is confidently detected, and — critically — that no
// unrecognized header is ever silently guessed into a canonical field.

import { parseCsv } from "../lib/import/parse";
import {
  detectMapping,
  applyMapping,
  ignoredReasonForHeader,
  excludeAggregateTotalRows,
  classifyFieldConfidence,
} from "../lib/import/mapping";
import { normalizeAndValidateRow, detectDuplicates } from "../lib/import/validate";
import {
  detectExportPlatform,
  findAdPlatformProfile,
  classifyExportProfile,
  detectReportCurrency,
  AD_PLATFORM_PROFILES,
} from "../lib/import/platformExports";
import type { RawTable, CanonicalField } from "../lib/import/types";

let passed = 0;
let failed = 0;
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`); }
}
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const taxonomies = {
  platforms: [{ internal_key: "meta_ads", display_label: "Meta Ads" }, { internal_key: "google_ads", display_label: "Google Ads" }],
  objectives: [{ internal_key: "traffic", display_label: "Traffic" }, { internal_key: "awareness", display_label: "Awareness" }, { internal_key: "reach", display_label: "Reach" }],
  verticals: [{ internal_key: "retail", display_label: "Retail" }],
  countries: [{ iso_code: "AR", display_label: "Argentina" }],
  businessModels: [], audienceStrategies: [], funnelStages: [],
};
const CONTEXT: Partial<Record<CanonicalField, string>> = { objective: "awareness", vertical: "retail", country: "AR" };

function csvField(value: string): string {
  return value.includes(",") || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
}
function csvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}

function tableFrom(headers: string[], rows: string[][]): RawTable {
  return { headers, rows };
}

function readyRows(table: RawTable, platformLabel: string, numberFormat: "auto" | "us" = "auto") {
  const mappings = detectMapping(table);
  const mapped = applyMapping(table, mappings);
  const rowsWithContext = mapped.map((row) => {
    const merged: typeof row = { ...row, platform: row.platform ?? platformLabel };
    merged.start_date = merged.start_date ?? "2026-08-01";
    merged.end_date = merged.end_date ?? "2026-08-31";
    for (const [field, value] of Object.entries(CONTEXT) as [CanonicalField, string][]) {
      if (!merged[field]) merged[field] = value;
    }
    return merged;
  });
  const normalized = detectDuplicates(rowsWithContext.map((row, i) => normalizeAndValidateRow(i + 2, row, taxonomies, { numberFormat })));
  return { mappings, normalized };
}

// ===========================================================================
// §1/§10: META — reduced "awareness" subset. A real awareness campaign
// export commonly omits "Resultados"/"Indicador de resultado" (no
// purchase/lead result to report) entirely — this must still be safely
// recognized as Meta Ads and still reach readiness off of
// spend+reach+impressions+dates+context alone (§12), never blocked for
// missing clicks/conversions/revenue.
// ===========================================================================
const META_AWARENESS_HEADERS = ["Nombre de la campaña", "Plataforma", "Entrega de la campaña", "Alcance", "Frecuencia", "Impresiones", "Importe gastado (USD)"];
const META_AWARENESS_ROWS = [
  ["Reconocimiento | Video", "Meta Ads", "Activa", "125000", "2.10", "262500", "845.30"],
  ["Reconocimiento | Imagen", "Meta Ads", "Activa", "98000", "1.85", "181300", "610.15"],
];
{
  const table = tableFrom(META_AWARENESS_HEADERS, META_AWARENESS_ROWS);
  const detection = detectExportPlatform(table.headers);
  assertEqual(detection.state, "detected", "Meta's reduced awareness subset (no Resultados columns) is still confidently detected");
  assertEqual(detection.platformId, "meta_ads", "the awareness subset resolves to meta_ads");
  const profile = classifyExportProfile("meta_ads", table, detectMapping(table));
  assertEqual(profile.profileId, "meta_campaign_report", "Meta always resolves to its one honest generic campaign-report profile (no fabricated ad-level/adset-level fingerprint)");

  const { mappings, normalized } = readyRows(table, "Meta Ads");
  const byHeader = (h: string) => mappings.find((m) => m.sourceHeader === h);
  assertEqual(byHeader("Nombre de la campaña")?.canonicalField, "campaign_name", "campaign identity still recognized without Resultados columns present");
  assertEqual(byHeader("Alcance")?.canonicalField, "reach", "reach still recognized");
  assertEqual(byHeader("Impresiones")?.canonicalField, "impressions", "impressions still recognized");
  assertEqual(byHeader("Importe gastado (USD)")?.canonicalField, "ad_spend", "spend still recognized despite the currency suffix");
  assertEqual(mappings.filter((m) => m.state === "needs_review").length, 0, "every column in the reduced subset is recognized — none unexpectedly need manual review");
  assertEqual(normalized.every((r) => r.status === "valid"), true, "§12: awareness rows reach readiness from spend+reach+impressions+dates+context alone — never blocked for absent clicks/conversions/revenue");

  const currency = detectReportCurrency(table, mappings);
  assertEqual(currency, { state: "detected", currency: "USD", source: "header_suffix" }, "Meta's header-suffix currency strategy (§14) still fires on a reduced column subset");
}

// ===========================================================================
// META — "traffic" subset, WITH a row-semantic Resultados/Indicador
// pair present this time, plus a genuinely unrecognized header, to
// prove unsafe guessing never happens (§23's "zero unsafe guesses").
// Also wrapped in a one-line preamble to prove header-row detection
// (§16) is genuinely generalized, not something only ever exercised on
// the Google fixture.
// ===========================================================================
{
  const headers = ["Nombre de la campaña", "Plataforma", "Resultados", "Indicador de resultado", "Clics en el enlace", "Impresiones", "Importe gastado (USD)", "Métrica Desconocida XYZ"];
  const rows = [
    ["Tráfico | Retargeting", "Instagram", "312", "Clics en el enlace", "298", "41200", "410.60", "n/a"],
  ];
  const csvContent = ["Informe de rendimiento", csvRow(headers), ...rows.map(csvRow)].join("\r\n");
  const parsed = parseCsv(csvContent);
  assertTrue(parsed.ok, "a Meta export with its own preamble line parses successfully — header-row detection (§16) is not Google-specific");
  if (!parsed.ok) throw new Error("unreachable");
  assertEqual(parsed.table.headers, headers, "the real header row is recovered exactly despite the preceding preamble line");

  const detection = detectExportPlatform(parsed.table.headers);
  assertEqual(detection.state, "detected", "the traffic subset is confidently detected as Meta Ads");
  assertEqual(detection.platformId, "meta_ads", "platform resolves to meta_ads");

  const mappings = detectMapping(parsed.table);
  const byHeader = (h: string) => mappings.find((m) => m.sourceHeader === h);
  assertEqual(byHeader("Métrica Desconocida XYZ")?.state, "needs_review", "§23: a genuinely unknown header is never silently mapped or dropped — it stays needs_review");
  assertEqual(byHeader("Métrica Desconocida XYZ")?.canonicalField, null, "the unknown column is never guessed into any canonical field");
  assertEqual(classifyFieldConfidence(byHeader("Métrica Desconocida XYZ")!), "ambiguous", "§6: an unresolved column classifies as ambiguous confidence — the only bucket that ever demands manual action");
  assertEqual(byHeader("Resultados")?.state, "ignored", "Resultados stays out of the plain mapped/needs_review buckets — resolved per row, not as a single column");
  assertEqual(ignoredReasonForHeader("Resultados"), "row_semantic", "Resultados is classified row_semantic, never a plain 'not needed' column");
  assertEqual(byHeader("Nombre de la campaña")?.canonicalField, "campaign_name", "campaign identity still recognized");
  assertEqual(classifyFieldConfidence(byHeader("Nombre de la campaña")!), "exact", "§6: a clean auto-mapped column classifies as exact confidence");
}

// ===========================================================================
// §11: GOOGLE — Search-only subset. Every row's own "Tipo de campaña"
// value uniformly says "Búsqueda" — row-level evidence (not a header)
// that safely narrows the generic campaign-report profile to the
// Search variant.
// ===========================================================================
{
  const headers = ["Campaña", "Código de moneda", "Tipo de campaña", "Clics", "Impr.", "Costo", "Conversiones"];
  const rows = [
    ["Búsqueda | Marca", "ARS", "Búsqueda", "780", "9150", "1134.00", "24"],
    ["Búsqueda | Genéricas", "ARS", "Búsqueda", "620", "10020", "4267.00", "12"],
  ];
  const table = tableFrom(headers, rows);
  const detection = detectExportPlatform(table.headers);
  assertEqual(detection.state, "detected", "the Google Search-only subset is confidently detected");
  assertEqual(detection.platformId, "google_ads", "platform resolves to google_ads");
  const mappings = detectMapping(table);
  const profile = classifyExportProfile("google_ads", table, mappings);
  assertEqual(profile.profileId, "google_search_campaign_report", "§11: a uniform 'Búsqueda' campaign-type column narrows the profile to the Search variant");

  const { normalized } = readyRows(table, "Google Ads", "us");
  assertEqual(normalized.every((r) => r.status === "valid"), true, "the Search-only subset reaches readiness with only 7 of the real export's 33 columns present");
}

// ===========================================================================
// §11: GOOGLE — Performance Max-only subset, plus a "Total: ..."
// aggregate row that must be excluded before it's ever counted as a
// campaign (§17), proving row exclusion isn't tied to the full
// 33-column fixture either.
// ===========================================================================
{
  const headers = ["Campaña", "Tipo de campaña", "Costo", "Valor de conv.", "Conversiones"];
  const rows = [
    ["Catálogo | Retargeting", "Máximo rendimiento", "32173.40", "61900.10", "61"],
    ["Catálogo | Prospecting", "Máximo rendimiento", "9880.00", "18730.40", "50"],
    ["Total: Campañas", "--", "42053.40", "80630.50", "111"],
  ];
  const rawTable = tableFrom(headers, rows);
  const { table, excludedCount } = excludeAggregateTotalRows(rawTable);
  assertEqual(excludedCount, 1, "§17: the aggregate 'Total: Campañas' row is excluded even from a 5-column subset");
  assertEqual(table.rows.length, 2, "only the 2 real campaign rows remain after exclusion");

  const detection = detectExportPlatform(table.headers);
  assertEqual(detection.state, "detected", "the PMax-only subset is confidently detected as Google Ads");
  const mappings = detectMapping(table);
  const profile = classifyExportProfile("google_ads", table, mappings);
  assertEqual(profile.profileId, "google_performance_max_report", "§11: a uniform 'Máximo rendimiento' campaign-type column narrows the profile to the Performance Max variant");
}

// ===========================================================================
// §11: GOOGLE — video-report subset. Quartile/TrueView header evidence
// takes priority over the (here deliberately non-uniform) campaign-type
// column, per classifyGoogleProfile's own evidence order.
// ===========================================================================
{
  const headers = ["Campaña", "Tipo de campaña", "Costo", "Impr.", "Vistas de TrueView", "Video reproducido al 25 %", "Video reproducido al 50 %", "Video reproducido al 75 %", "Video reproducido al 100 %"];
  const rows = [
    ["Marca | Awareness", "Video", "9880.00", "980500", "610200", "41.20%", "28.60%", "14.10%", "6.30%"],
  ];
  const table = tableFrom(headers, rows);
  const detection = detectExportPlatform(table.headers);
  assertEqual(detection.state, "detected", "the video-report subset is confidently detected as Google Ads");
  const mappings = detectMapping(table);
  const profile = classifyExportProfile("google_ads", table, mappings);
  assertEqual(profile.profileId, "google_video_campaign_report", "§11: TrueView/quartile header evidence resolves the video profile");
  const byHeader = (h: string) => mappings.find((m) => m.sourceHeader === h);
  assertEqual(byHeader("Vistas de TrueView")?.canonicalField, "video_views", "TrueView views still safely map to video_views on this reduced subset");
  for (const h of ["Video reproducido al 25 %", "Video reproducido al 50 %", "Video reproducido al 75 %", "Video reproducido al 100 %"]) {
    assertEqual(ignoredReasonForHeader(h), "context", `'${h}' remains a recognized, non-blocking contextual field on the subset, exactly as on the full fixture`);
  }
}

// ===========================================================================
// §21: GENERIC FALLBACK. A plain CSV with zero platform evidence at all
// must never be blocked — it falls back to the existing generic
// mapping flow untouched by any of this task's changes.
// ===========================================================================
{
  const headers = ["Plataforma", "Objetivo", "Vertical", "País", "Fecha de inicio", "Fecha de fin", "Costo"];
  const rows = [["Meta Ads", "Trafico", "Retail", "Argentina", "2026-08-01", "2026-08-31", "1000"]];
  const table = tableFrom(headers, rows);
  const detection = detectExportPlatform(table.headers);
  assertEqual(detection.state, "unknown", "a file with zero recognizable platform evidence stays 'unknown' — never a false-positive guess");
  // The generic mapping flow (Phase 16, untouched by this task) still
  // works fully independent of platform detection.
  const mappings = detectMapping(table);
  const byHeader = (h: string) => mappings.find((m) => m.sourceHeader === h);
  assertEqual(byHeader("Plataforma")?.canonicalField, "platform", "generic platform column still auto-maps with no platform detected at all");
  assertEqual(byHeader("Objetivo")?.canonicalField, "objective", "generic objective column still auto-maps");
  assertEqual(mappings.filter((m) => m.state === "needs_review").length, 0, "a fully generic, already-clean CSV needs no manual review — Continue is available immediately (§7)");
}

// ===========================================================================
// §6: FieldConfidence covers every state the deterministic pipeline
// actually produces (exact/ambiguous/derived/contextual) — never
// invents a fuzzy match to justify the two forward-compatible-only
// values (high_confidence/unsupported).
// ===========================================================================
{
  const headers = ["Campaña", "Costo prom.", "Video reproducido al 25 %", "Algo Desconocido"];
  const rows = [["X", "1", "2", "3"]];
  const mappings = detectMapping(tableFrom(headers, rows));
  const byHeader = (h: string) => mappings.find((m) => m.sourceHeader === h)!;
  assertEqual(classifyFieldConfidence(byHeader("Campaña")), "exact", "an auto-mapped column is 'exact' confidence");
  assertEqual(classifyFieldConfidence(byHeader("Costo prom.")), "derived", "a Cucurucho-calculated derived metric is 'derived' confidence, never 'ambiguous'");
  assertEqual(classifyFieldConfidence(byHeader("Video reproducido al 25 %")), "contextual", "a recognized context-only field is 'contextual' confidence");
  assertEqual(classifyFieldConfidence(byHeader("Algo Desconocido")), "ambiguous", "a genuinely unrecognized column is 'ambiguous' — the only bucket ever demanding manual action");
}

// ===========================================================================
// §19/§20: registry-driven guidance — only platforms with a real,
// confirmed export path (Meta/Google) carry a downloadGuidanceKey; the
// others are left to the generic per-platform fallback line, never a
// fabricated set of menu steps nobody has verified.
// ===========================================================================
{
  assertEqual(findAdPlatformProfile("meta_ads").downloadGuidanceKey, "contribute.import.downloadGuidanceMeta", "Meta carries its own confirmed download-guidance key");
  assertEqual(findAdPlatformProfile("google_ads").downloadGuidanceKey, "contribute.import.downloadGuidanceGoogle", "Google carries its own confirmed download-guidance key");
  for (const id of ["tiktok_ads", "pinterest_ads", "mercado_libre_ads"] as const) {
    assertEqual(findAdPlatformProfile(id).downloadGuidanceKey, undefined, `${id} has no fabricated download-guidance key — it falls back to the generic per-platform line`);
  }
  assertEqual(AD_PLATFORM_PROFILES.length, 5, "the platform registry still has exactly its 5 real platforms — this task added no new platform");
}

console.log(`test-adaptive-import-profiles: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
