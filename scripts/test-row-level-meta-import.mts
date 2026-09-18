// POST-MVP IMPORT FIX 2 regression fixture: row-level Meta result
// semantics, campaign identity, and currency auto-detection.
//
// §1/§12: the exact 17 headers and 3 example campaign rows below were
// given verbatim in the task as a REAL Meta Ads export — no
// "Plataforma" column this time, and each row has a DIFFERENT
// "Indicador de resultado" value, proving Meta's "Resultados" semantics
// vary PER ROW inside a single file. This is the canonical regression
// fixture for §2 (row-level result resolution), §3 (campaign identity),
// §4 (currency auto-detection), and §5 (platform detection without a
// literal "Plataforma" column).

import { detectMapping, applyMapping, ignoredReasonForHeader, extractCurrencySuffix, normalizeHeader } from "../lib/import/mapping";
import { normalizeAndValidateRow, detectDuplicates } from "../lib/import/validate";
import { detectExportPlatform, resolveMetaResultForRow, detectReportCurrency, findAdPlatformProfile } from "../lib/import/platformExports";
import type { RawTable, MappedRow } from "../lib/import/types";

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

// Verbatim, exactly as given in the task (§1) — no "Plataforma" column.
const HEADERS = [
  "Inicio del informe",
  "Fin del informe",
  "Nombre de la campaña",
  "Resultados",
  "Indicador de resultado",
  "Entrega de la campaña",
  "Alcance",
  "Frecuencia",
  "Coste por 1000 cuentas de Meta alcanzadas (USD)",
  "Impresiones",
  "CPM (coste por 1000 impresiones) (USD)",
  "Seguidores de Instagram",
  "ACOS",
  "CPC (todos) (USD)",
  "Importe gastado (USD)",
  "Resultados (iniciales)",
  "Indicador de resultados (inicial)",
];
assertEqual(HEADERS.length, 17, "the canonical fixture has exactly the 17 real headers given in the task");

// Index reference (comments avoid an off-by-one in the rows below):
// 0 Inicio, 1 Fin, 2 Nombre, 3 Resultados, 4 Indicador, 5 Entrega,
// 6 Alcance, 7 Frecuencia, 8 Coste/1000 cuentas, 9 Impresiones,
// 10 CPM, 11 Seguidores IG, 12 ACOS, 13 CPC, 14 Importe gastado,
// 15 Resultados (iniciales), 16 Indicador (inicial).
const rows = [
  // §1 row 1: "🐶 WM | Trafico | Seguidores" — Resultados=6227, Indicador=total_profile_visits.
  ["2026-08-01", "2026-08-31", "🐶 WM | Trafico | Seguidores", "6227", "total_profile_visits", "active", "185000", "2.1", "0.09", "610000", "3.10", "12400", "1.20", "0.45", "1900.00", "7000", "total_profile_visits"],
  // §1 row 2: "🐶 WM | Trafico | Ventas" — Resultados=131, Indicador=actions:omni_landing_page_view.
  ["2026-08-01", "2026-08-31", "🐶 WM | Trafico | Ventas", "131", "actions:omni_landing_page_view", "active", "95000", "1.6", "0.11", "310000", "3.40", "12400", "0.95", "0.62", "1200.00", "150", "actions:omni_landing_page_view"],
  // §1 row 3: "🐶 WM | Awareness | Alcance" — Resultados=148650, Indicador=reach.
  ["2026-08-01", "2026-08-31", "🐶 WM | Awareness | Alcance", "148650", "reach", "active", "148650", "1.0", "0.02", "148650", "1.80", "12400", "0.00", "0.00", "850.00", "148650", "reach"],
];
const table: RawTable = { headers: HEADERS, rows };

// ---------------------------------------------------------------------
// §5: platform must still be auto-detected as Meta Ads despite the
// missing "Plataforma" column — no regression from the earlier fix.
// ---------------------------------------------------------------------
const detection = detectExportPlatform(table.headers);
assertEqual(detection.state, "detected", "Meta Ads is detected even with no 'Plataforma' column");
assertEqual(detection.platformId, "meta_ads", "the file resolves to the meta_ads profile");
assertEqual(findAdPlatformProfile("meta_ads").displayLabel, "Meta Ads", "the 'Detectamos Meta Ads' banner reads off this exact display label");

// ---------------------------------------------------------------------
// §3: campaign identity — all 3 real campaign names are preserved,
// never anonymous rows.
// ---------------------------------------------------------------------
const mappings = detectMapping(table);
const byHeader = (h: string) => mappings.find((m) => m.sourceHeader === h);
assertEqual(byHeader("Nombre de la campaña")?.canonicalField, "campaign_name", "'Nombre de la campaña' auto-maps to campaign_name");

