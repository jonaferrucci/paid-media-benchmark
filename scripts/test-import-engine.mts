// Phase 16 tests for the pure import engine — real imports of the
// actual shipped modules (not copies), since these are plain
// TypeScript files with no "use server"/framework dependency.

import { parseLatamAwareNumber, parseFlexibleDate, matchTaxonomyValue } from "../lib/import/normalize";
import { detectMapping, applyMapping, wouldConflict } from "../lib/import/mapping";
import { normalizeAndValidateRow, detectDuplicates } from "../lib/import/validate";
import { parseCsv } from "../lib/import/parse";
import type { RawTable } from "../lib/import/types";

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

// --- Number parsing: LATAM vs US formats -----------------------------
assertEqual(parseLatamAwareNumber("1.234,56"), { value: 1234.56, ambiguous: false }, "LATAM format 1.234,56 -> 1234.56");
assertEqual(parseLatamAwareNumber("1,234.56"), { value: 1234.56, ambiguous: false }, "US format 1,234.56 -> 1234.56");
assertEqual(parseLatamAwareNumber("4,5"), { value: 4.5, ambiguous: false }, "single comma, 1 trailing digit -> unambiguous decimal");
assertEqual(parseLatamAwareNumber("4.5"), { value: 4.5, ambiguous: false }, "single dot, 1 trailing digit -> unambiguous decimal");
assertTrue(parseLatamAwareNumber("1,234").ambiguous === true, "single comma with exactly 3 trailing digits is flagged ambiguous, not guessed");
assertTrue(parseLatamAwareNumber("1.234").ambiguous === true, "single dot with exactly 3 trailing digits is flagged ambiguous, not guessed");
assertEqual(parseLatamAwareNumber("1,234,567"), { value: 1234567, ambiguous: false }, "multiple commas -> unambiguous thousands separators");
assertEqual(parseLatamAwareNumber(""), { value: null, ambiguous: false }, "empty string -> null, not zero");
assertEqual(parseLatamAwareNumber("$1500000"), { value: 1500000, ambiguous: false }, "currency symbol stripped");
assertEqual(parseLatamAwareNumber("abc"), { value: null, ambiguous: false }, "non-numeric string -> null");

// --- Date parsing ------------------------------------------------------
assertEqual(parseFlexibleDate("2026-08-01"), { iso: "2026-08-01", ambiguous: false }, "ISO date passes through unambiguously");
assertEqual(parseFlexibleDate("25/08/2026"), { iso: "2026-08-25", ambiguous: false }, "day>12 unambiguously resolves as DD/MM/YYYY");
assertEqual(parseFlexibleDate("08/25/2026"), { iso: "2026-08-25", ambiguous: false }, "month>12 unambiguously resolves as MM/DD/YYYY");
assertTrue(parseFlexibleDate("03/04/2026").ambiguous === true, "both components <=12 (03/04) is flagged ambiguous, per Phase 16 item 17");
assertEqual(parseFlexibleDate("2026-13-01"), { iso: null, ambiguous: false }, "invalid month rejected, not silently accepted");
assertEqual(parseFlexibleDate(""), { iso: null, ambiguous: false }, "empty date string -> null");
assertEqual(parseFlexibleDate("not a date"), { iso: null, ambiguous: false }, "garbage string -> null, not a crash");

// --- Taxonomy fuzzy matching -------------------------------------------
const platforms = [{ internal_key: "meta_ads", display_label: "Meta Ads" }, { internal_key: "google_ads", display_label: "Google Ads" }];
assertEqual(matchTaxonomyValue("Meta Ads", platforms), "meta_ads", "exact label match");
assertEqual(matchTaxonomyValue("meta_ads", platforms), "meta_ads", "exact internal_key match");
assertEqual(matchTaxonomyValue("meta ads", platforms), "meta_ads", "case-insensitive match");
assertEqual(matchTaxonomyValue("Nonexistent Platform XYZ", platforms), null, "no match -> null, never a guess");

// --- Column detection / mapping ----------------------------------------
const table: RawTable = { headers: ["Plataforma", "Objetivo", "Inversión", "Impresiones", "Random Column"], rows: [["Meta Ads", "Traffic", "1500", "48000", "x"]] };
const detected = detectMapping(table);
assertEqual(detected[0].canonicalField, "platform", "Spanish header 'Plataforma' auto-detected as platform");
assertEqual(detected[2].canonicalField, "ad_spend", "Spanish header 'Inversión' auto-detected as ad_spend");
assertEqual(detected[3].canonicalField, "impressions", "Spanish header 'Impresiones' auto-detected as impressions");
assertEqual(detected[4].state, "needs_review", "unrecognized header left as needs_review, never guessed");

// Duplicate-mapping conflict detection
const dupTable: RawTable = { headers: ["Plataforma", "Canal"], rows: [["Meta", "Google"]] };
const dupDetected = detectMapping(dupTable);
assertEqual(dupDetected[0].canonicalField, "platform", "first alias match claims the canonical field");
assertEqual(dupDetected[1].state, "needs_review", "second column aliasing to the same canonical field is NOT auto-mapped (prevents silent duplicate mapping)");
assertTrue(wouldConflict(
  [{ sourceHeader: "a", sourceColumnIndex: 0, canonicalField: "platform", state: "mapped" }],
  1, "platform"
), "wouldConflict correctly detects a manual mapping that would duplicate an existing canonical field");

const applied = applyMapping(table, detected);
assertEqual(applied[0].platform, "Meta Ads", "applyMapping correctly pulls the raw cell value for a mapped column");
assertTrue(applied[0].vertical === undefined, "applyMapping never invents a value for an unmapped canonical field");

