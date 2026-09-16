// Phase 17B tests — real imports of the shipped pure modules.

import { isValidObservedValue, isValidDateString, isValidRateCardRange, isValidCurrencyCode } from "../lib/media/validators";
import { buildCategoryTemplateHeaders } from "../lib/import/template";

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

// --- Metric/price value validation ---------------------------------
assertTrue(isValidObservedValue(3420000), "positive value accepted");
assertTrue(isValidObservedValue(0), "zero accepted (valid for some metrics)");
assertTrue(!isValidObservedValue(-5), "negative value rejected");
assertTrue(!isValidObservedValue(NaN), "NaN rejected");
assertTrue(!isValidObservedValue(Infinity), "Infinity rejected");

// --- Date validation --------------------------------------------------
assertTrue(isValidDateString("2026-09-16"), "well-formed ISO date accepted");
assertTrue(!isValidDateString("16/09/2026"), "non-ISO format rejected (contribution forms use native date inputs, always ISO)");
assertTrue(!isValidDateString(""), "empty string rejected");

// --- Rate card date range -----------------------------------------------
assertTrue(isValidRateCardRange("2026-01-01"), "no valid_to (open-ended) is valid");
assertTrue(isValidRateCardRange("2026-01-01", "2026-06-01"), "valid_to after valid_from is valid");
assertTrue(!isValidRateCardRange("2026-06-01", "2026-01-01"), "valid_to before valid_from is rejected");

// --- Currency -----------------------------------------------------------
assertTrue(isValidCurrencyCode("ARS"), "3-letter currency code accepted");
assertTrue(!isValidCurrencyCode("AR"), "2-letter code rejected");
assertTrue(!isValidCurrencyCode("ARGENTINE"), "full currency name rejected, not silently truncated");

// --- Category-aware templates (17B.2) -----------------------------------
const allHeaders = buildCategoryTemplateHeaders(null);
assertTrue(allHeaders.length > 10, "null applicability list returns the full canonical field set");

const streamingHeaders = buildCategoryTemplateHeaders(["impressions", "video_views"]);
assertTrue(streamingHeaders.includes("Impresiones"), "category-scoped template includes an applicable optional metric");
assertTrue(streamingHeaders.includes("Reproducciones de video"), "category-scoped template includes video_views for a video-relevant category");
assertTrue(!streamingHeaders.includes("Vistas de landing"), "category-scoped template excludes an irrelevant optional metric (landing_page_views) not in its applicability list");
assertTrue(streamingHeaders.includes("Plataforma"), "required fields are always present regardless of category applicability");

console.log(`\n${failed === 0 ? "ALL" : failed} PHASE 17B TESTS ${failed === 0 ? "PASSED" : "FAILED"} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exit(1);