// ---------------------------------------------------------------------
// §4/§11: currency auto-detection from header currency-code suffixes.
// ---------------------------------------------------------------------
assertEqual(extractCurrencySuffix("Importe gastado (USD)"), "USD", "extractCurrencySuffix reads the exact currency code from a header suffix");
assertEqual(detectReportCurrency(table.headers), { state: "detected", currency: "USD" }, "a consistent single currency suffix (USD) across headers is auto-detected");
assertEqual(detectReportCurrency(table.headers.map((h) => h.replace(/\(USD\)/, "(ARS)"))), { state: "detected", currency: "ARS" }, "the same logic detects ARS just as reliably");
assertEqual(detectReportCurrency(table.headers.map((h) => h.replace(/\(USD\)/, "(MXN)"))), { state: "detected", currency: "MXN" }, "the same logic detects MXN just as reliably");
assertEqual(
  detectReportCurrency(["Importe gastado (USD)", "CPC (todos) (ARS)"]),
  { state: "ambiguous", currency: null },
  "conflicting currency codes across headers are flagged ambiguous, never guessed"
);
assertEqual(
  detectReportCurrency(["Importe gastado", "Impresiones"]),
  { state: "none", currency: null },
  "no currency-code suffix anywhere falls back to 'none' (the existing safe default applies downstream)"
);

// ---------------------------------------------------------------------
// §2/§8/§10: row-level result semantics — the exact scenario a
// file-level resolver could never handle safely.
// ---------------------------------------------------------------------
assertEqual(byHeader("Resultados")?.state, "ignored", "'Resultados' is never a single static column mapping");
assertEqual(ignoredReasonForHeader("Resultados"), "row_semantic", "'Resultados' carries the distinct row_semantic reason");
assertEqual(ignoredReasonForHeader("Indicador de resultado"), "row_semantic", "'Indicador de resultado' carries the distinct row_semantic reason");

const resultsIdx = table.headers.indexOf("Resultados");
const indicatorIdx = table.headers.indexOf("Indicador de resultado");
const resolutions = rows.map((row) => resolveMetaResultForRow(row[resultsIdx], row[indicatorIdx]));

// Row 1: "total_profile_visits" has no matching canonical field — never
// guessed, but must not block the row's other valid raw metrics.
assertEqual(resolutions[0].reason, "unknown_indicator", "row 1's 'total_profile_visits' indicator is left unmapped (unknown_indicator), never guessed");
assertEqual(resolutions[0].canonicalField, null, "row 1's result is never mapped to conversions/leads/purchases/clicks");

// Row 2: Meta's internal "actions:omni_landing_page_view" resolves to
// the real landing_page_views canonical field Cucurucho already has.
assertEqual(resolutions[1].reason, "mapped", "row 2's 'actions:omni_landing_page_view' resolves safely");
assertEqual(resolutions[1].canonicalField, "landing_page_views", "row 2's indicator maps to landing_page_views, not purchases or any other field");

// Row 3: a "reach" indicator must never be re-imported as a conversion —
// it would duplicate the Alcance column's own already-captured value.
assertEqual(resolutions[2].reason, "duplicates_existing_metric", "row 3's 'reach' indicator is recognized as a duplicate of the Alcance column, not a conversion");
assertEqual(resolutions[2].canonicalField, null, "row 3's 'reach' result is never mapped to any field");

// The pipeline supports all three DIFFERENT semantics in the SAME file
// without cross-contaminating rows.
assertTrue(
  new Set(resolutions.map((r) => r.reason)).size === 3,
  "three rows resolve to three genuinely different reasons in the same file — proving per-row (not file-wide) resolution"
);

// ---------------------------------------------------------------------
// End-to-end: apply the mapping + row-level injections + currency
// injection exactly as ContributeLanding.tsx's runValidation does, then
// validate every row.
// ---------------------------------------------------------------------
function applyRowResultInjections(t: RawTable, mappedRows: MappedRow[]): MappedRow[] {
  const rIdx = t.headers.findIndex((h) => normalizeHeader(h) === "resultados");
  const iIdx = t.headers.findIndex((h) => normalizeHeader(h) === "indicador de resultado");
  if (rIdx === -1) return mappedRows;
  return mappedRows.map((row, i) => {
    const resultsRaw = t.rows[i]?.[rIdx];
    const indicatorRaw = iIdx !== -1 ? t.rows[i]?.[iIdx] : undefined;
    const resolution = resolveMetaResultForRow(resultsRaw, indicatorRaw);
    if (resolution.reason === "mapped" && resolution.canonicalField && row[resolution.canonicalField] === undefined) {
      return { ...row, [resolution.canonicalField]: resultsRaw };
    }
    return row;
  });
}

