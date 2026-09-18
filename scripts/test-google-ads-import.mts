// POST-MVP IMPORT FIX 3 regression fixture: a real Google Ads campaign
// export — report preamble skipping, the real 33-column header set
// given verbatim in the task, aggregate "Total: ..." row exclusion,
// English-style number parsing, direct currency-column detection, and
// file-level Objective/Vertical/Country context resolving what would
// otherwise be per-row validation errors.
//
// §S: deliberately generalized — nothing here is Google-specific at the
// pipeline level (detection is evidence-based, mapping is alias-based,
// total-row exclusion is a generic "Total:" prefix on whichever column
// resolves to campaign_name); this fixture only pins the real shape so
// a future change can't silently regress it.

import { parseCsv } from "../lib/import/parse";
import { detectMapping, applyMapping, excludeAggregateTotalRows, ignoredReasonForHeader } from "../lib/import/mapping";
import { normalizeAndValidateRow, detectDuplicates } from "../lib/import/validate";
import {
  detectExportPlatform,
  findAdPlatformProfile,
  detectCurrencyFromColumn,
  detectReportCurrency,
} from "../lib/import/platformExports";
import { suggestObjectiveFromCampaignNames } from "../lib/import/suggestions";
import type { CanonicalField } from "../lib/import/types";

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

// Verbatim, exactly as given in the task (§E) — 33 real columns.
const HEADERS = [
  "Estado de la campaña", "Campaña", "Presupuesto", "Nombre del presupuesto", "Tipo de presupuesto",
  "Código de moneda", "Estado", "Motivos del estado", "Tipo de campaña", "Interacciones",
  "Porcentaje de interacción", "Costo prom.", "Costo", "% impr. (absoluto parte sup.)", "Ingresos",
  "Impr.", "Video reproducido al 25 %", "Video reproducido al 50 %", "Video reproducido al 75 %",
  "Video reproducido al 100 %", "Usuarios únicos", "Vistas de TrueView", "% impr. (parte sup.)",
  "Nivel de optimización", "Tipo de estrategia de oferta", "Clics", "Porcentaje de conv.",
  "Valor de conv.", "Valor de conv./costo", "Conversiones", "Prom. CPC", "Costo/conv.", "CPM prom.",
];
assertEqual(HEADERS.length, 33, "the canonical fixture has exactly the 33 real headers given in the task");

// §D: the real preamble — a title line and a date-range summary line —
// both single-field (no commas), before the real comma-delimited header.
const PREAMBLE = ["Informe de campaña", "18 de septiembre de 2026 - 18 de septiembre de 2026"];