// --- CSV parsing ---------------------------------------------------------
const csvResult = parseCsv("Plataforma,Objetivo\nMeta Ads,Traffic\nGoogle Ads,Awareness\n");
assertTrue(csvResult.ok === true, "well-formed CSV parses successfully");
if (csvResult.ok) {
  assertEqual(csvResult.table.headers, ["Plataforma", "Objetivo"], "CSV headers parsed correctly");
  assertEqual(csvResult.table.rows.length, 2, "CSV data rows parsed correctly (header excluded)");
}
const semicolonCsv = parseCsv("Plataforma;Objetivo\nMeta Ads;Traffic\n");
assertTrue(semicolonCsv.ok === true, "semicolon-delimited CSV (common LATAM export) parses successfully");
if (semicolonCsv.ok) assertEqual(semicolonCsv.table.headers, ["Plataforma", "Objetivo"], "semicolon CSV headers detected correctly");

const emptyCsv = parseCsv("");
assertTrue(emptyCsv.ok === false && emptyCsv.errorKey === "empty_file", "empty CSV content produces a clear empty_file error, not a crash");

const blankRowCsv = parseCsv("Plataforma,Objetivo\nMeta Ads,Traffic\n,\nGoogle Ads,Awareness\n");
if (blankRowCsv.ok) assertEqual(blankRowCsv.table.rows.length, 2, "fully-blank row is silently skipped, not counted as data");

// --- Row validation: required fields, errors vs warnings ----------------
const taxonomies = {
  platforms: [{ internal_key: "meta_ads", display_label: "Meta Ads" }],
  objectives: [{ internal_key: "traffic", display_label: "Traffic" }],
  verticals: [{ internal_key: "beauty_personal_care", display_label: "Beauty & Personal Care" }],
  countries: [{ iso_code: "AR", display_label: "Argentina" }],
  businessModels: [], audienceStrategies: [], funnelStages: [],
};

const validRow = normalizeAndValidateRow(2, {
  platform: "Meta Ads", objective: "Traffic", vertical: "Beauty & Personal Care", country: "Argentina",
  start_date: "2026-08-01", end_date: "2026-08-31", ad_spend: "1500000", impressions: "4800000",
}, taxonomies);
assertEqual(validRow.status, "valid", "a fully well-formed row is marked valid");
assertEqual(validRow.platform, "meta_ads", "platform resolves to the real taxonomy internal_key, not the raw label");
assertEqual(validRow.adSpend, 1500000, "ad_spend numeric value parsed correctly");

const missingPlatformRow = normalizeAndValidateRow(3, {
  objective: "Traffic", vertical: "Beauty & Personal Care", country: "Argentina",
  start_date: "2026-08-01", end_date: "2026-08-31", ad_spend: "1500000",
}, taxonomies);
assertEqual(missingPlatformRow.status, "needs_review", "missing required platform marks the row needs_review, not silently dropped");
assertTrue(missingPlatformRow.issues.some((i) => i.field === "platform" && i.severity === "error"), "missing platform produces an ERROR-severity issue specifically");

const endBeforeStartRow = normalizeAndValidateRow(4, {
  platform: "Meta Ads", objective: "Traffic", vertical: "Beauty & Personal Care", country: "Argentina",
  start_date: "2026-08-31", end_date: "2026-08-01", ad_spend: "1000",
}, taxonomies);
assertTrue(endBeforeStartRow.issues.some((i) => i.messageKey === "import.issue.endBeforeStart"), "end date before start date is flagged as an error");

const unknownObjectiveRow = normalizeAndValidateRow(5, {
  platform: "Meta Ads", objective: "Nonexistent Objective XYZ", vertical: "Beauty & Personal Care", country: "Argentina",
  start_date: "2026-08-01", end_date: "2026-08-31", ad_spend: "1000",
}, taxonomies);
assertTrue(unknownObjectiveRow.issues.some((i) => i.field === "objective" && i.severity === "error"), "unrecognized REQUIRED taxonomy value (objective) is an error, not silently accepted");

// Optional field with unrecognized value is a WARNING, not an error —
// business_model is optional per REQUIRED_FIELDS/OPTIONAL_FIELDS.
const unknownOptionalRow = normalizeAndValidateRow(6, {
  platform: "Meta Ads", objective: "Traffic", vertical: "Beauty & Personal Care", country: "Argentina",
  start_date: "2026-08-01", end_date: "2026-08-31", ad_spend: "1000", business_model: "Nonexistent Model",
}, { ...taxonomies, businessModels: [{ internal_key: "ecommerce", display_label: "Ecommerce" }] });
assertTrue(unknownOptionalRow.issues.some((i) => i.field === "business_model" && i.severity === "warning"), "unrecognized OPTIONAL taxonomy value is a warning, not an error, and does not block the row");
assertEqual(unknownOptionalRow.status, "valid", "a row with only warning-level issues is still marked valid, per item 18");

// --- Duplicate detection within an import -------------------------------
const dupRows = detectDuplicates([validRow, { ...validRow, rowNumber: 7 }]);
assertEqual(dupRows[0].status, "valid", "first occurrence of a row stays valid");
assertEqual(dupRows[1].status, "duplicate", "second identical row is flagged duplicate, not silently deleted");
assertTrue(dupRows[1].issues.some((i) => i.messageKey === "import.issue.possibleDuplicate"), "duplicate row carries an explicit issue explaining why");

console.log(`\n${failed === 0 ? "ALL" : failed} PHASE 16 IMPORT ENGINE TESTS ${failed === 0 ? "PASSED" : "FAILED"} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exit(1);