const mappedBase = applyMapping(table, mappings);
const currency = detectReportCurrency(table.headers);
const withCurrency = currency.state === "detected"
  ? mappedBase.map((row) => ({ ...row, currency: row.currency ?? currency.currency! }))
  : mappedBase;
const withResults = applyRowResultInjections(table, withCurrency);
// A platform-export upload with no per-row "Plataforma" column relies on
// the SAME dynamic platform-injection ContributeLanding.tsx already
// applies (post-MVP fix §D) — reproduced minimally here since this
// script tests the pure pipeline, not the React component.
const withPlatform = withResults.map((row) => ({ ...row, platform: row.platform ?? findAdPlatformProfile("meta_ads").displayLabel }));

const taxonomies = {
  platforms: [{ internal_key: "meta_ads", display_label: "Meta Ads" }],
  objectives: [{ internal_key: "traffic", display_label: "Traffic" }],
  verticals: [{ internal_key: "retail", display_label: "Retail" }],
  countries: [{ iso_code: "AR", display_label: "Argentina" }],
  businessModels: [], audienceStrategies: [], funnelStages: [],
};
const normalized = detectDuplicates(withPlatform.map((row, i) => normalizeAndValidateRow(i + 2, { ...row, objective: "traffic", vertical: "retail", country: "argentina" }, taxonomies)));

assertEqual(normalized.length, 3, "all 3 campaign rows are processed");
assertEqual(normalized.map((r) => r.campaignName), ["🐶 WM | Trafico | Seguidores", "🐶 WM | Trafico | Ventas", "🐶 WM | Awareness | Alcance"], "all 3 real campaign identities are preserved, in order — never anonymous rows");
assertTrue(normalized.every((r) => r.currency === "USD"), "USD is auto-detected and applied to every row without asking the user to choose it manually");
assertEqual(normalized[0].adSpend, 1900, "row 1's spend parses correctly");
assertEqual(normalized[1].adSpend, 1200, "row 2's spend parses correctly");
assertEqual(normalized[2].adSpend, 850, "row 3's spend parses correctly");
assertEqual(normalized.map((r) => r.startDate), ["2026-08-01", "2026-08-01", "2026-08-01"], "dates parse correctly for every row");
assertEqual(normalized.map((r) => r.endDate), ["2026-08-31", "2026-08-31", "2026-08-31"], "dates parse correctly for every row");
assertEqual(normalized[0].rawMetrics.reach, 185000, "row 1's Alcance parses into reach");
assertEqual(normalized[1].rawMetrics.impressions, 310000, "row 2's Impresiones parses into impressions");

// §2/§10: the unsupported/unmapped result type on row 1 must NOT block
// that row's other valid raw metrics from contributing to the benchmark.
assertEqual(normalized[0].status, "valid", "row 1 (unsupported 'total_profile_visits' result) is still a valid, importable row — spend/impressions/reach/dates are enough");
assertTrue(normalized[0].rawMetrics.conversions === undefined, "row 1 never has a guessed conversions value");

// Row 2's landing_page_views result IS imported as real data.
assertEqual(normalized[1].rawMetrics.landing_page_views, 131, "row 2's landing-page-view result (131) is imported into landing_page_views");
assertEqual(normalized[1].status, "valid", "row 2 is a valid, fully-importable row");

// Row 3's reach-duplicate result is never double-counted as a separate
// metric — Alcance already captured 148650.
assertTrue(normalized[2].rawMetrics.conversions === undefined, "row 3's 'reach' result is never imported as a conversion");
assertEqual(normalized[2].rawMetrics.reach, 148650, "row 3's Alcance value is captured exactly once, from the Alcance column itself");
assertEqual(normalized[2].status, "valid", "row 3 is a valid, fully-importable row");

// §5: no double-counting from the "(iniciales)"/"(inicial)" companions.
assertEqual(byHeader("Resultados (iniciales)")?.state, "ignored", "'Resultados (iniciales)' is never imported");
assertEqual(byHeader("Indicador de resultados (inicial)")?.state, "ignored", "'Indicador de resultados (inicial)' is never imported");
assertTrue(
  normalized.every((r) => Object.keys(r.rawMetrics).filter((k) => k === "conversions" || k === "landing_page_views").length <= 1),
  "no row ever double-counts its primary result via both the primary and the initial-snapshot columns"
);

// ---------------------------------------------------------------------
// No regression to generic (non-Meta) CSV import.
// ---------------------------------------------------------------------
const genericTable: RawTable = { headers: ["Some Custom Field", "Another One"], rows: [["a", "b"]] };
assertEqual(detectExportPlatform(genericTable.headers).state, "unknown", "an unrelated generic file is still 'unknown'");
assertEqual(detectMapping(genericTable).every((m) => m.state === "needs_review"), true, "genuinely unknown columns in a non-Meta file still need review");

console.log(`\ntest-row-level-meta-import: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