// 7 real campaign rows (§J's own example counts) with a mix of campaign
// types, one zero-conversion row, one "--" placeholder row, and two
// campaign names carrying the §B keyword-suggestion triggers.
const CAMPAIGN_ROWS: string[][] = [
  // Habilitada, Búsqueda | Marca, ..., Búsqueda, ...
  ["Habilitada", "Búsqueda | Marca", "50000", "Presupuesto marca", "Estándar", "ARS", "Habilitada", "--", "Búsqueda", "1200", "12.40%", "38.50", "1,134.00", "65.20%", "0.00", "9,150", "--", "--", "--", "--", "8,900", "--", "70.10%", "Óptimo", "Maximizar clics", "780", "3.10%", "15,230.75", "13.43", "24", "1.45", "47.25", "62.10"],
  // Búsqueda | Genéricas
  ["Habilitada", "Búsqueda | Genéricas", "40000", "Presupuesto genéricas", "Estándar", "ARS", "Habilitada", "--", "Búsqueda", "980", "9.80%", "42.10", "4,267.00", "58.30%", "0.00", "10,020", "--", "--", "--", "--", "9,700", "--", "63.40%", "Bueno", "Maximizar conversiones", "620", "1.94%", "8,410.20", "1.97", "12", "6.88", "355.58", "70.40"],
  // Máximo rendimiento | Catálogo
  ["Habilitada", "Máximo rendimiento | Catálogo", "80000", "Presupuesto catálogo", "Estándar", "ARS", "Habilitada", "--", "Máximo rendimiento", "2100", "18.60%", "15.30", "32,173.40", "72.00%", "0.00", "45,320", "--", "--", "--", "--", "38,150", "--", "75.20%", "Óptimo", "Maximizar valor de conversión", "1450", "4.20%", "61,900.10", "1.92", "61", "22.19", "527.43", "48.90"],
  // Display | Remarketing — placeholder-vs-zero test: Conversiones is
  // "--" (must become MISSING, never 0.00) while Interacciones is a
  // real "0" (must stay exactly 0, never become missing).
  ["Habilitada", "Display | Remarketing", "20000", "Presupuesto display", "Estándar", "ARS", "Habilitada", "--", "Display", "0", "--", "--", "2,850.53", "--", "0.00", "128,400", "12.30%", "9.10%", "4.00%", "1.80%", "112,600", "3,200", "--", "--", "--", "310", "--", "--", "--", "--", "9.19", "--", "22.20"],
  // Video | Awareness — §B: campaign name contains "Awareness".
  ["Habilitada", "Video | Awareness", "60000", "Presupuesto video", "Estándar", "ARS", "Habilitada", "--", "Video", "5400", "31.20%", "3.95", "9,880.00", "--", "0.00", "980,500", "41.20%", "28.60%", "14.10%", "6.30%", "845,300", "610,200", "--", "--", "--", "180", "--", "--", "--", "--", "54.89", "--", "10.08"],
  // Search | Tráfico — §B: campaign name contains "Tráfico".
  ["Habilitada", "Search | Tráfico", "25000", "Presupuesto trafico", "Estándar", "ARS", "Habilitada", "--", "Búsqueda", "740", "8.90%", "19.40", "1,955.60", "40.10%", "0.00", "6,300", "--", "--", "--", "--", "6,050", "--", "44.30%", "Aprendizaje", "Maximizar clics", "410", "0.00%", "0.00", "0.00", "0", "4.77", "--", "31.03"],
  // Shopping | Ofertas
  ["Habilitada", "Shopping | Ofertas", "35000", "Presupuesto shopping", "Estándar", "ARS", "Habilitada", "--", "Shopping", "1600", "14.70%", "9.60", "3,120.90", "68.50%", "0.00", "22,400", "--", "--", "--", "--", "19,800", "--", "71.90%", "Bueno", "Maximizar valor de conversión", "890", "5.60%", "18,730.40", "6.00", "50", "3.51", "62.42", "13.94"],
];
for (const row of CAMPAIGN_ROWS) {
  if (row.length !== HEADERS.length) throw new Error(`fixture row has ${row.length} fields, expected ${HEADERS.length}: ${row.join("|")}`);
}

// §J: real Google aggregate rows that must NEVER be imported as
// individual campaigns — exact labels from the task text.
const TOTAL_ROWS: string[][] = [
  ["--", "Total: Campañas", "310000", "--", "--", "ARS", "--", "--", "--", "12020", "--", "--", "53,381.63", "--", "0.00", "1,202,070", "--", "--", "--", "--", "1,040,700", "--", "--", "--", "--", "6040", "--", "104,271.45", "--", "197", "--", "--", "--"],
  ["--", "Total: Cuenta", "310000", "--", "--", "ARS", "--", "--", "--", "12020", "--", "--", "53,381.63", "--", "0.00", "1,202,070", "--", "--", "--", "--", "1,040,700", "--", "--", "--", "--", "6040", "--", "104,271.45", "--", "197", "--", "--", "--"],
  ["--", "Total: Búsqueda", "90000", "--", "--", "ARS", "--", "--", "--", "2920", "--", "--", "7,356.60", "--", "0.00", "25,370", "--", "--", "--", "--", "24,650", "--", "--", "--", "--", "1810", "--", "23,640.95", "--", "36", "--", "--", "--"],
  ["--", "Total: Máximo rendimiento", "80000", "--", "--", "ARS", "--", "--", "--", "2100", "--", "--", "32,173.40", "--", "0.00", "45,320", "--", "--", "--", "--", "38,150", "--", "--", "--", "--", "1450", "--", "61,900.10", "--", "61", "--", "--", "--"],
];

