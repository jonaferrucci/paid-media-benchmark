// Real-Meta-export regression fixture (post-MVP fix). The exact 18
// headers below were confirmed against an actual Meta Ads export and
// used as the canonical regression fixture for this task — the fix
// itself is generalized (new mapping.ts aliases/ignore-reasons, a
// currency-suffix-aware normalizeHeader, new Meta detection
// signatures, and a dynamic "Resultados" resolver in
// platformExports.ts), never hardcoded to this one filename, but this
// script pins the exact real header/value shape so a future change
// can't silently regress the real-world case that prompted the fix.

import { detectMapping, applyMapping, ignoredReasonForHeader, normalizeHeader } from "../lib/import/mapping";
import { normalizeAndValidateRow } from "../lib/import/validate";
import { detectExportPlatform, resolveMetaResultsMapping, findAdPlatformProfile } from "../lib/import/platformExports";
import type { RawTable, DetectedMapping, CanonicalField } from "../lib/import/types";

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

// Verbatim, exactly as given in the task's real-export fixture.
const REAL_META_HEADERS = [
  "Inicio del informe",
  "Fin del informe",
  "Nombre de la campaña",
  "Plataforma",
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

// This is the app's own post-processing step (ContributeLanding.tsx's
// handleFile), reproduced here so the pure pipeline can be tested
// end-to-end without a browser — mirrors the real component exactly,
// not a simplified stand-in.
function applyResultsResolution(table: RawTable, mappings: DetectedMapping[]): DetectedMapping[] {
  const resolution = resolveMetaResultsMapping(table);
  if (resolution.reason !== "mapped" || !resolution.canonicalField) return mappings;
  const alreadyClaimed = mappings.some((m) => m.state === "mapped" && m.canonicalField === resolution.canonicalField);
  if (alreadyClaimed) return mappings;
  return mappings.map((m) =>
    normalizeHeader(m.sourceHeader) === "resultados"
      ? { ...m, canonicalField: resolution.canonicalField as CanonicalField, state: "mapped" as const }
      : m
  );
}

function buildFixture(indicatorValue: string): RawTable {
  // Positional, one value per REAL_META_HEADERS entry (index-commented
  // to avoid an off-by-one — this exact alignment matters for the
  // assertions below that read specific field values back out).
  const row = [
    "2026-08-01",        // 0  Inicio del informe
    "2026-08-31",        // 1  Fin del informe
    "Campaña Verano",    // 2  Nombre de la campaña
    "Meta Ads",          // 3  Plataforma
    "25",                // 4  Resultados
    indicatorValue,       // 5  Indicador de resultado
    "active",            // 6  Entrega de la campaña
    "120000",            // 7  Alcance
    "1.8",               // 8  Frecuencia
    "15.20",             // 9  Coste por 1000 cuentas de Meta alcanzadas (USD)
    "500000",            // 10 Impresiones
    "12.30",             // 11 CPM (coste por 1000 impresiones) (USD)
    "10500",             // 12 Seguidores de Instagram
    "0.85",              // 13 ACOS
    "4.20",              // 14 CPC (todos) (USD)
    "1500.00",           // 15 Importe gastado (USD)
    "30",                // 16 Resultados (iniciales)
    indicatorValue,       // 17 Indicador de resultados (inicial)
  ];
  const rows = Array.from({ length: 7 }, () => [...row]);
  return { headers: REAL_META_HEADERS, rows };
}

// ---------------------------------------------------------------------
// §2: Meta must be detected from this exact real header combination,
// with no literal "Meta Ads" column value required for detection.
// ---------------------------------------------------------------------
const table = buildFixture("Clientes potenciales");
const detection = detectExportPlatform(table.headers);
assertEqual(detection.state, "detected", "the real Meta export is detected (not ambiguous/unknown)");
assertEqual(detection.platformId, "meta_ads", "the real Meta export resolves to the meta_ads profile");
assertEqual(findAdPlatformProfile("meta_ads").displayLabel, "Meta Ads", "the UI's 'Detectamos Meta Ads' banner reads off this exact display label");

// ---------------------------------------------------------------------
// §3/§6/§7: safe raw fields auto-map — reach, impressions, spend,
// report dates, and platform — with zero manual work.
// ---------------------------------------------------------------------
const baseMappings = detectMapping(table);
const byHeader = (h: string) => baseMappings.find((m) => m.sourceHeader === h);

assertEqual(byHeader("Alcance")?.canonicalField, "reach", "'Alcance' auto-maps to reach");
assertEqual(byHeader("Impresiones")?.canonicalField, "impressions", "'Impresiones' auto-maps to impressions");
assertEqual(byHeader("Importe gastado (USD)")?.canonicalField, "ad_spend", "'Importe gastado (USD)' auto-maps to ad_spend despite the currency suffix");
assertEqual(byHeader("Plataforma")?.canonicalField, "platform", "'Plataforma' auto-maps to platform");
assertEqual(byHeader("Inicio del informe")?.canonicalField, "start_date", "'Inicio del informe' auto-maps to start_date");
assertEqual(byHeader("Fin del informe")?.canonicalField, "end_date", "'Fin del informe' auto-maps to end_date");

// §7: campaign name has no canonical field in the schema (confirmed:
// performance_datasets has no name/identity column) — classified
// clearly as context metadata, not dumped into needs_review.
assertEqual(byHeader("Nombre de la campaña")?.state, "ignored", "'Nombre de la campaña' is recognized-but-not-imported, not needs_review");
assertEqual(ignoredReasonForHeader("Nombre de la campaña"), "context", "'Nombre de la campaña' is classified as context metadata, not a derived metric");

// ---------------------------------------------------------------------
// §4: known calculated/derived Meta fields never require manual
// mapping — recognized as "no necesarias" (derived), not needs_review.
// ---------------------------------------------------------------------
for (const h of ["Frecuencia", "Coste por 1000 cuentas de Meta alcanzadas (USD)", "CPM (coste por 1000 impresiones) (USD)", "ACOS", "CPC (todos) (USD)"]) {
  assertEqual(byHeader(h)?.state, "ignored", `'${h}' is auto-ignored, never needs_review`);
  assertEqual(ignoredReasonForHeader(h), "derived", `'${h}' is classified as a derived/calculated metric`);
}

// "Seguidores de Instagram" — a real, recognized column with no
// canonical field (not a metric Cucurucho's schema tracks at all).
assertEqual(byHeader("Seguidores de Instagram")?.state, "ignored", "'Seguidores de Instagram' is recognized-but-not-imported");
assertEqual(ignoredReasonForHeader("Seguidores de Instagram"), "context", "'Seguidores de Instagram' is classified as context, not a calculation conflict");

// ---------------------------------------------------------------------
// §5: "Resultados" is interpreted via its paired "Indicador de
// resultado" value — never blindly mapped to a single metric.
// ---------------------------------------------------------------------
assertEqual(byHeader("Resultados")?.canonicalField, null, "'Resultados' is NOT statically aliased to any canonical field");
assertEqual(byHeader("Indicador de resultado")?.state, "ignored", "'Indicador de resultado' itself is recognized-but-not-imported (interpretation-only)");

const safeResolution = resolveMetaResultsMapping(table);
assertEqual(safeResolution, { canonicalField: "conversions", reason: "mapped", indicatorSample: "clientes potenciales" }, "a safe indicator ('Clientes potenciales') resolves Resultados -> conversions");

const adjustedMappings = applyResultsResolution(table, baseMappings);
assertEqual(adjustedMappings.find((m) => m.sourceHeader === "Resultados")?.canonicalField, "conversions", "after resolution, 'Resultados' is dynamically mapped to conversions for this file");
assertEqual(adjustedMappings.find((m) => m.sourceHeader === "Resultados")?.state, "mapped", "after resolution, 'Resultados' is 'mapped', not needs_review");

// An unknown/unsupported indicator leaves Resultados unmapped —
// flagged for review, never guessed.
const unknownIndicatorTable = buildFixture("Recuerdo del anuncio");
const unknownResolution = resolveMetaResultsMapping(unknownIndicatorTable);
assertEqual(unknownResolution.reason, "unknown_indicator", "an unsupported indicator value leaves Resultados unresolved (unknown_indicator)");
const unknownAdjusted = applyResultsResolution(unknownIndicatorTable, detectMapping(unknownIndicatorTable));
assertEqual(unknownAdjusted.find((m) => m.sourceHeader === "Resultados")?.state, "needs_review", "with an unsupported indicator, only 'Resultados' itself needs review");
// Every OTHER safe column is still auto-recognized — the user is never
// made to re-review unrelated safe columns just because one field is
// genuinely ambiguous.
assertEqual(unknownAdjusted.find((m) => m.sourceHeader === "Alcance")?.state, "mapped", "an ambiguous 'Resultados' never blocks unrelated safe columns like Alcance");
assertEqual(unknownAdjusted.find((m) => m.sourceHeader === "Importe gastado (USD)")?.state, "mapped", "an ambiguous 'Resultados' never blocks unrelated safe columns like Importe gastado");

// A row mixing more than one result type is flagged, not guessed.
const indicatorColumnIdx = REAL_META_HEADERS.indexOf("Indicador de resultado");
const mixedRowA = [...buildFixture("x").rows[0]];
mixedRowA[indicatorColumnIdx] = "Clientes potenciales";
const mixedRowB = [...buildFixture("x").rows[0]];
mixedRowB[indicatorColumnIdx] = "Compras";
const mixedTable: RawTable = { headers: REAL_META_HEADERS, rows: [mixedRowA, mixedRowB] };
assertEqual(resolveMetaResultsMapping(mixedTable).reason, "inconsistent_indicator", "an indicator that varies across rows in the same file is flagged, not arbitrarily resolved");

// No indicator column at all -> Resultados can't be interpreted.
const noIndicatorTable: RawTable = { headers: REAL_META_HEADERS.filter((h) => h !== "Indicador de resultado"), rows: [buildFixture("x").rows[0].filter((_, i) => REAL_META_HEADERS[i] !== "Indicador de resultado")] };
assertEqual(resolveMetaResultsMapping(noIndicatorTable).reason, "no_indicator_column", "with no 'Indicador de resultado' column at all, Resultados can't be interpreted");

// §5: no double-counting — the "(iniciales)"/"(inicial)" companions
// are always recognized-but-not-imported, regardless of how the
// PRIMARY Resultados/Indicador de resultado pair resolves.
assertEqual(byHeader("Resultados (iniciales)")?.state, "ignored", "'Resultados (iniciales)' is never imported (avoids double-counting the primary result)");
assertEqual(byHeader("Indicador de resultados (inicial)")?.state, "ignored", "'Indicador de resultados (inicial)' is never imported");
assertTrue(
  adjustedMappings.filter((m) => m.canonicalField === "conversions").length === 1,
  "exactly one column (the primary 'Resultados') ever maps to conversions — never both the primary and the initial snapshot"
);

// ---------------------------------------------------------------------
// §9: minimum manual work, zero unsafe guessing — end-to-end column
// counts for the real 18-header file, in the safe-indicator case.
// ---------------------------------------------------------------------
const mappedCount = adjustedMappings.filter((m) => m.state === "mapped").length;
const reviewCountCols = adjustedMappings.filter((m) => m.state === "needs_review").length;
const ignoredCountCols = adjustedMappings.filter((m) => m.state === "ignored").length;
assertEqual(adjustedMappings.length, 18, "all 18 real columns are accounted for");
assertEqual(reviewCountCols, 0, "with a safe result indicator, ZERO columns require manual review (down from the reported 12/18)");
assertEqual(mappedCount, 7, "7 columns are safely auto-mapped (start_date, end_date, platform, reach, impressions, ad_spend, and the dynamically-resolved Resultados->conversions)");
assertEqual(ignoredCountCols, 11, "11 columns are recognized-but-not-needed (derived metrics + context/identity fields), never requiring the user's attention");

// ---------------------------------------------------------------------
// Row-level: the mapped/injected fields actually reach
// normalizeAndValidateRow correctly (LATAM number parsing, taxonomy
// resolution) — a lightweight end-to-end sanity check, not a full
// duplicate of the Phase 16 suite's own number/date parsing coverage.
// ---------------------------------------------------------------------
const platforms = [{ internal_key: "meta_ads", display_label: "Meta Ads" }];
const objectives = [{ internal_key: "conversions", display_label: "Conversiones" }];
const verticals = [{ internal_key: "retail", display_label: "Retail" }];
const countries = [{ iso_code: "AR", display_label: "Argentina" }];
const mappedRows = applyMapping(table, adjustedMappings);
const normalized = normalizeAndValidateRow(2, { ...mappedRows[0], objective: "conversiones", vertical: "retail", country: "argentina" }, {
  platforms, objectives, verticals, countries, businessModels: [], audienceStrategies: [], funnelStages: [],
});
assertEqual(normalized.platform, "meta_ads", "the auto-mapped 'Plataforma' column resolves through the same real taxonomy matching every other field uses");
assertEqual(normalized.rawMetrics.reach, 120000, "'Alcance' value (120000) parses correctly into reach");
assertEqual(normalized.adSpend, 1500, "'Importe gastado (USD)' value (1500.00) parses correctly into ad_spend, currency suffix included");
assertEqual(normalized.startDate, "2026-08-01", "'Inicio del informe' parses into startDate");
assertEqual(normalized.endDate, "2026-08-31", "'Fin del informe' parses into endDate");
assertEqual(normalized.rawMetrics.conversions, 25, "the dynamically-resolved 'Resultados' value (25) parses correctly into conversions");

// ---------------------------------------------------------------------
// No regression to generic (non-Meta) CSV imports: an unrelated, truly
// unknown header set still detects as unknown and still needs_review,
// exactly as before this fix.
// ---------------------------------------------------------------------
const genericTable: RawTable = { headers: ["Some Custom Field", "Another One"], rows: [] };
assertEqual(detectExportPlatform(genericTable.headers).state, "unknown", "an unrelated generic file is still 'unknown', never mis-detected as Meta");
assertEqual(detectMapping(genericTable).every((m) => m.state === "needs_review"), true, "genuinely unknown columns in a non-Meta file still need review, unaffected by this fix");

console.log(`\ntest-real-meta-import: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
