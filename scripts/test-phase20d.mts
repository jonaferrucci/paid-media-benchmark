// Phase 20D tests for the new pure catalog-scoping/classification logic
// (digital-only scope, ad-platform vs media split) — real imports of the
// actual shipped module, no reimplementation.

import { digitalMediaCategories, digitalMediaPlatforms, isAdPlatformCategory, splitPlatformsAndMedia } from "../lib/media/filter";

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

const categories = [
  { id: "c-social", internal_key: "paid_social" },
  { id: "c-search", internal_key: "search" },
  { id: "c-market", internal_key: "marketplace_ads" },
  { id: "c-prog", internal_key: "programmatic" },
  { id: "c-stream", internal_key: "streaming_live" },
  { id: "c-pub", internal_key: "digital_publisher" },
  { id: "c-tv", internal_key: "television" },
  { id: "c-radio", internal_key: "radio" },
  { id: "c-ooh", internal_key: "ooh" },
  { id: "c-dooh", internal_key: "dooh" },
  { id: "c-print", internal_key: "print" },
];

// --- item 6: digital-only scope ---------------------------------------
assertEqual(
  digitalMediaCategories(categories).map((c) => c.internal_key),
  ["paid_social", "search", "marketplace_ads", "programmatic", "streaming_live", "digital_publisher"],
  "excludes television/radio/ooh/dooh/print, keeps every digital category"
);

const platforms = [
  { id: "p-meta", media_category_id: "c-social" },
  { id: "p-olga", media_category_id: "c-stream" },
  { id: "p-tv-outlet", media_category_id: "c-tv" },
  { id: "p-radio-outlet", media_category_id: "c-radio" },
  { id: "p-uncategorized", media_category_id: null },
];
assertEqual(
  digitalMediaPlatforms(platforms, categories).map((p) => p.id),
  ["p-meta", "p-olga", "p-uncategorized"],
  "excludes platforms tagged to a non-digital category, keeps uncategorized ones"
);

// --- item 5/10/11: PLATAFORMAS vs MEDIOS split -------------------------
assertTrue(isAdPlatformCategory("paid_social"), "paid_social is an ad-platform category");
assertTrue(isAdPlatformCategory("search"), "search is an ad-platform category");
assertTrue(isAdPlatformCategory("marketplace_ads"), "marketplace_ads is an ad-platform category");
assertTrue(isAdPlatformCategory("programmatic"), "programmatic is an ad-platform category");
assertTrue(!isAdPlatformCategory("streaming_live"), "streaming_live is NOT an ad-platform category");
assertTrue(!isAdPlatformCategory("digital_publisher"), "digital_publisher is NOT an ad-platform category");
assertTrue(!isAdPlatformCategory(null), "null category is never classified as an ad platform");

const split = splitPlatformsAndMedia(
  [
    { id: "p-meta", media_category_id: "c-social" },
    { id: "p-google", media_category_id: "c-search" },
    { id: "p-olga", media_category_id: "c-stream" },
    { id: "p-infobae", media_category_id: "c-pub" },
    { id: "p-no-cat", media_category_id: null },
  ],
  categories
);
assertEqual(split.adPlatforms.map((p) => p.id), ["p-meta", "p-google"], "ad platforms bucketed correctly");
assertEqual(split.media.map((p) => p.id), ["p-olga", "p-infobae", "p-no-cat"], "media outlets (and uncategorized rows) bucketed correctly");

console.log(`\n${failed === 0 ? "ALL" : `${failed} of ${passed + failed}`} PHASE 20D TESTS ${failed === 0 ? "PASSED" : "FAILED"} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exit(1);