// Real Google number formatting embeds literal commas as thousands
// separators (e.g. "1,134.00") — a plain join(",") would corrupt column
// alignment, exactly like a real CSV writer this fixture must not
// pretend around. Every field containing a comma is properly CSV-quoted.
function csvField(value: string): string {
  return value.includes(",") || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
}
function csvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}
const csvLines = [
  ...PREAMBLE,
  csvRow(HEADERS),
  ...CAMPAIGN_ROWS.map(csvRow),
  ...TOTAL_ROWS.map(csvRow),
];
const csvContent = csvLines.join("\r\n");

// ---------------------------------------------------------------------
// §D: preamble skipped deterministically — the parser finds the real
// header row on its own, no manual deletion required.
// ---------------------------------------------------------------------
const parsed = parseCsv(csvContent);
assertTrue(parsed.ok, "the real Google fixture parses successfully despite the 2-line preamble");
if (!parsed.ok) process.exit(1);

assertEqual(parsed.table.headers, HEADERS, "the real header row (not a preamble line) is recovered exactly, in order");
assertEqual(parsed.table.rows.length, CAMPAIGN_ROWS.length + TOTAL_ROWS.length, "every real body row (campaigns + totals) survives parsing, before exclusion");

// §D/§G: the report-level date range, stated only in the skipped
// preamble, is recovered as the sole source of start/end date.
assertEqual(parsed.reportDateRange, { start: "2026-09-18", end: "2026-09-18" }, "the Spanish long-form preamble date range is parsed to ISO dates");

// ---------------------------------------------------------------------
// §J: aggregate "Total: ..." rows are excluded BEFORE mapping/
// detection/persistence ever see them — never double-counted against
// the real campaign rows they summarize.
// ---------------------------------------------------------------------
const { table, excludedCount } = excludeAggregateTotalRows(parsed.table);
assertEqual(excludedCount, 4, "exactly the 4 real 'Total: ...' rows are excluded — '4 filas de totales excluidas'");
assertEqual(table.rows.length, 7, "exactly the 7 real campaign rows remain — '7 campañas detectadas'");
assertTrue(
  table.rows.every((r) => !/^total\s*:/i.test(r[1] ?? "")),
  "no remaining row's campaign identity starts with 'Total:' — no aggregate ever slips through"
);
// A generic file with no campaign-identity column at all safely no-ops.
assertEqual(
  excludeAggregateTotalRows({ headers: ["Plataforma", "Inversión"], rows: [["Meta Ads", "100"]] }).excludedCount,
  0,
  "a file with no campaign-name column is left completely unchanged (never a false-positive exclusion)"
);

// ---------------------------------------------------------------------
// §F: Google Ads auto-detects from real header evidence alone — never
// from the filename (this fixture is never even given a filename).
// ---------------------------------------------------------------------
const detection = detectExportPlatform(table.headers);
assertEqual(detection.state, "detected", "Google Ads is confidently detected from the real header set");
assertEqual(detection.platformId, "google_ads", "the file resolves to the google_ads profile");
assertEqual(findAdPlatformProfile("google_ads").displayLabel, "Google Ads", "the 'Detectamos Google Ads' banner reads off this exact display label");

// ---------------------------------------------------------------------
// §G: safe raw mappings — campaign identity, currency, spend,
// impressions, clicks, conversions, conversion value, reach, video
// views, and campaign-type context all recognized without a manual
// mapping prompt.
// ---------------------------------------------------------------------
const mappings = detectMapping(table);
const byHeader = (h: string) => mappings.find((m) => m.sourceHeader === h);
assertEqual(byHeader("Campaña")?.canonicalField, "campaign_name", "'Campaña' auto-maps to campaign_name");
assertEqual(byHeader("Código de moneda")?.canonicalField, "currency", "'Código de moneda' auto-maps to currency");
assertEqual(byHeader("Costo")?.canonicalField, "ad_spend", "'Costo' auto-maps to ad_spend");
assertEqual(byHeader("Impr.")?.canonicalField, "impressions", "'Impr.' auto-maps to impressions");
assertEqual(byHeader("Clics")?.canonicalField, "clicks", "'Clics' auto-maps to clicks");
assertEqual(byHeader("Conversiones")?.canonicalField, "conversions", "'Conversiones' auto-maps to conversions");
assertEqual(byHeader("Valor de conv.")?.canonicalField, "attributed_revenue", "'Valor de conv.' auto-maps to attributed_revenue");
assertEqual(byHeader("Usuarios únicos")?.canonicalField, "reach", "'Usuarios únicos' auto-maps to reach");
assertEqual(byHeader("Vistas de TrueView")?.canonicalField, "video_views", "'Vistas de TrueView' auto-maps to video_views");
assertEqual(byHeader("Tipo de campaña")?.canonicalField, "campaign_type", "'Tipo de campaña' auto-maps to campaign_type (context only, never an objective)");

// ---------------------------------------------------------------------
// §H/§I: derived/calculated metrics and partial video-completion
// breakdowns are recognized and auto-ignored — never a mysterious
// unmapped column requiring manual attention.
// ---------------------------------------------------------------------
const derivedHeaders = ["Porcentaje de interacción", "Costo prom.", "Prom. CPC", "Costo/conv.", "CPM prom.", "Valor de conv./costo", "Porcentaje de conv."];
for (const h of derivedHeaders) {
  assertEqual(byHeader(h)?.state, "ignored", `'${h}' is auto-recognized, never left needing manual mapping`);
  assertEqual(ignoredReasonForHeader(h), "derived", `'${h}' is classified "Cucurucho la calcula" (derived), not a mystery column`);
}
const videoBreakdownHeaders = ["Video reproducido al 25 %", "Video reproducido al 50 %", "Video reproducido al 75 %", "Video reproducido al 100 %"];
for (const h of videoBreakdownHeaders) {
  assertEqual(byHeader(h)?.state, "ignored", `'${h}' is auto-recognized as a known contextual field`);
  assertEqual(ignoredReasonForHeader(h), "context", `'${h}' is classified as context, never a mysterious unmapped column`);
}
// No column at all is left "needs_review" for this real, fully-known
// Google export shape — every header is either mapped or a recognized
// derived/context field.
const needsReviewHeaders = mappings.filter((m) => m.state === "needs_review").map((m) => m.sourceHeader);
assertEqual(needsReviewHeaders, [], "every real Google column is recognized — none require manual mapping");

// ---------------------------------------------------------------------
// §M: currency is detected directly from the "Código de moneda" COLUMN
// — stronger evidence than a header-suffix inference, and the common
// dual-strategy interface picks it automatically.
// ---------------------------------------------------------------------
const currencyFromColumn = detectCurrencyFromColumn(table, mappings);
assertEqual(currencyFromColumn, { state: "detected", currency: "ARS", source: "column" }, "ARS is detected directly from the real currency column");
assertEqual(detectReportCurrency(table, mappings), { state: "detected", currency: "ARS", source: "column" }, "the common orchestrator prefers the stronger column-based strategy over header-suffix inference");
// Conflicting per-row currency values are flagged ambiguous, never
// silently picked.
const mixedCurrencyTable = { headers: table.headers, rows: table.rows.map((r, i) => (i === 0 ? [...r.slice(0, 5), "USD", ...r.slice(6)] : r)) };
assertEqual(detectCurrencyFromColumn(mixedCurrencyTable, mappings).state, "ambiguous", "conflicting currency-column values across rows are flagged ambiguous, never guessed");

// ---------------------------------------------------------------------
// §L/§K: English-style number parsing and "--" placeholder handling.
// ---------------------------------------------------------------------
const mapped = applyMapping(table, mappings);
const numberFormat = findAdPlatformProfile("google_ads").numberFormat;
assertEqual(numberFormat, "us", "the google_ads profile declares English-style number notation");

const taxonomies = {
  platforms: [{ internal_key: "google_ads", display_label: "Google Ads" }],
  objectives: [{ internal_key: "traffic", display_label: "Traffic" }, { internal_key: "awareness", display_label: "Awareness" }, { internal_key: "reach", display_label: "Reach" }],
  verticals: [{ internal_key: "retail", display_label: "Retail" }],
  countries: [{ iso_code: "AR", display_label: "Argentina" }],
  businessModels: [], audienceStrategies: [], funnelStages: [],
};

// §A/§P: the file-level context — Objective/Vertical/Country selected
// ONCE — is injected into every row that doesn't already carry its own
// value, exactly the same optional pattern ContributeLanding.tsx uses.
const CONTEXT: Partial<Record<CanonicalField, string>> = { objective: "traffic", vertical: "retail", country: "AR" };
const rowsWithContext = mapped.map((row) => {
  const merged: typeof row = {
    ...row,
    platform: row.platform ?? "Google Ads",
    // §D/§G: the report-level date range recovered from the skipped
    // preamble — this real fixture has NO per-row date columns at all,
    // so this is the only source of start/end date.
    start_date: row.start_date ?? parsed.reportDateRange?.start,
    end_date: row.end_date ?? parsed.reportDateRange?.end,
  };
  for (const [field, value] of Object.entries(CONTEXT) as [CanonicalField, string][]) {
    if (!merged[field]) merged[field] = value;
  }
  return merged;
});
const normalized = detectDuplicates(rowsWithContext.map((row, i) => normalizeAndValidateRow(i + 2, row, taxonomies, { numberFormat })));

assertEqual(normalized.length, 7, "all 7 real campaign rows are processed");
assertEqual(
  normalized.map((r) => r.campaignName),
  ["Búsqueda | Marca", "Búsqueda | Genéricas", "Máximo rendimiento | Catálogo", "Display | Remarketing", "Video | Awareness", "Search | Tráfico", "Shopping | Ofertas"],
  "all 7 real campaign identities are preserved, in order"
);
assertEqual(
  normalized.map((r) => r.campaignType),
  ["Búsqueda", "Búsqueda", "Máximo rendimiento", "Display", "Video", "Búsqueda", "Shopping"],
  "campaign type (Google's own 'Tipo de campaña') is preserved contextually (review-only) — never taxonomy-resolved or translated into an objective"
);

// §L: English-style grouping/decimal notation parsed correctly — never
// mangled by LATAM-primary ambiguity handling.
assertEqual(normalized[0].adSpend, 1134, "'1,134.00' parses as 1134 (thousands comma), never 1.134");
assertEqual(normalized[1].adSpend, 4267, "'4,267.00' parses as 4267 (thousands comma), never 4.267");
assertEqual(normalized[2].adSpend, 32173.40, "'32,173.40' parses as 32173.40, never 32.1734");
assertEqual(normalized[3].adSpend, 2850.53, "'2850.53' parses as 2850.53");
assertEqual(normalized[0].rawMetrics.impressions, 9150, "'9,150' impressions parses as 9150, never 9.15");
assertEqual(normalized[2].rawMetrics.clicks, 1450, "'1,450'-shaped clicks parse correctly for the Máximo rendimiento row");
assertEqual(normalized[2].rawMetrics.conversions, 61, "conversions parse as a plain integer");
assertEqual(normalized[2].rawMetrics.attributed_revenue, 61900.10, "'61,900.10' conversion value parses as 61900.10");
assertEqual(normalized[0].rawMetrics.reach, 8900, "'8,900' unique-users value maps through reach and parses correctly");

// §K: "--" becomes genuinely MISSING, never a zero — while a real "0"
// stays exactly 0.
assertEqual(normalized[3].rawMetrics.conversions, undefined, "'--' in Conversiones becomes missing, never 0");
assertTrue(!normalized[3].issues.some((i) => i.field === "conversions"), "a missing OPTIONAL metric ('--') never blocks the row — conversions isn't required");
assertEqual(normalized[5].rawMetrics.conversions, 0, "a real '0' conversions value stays exactly 0, never dropped as missing");

// ---------------------------------------------------------------------
// §A/§Q: file-level context resolves what would otherwise be repeated
// per-row Objective/Vertical/Country validation errors — every row
// becomes ready off of ad_spend + dates + currency + context alone.
// ---------------------------------------------------------------------
const readyCount = normalized.filter((r) => r.status === "valid").length;
const reviewCount = normalized.filter((r) => r.status !== "valid").length;
assertEqual(readyCount, 7, "all 7 campaigns are ready after the file-level context is applied ONCE — never per-row Objective/Vertical/País errors");
assertEqual(reviewCount, 0, "no campaign needs review — matches the task's own '0 necesitan revisión' target");
for (const row of normalized) {
  assertEqual(row.objective, "traffic", "the file-level objective is applied to every row lacking its own value");
  assertEqual(row.vertical, "retail", "the file-level vertical is applied to every row lacking its own value");
  assertEqual(row.country, "AR", "the file-level country is applied to every row lacking its own value");
  assertEqual(row.currency, "ARS", "the column-detected ARS currency is applied to every row");
  assertEqual(row.startDate, "2026-09-18", "the preamble-derived report start date is applied to every row (no per-row date column exists)");
  assertEqual(row.endDate, "2026-09-18", "the preamble-derived report end date is applied to every row");
}

// Without the file-level context, the exact same rows would all need
// review for the exact same repeated reason — proving the context
// section is what resolves it, not some other change.
const normalizedNoContext = detectDuplicates(mapped.map((row, i) => normalizeAndValidateRow(i + 2, { ...row, platform: row.platform ?? "Google Ads" }, taxonomies, { numberFormat })));
assertTrue(
  normalizedNoContext.every((r) => r.status === "needs_review"),
  "WITHOUT the file-level context, every row needs review for the same repeated Objective/Vertical/País gap — proving the context section is what fixes it"
);

// ---------------------------------------------------------------------
// §B: objective auto-suggestion — never silent, always requires an
// explicit user action to apply (enforced by the caller, ContributeLanding.tsx;
// this module only ever proposes).
// ---------------------------------------------------------------------
const campaignNames = table.rows.map((r) => r[1]);
const awarenessSuggestion = suggestObjectiveFromCampaignNames(["Video | Awareness"], taxonomies.objectives);
assertEqual(awarenessSuggestion?.internalKey, "awareness", "'Awareness' in a campaign name suggests the awareness objective");
const trafficSuggestion = suggestObjectiveFromCampaignNames(["Search | Tráfico"], taxonomies.objectives);
assertEqual(trafficSuggestion?.internalKey, "traffic", "'Tráfico' in a campaign name suggests the traffic objective");
const fullFileSuggestion = suggestObjectiveFromCampaignNames(campaignNames, taxonomies.objectives);
assertTrue(fullFileSuggestion !== null, "the first matching campaign name in the file yields a suggestion");
// Google's own campaign TYPE never drives a suggestion — only the
// campaign's own NAME does (§B: "Google campaign type ... does NOT by
// itself define business objective").
const noObjectivesTaxonomy: { internal_key: string; display_label: string }[] = [];
assertEqual(suggestObjectiveFromCampaignNames(["Video | Awareness"], noObjectivesTaxonomy), null, "a suggestion is never returned for an objective absent from the real taxonomy — never invented");
assertEqual(suggestObjectiveFromCampaignNames(["Búsqueda | Marca"], taxonomies.objectives), null, "a plain campaign name with no safe keyword yields no suggestion — never a guess");

// ---------------------------------------------------------------------
// §S: no overfitting — detection/mapping never depended on a specific
// campaign name, numeric value, or filename; a differently-named,
// differently-valued file with the same real header shape still works.
// ---------------------------------------------------------------------
const genericCsv = "Plataforma,Objetivo,Vertical,País,Fecha inicio,Fecha fin,Inversión\nMeta Ads,Trafico,Retail,Argentina,2026-08-01,2026-08-31,1000\n";
const genericParsed = parseCsv(genericCsv);
assertTrue(genericParsed.ok, "a normal CSV whose first row is already the header still parses correctly — no preamble regression");
if (genericParsed.ok) {
  assertEqual(genericParsed.reportDateRange, null, "a file with no preamble at all has no report date range — never a false positive");
  assertEqual(excludeAggregateTotalRows(genericParsed.table).excludedCount, 0, "a plain generic import has no aggregate rows to exclude");
}

console.log(`test-google-ads-import: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
