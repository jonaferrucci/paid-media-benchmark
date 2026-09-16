// Phase 17 tests for the pure media catalog filtering/search logic —
// real imports of the actual shipped module.

import { platformsForCategory, platformsForCountry, formatsForCategory, metricsForCategory, searchCatalog, isKnownCatalogOutlet, latestSnapshotPerMetric, currentRateCards } from "../lib/media/filter";

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

const CAT_STREAMING = "cat-streaming";
const CAT_PUBLISHER = "cat-publisher";
const AR = "country-ar";
const MX = "country-mx";

const platforms = [
  { id: "p1", internal_key: "meta_ads", display_label: "Meta Ads", media_category_id: "cat-social", is_global: true, status: "active" as const, display_order: 1 },
  { id: "p2", internal_key: "luzu_tv", display_label: "Luzu TV", media_category_id: CAT_STREAMING, is_global: false, status: "active" as const, display_order: 2 },
  { id: "p3", internal_key: "olga", display_label: "OLGA", media_category_id: CAT_STREAMING, is_global: false, status: "active" as const, display_order: 3 },
  { id: "p4", internal_key: "infobae", display_label: "Infobae", media_category_id: CAT_PUBLISHER, is_global: false, status: "active" as const, display_order: 4 },
];
const platformCountries = [
  { platform_id: "p2", country_id: AR },
  { platform_id: "p3", country_id: AR },
  { platform_id: "p4", country_id: AR },
];

// --- Category filtering ---------------------------------------------
assertEqual(platformsForCategory(platforms, CAT_STREAMING).map((p) => p.id), ["p2", "p3"], "filters to only the streaming category");
assertEqual(platformsForCategory(platforms, null).length, 4, "null category returns everything unfiltered");

// --- Country filtering (existing global platform preservation) -------
const arResults = platformsForCountry(platforms, platformCountries, AR).map((p) => p.id);
assertTrue(arResults.includes("p1"), "global platform (Meta Ads) is available in Argentina even with no explicit join row");
assertTrue(arResults.includes("p2") && arResults.includes("p3") && arResults.includes("p4"), "AR-scoped outlets are correctly included for Argentina");

const mxResults = platformsForCountry(platforms, platformCountries, MX).map((p) => p.id);
assertTrue(mxResults.includes("p1"), "global platform still shows for a country with no local outlets seeded yet");
assertTrue(!mxResults.includes("p2"), "AR-only outlet (Luzu TV) correctly excluded from Mexico's filtered results");

// --- Format/metric applicability --------------------------------------
const formats = [
  { id: "f1", media_category_id: CAT_STREAMING, internal_key: "branded_integration", display_label: "Branded Integration", display_order: 1 },
  { id: "f2", media_category_id: CAT_PUBLISHER, internal_key: "display", display_label: "Display", display_order: 1 },
];
assertEqual(formatsForCategory(formats, CAT_STREAMING).map((f) => f.id), ["f1"], "formats correctly scoped to their category, never mixed across categories");

const categoryMetrics = [{ media_category_id: CAT_STREAMING, metric_id: "m1", required: true }];
const metrics = [{ id: "m1", internal_key: "ad_spend", display_label: "Spend" }];
const applicable = metricsForCategory(categoryMetrics, metrics, CAT_STREAMING);
assertEqual(applicable.length, 1, "metric applicability correctly resolves for a category");
assertTrue(applicable[0].required === true, "required flag preserved from the applicability join row");
assertEqual(metricsForCategory(categoryMetrics, metrics, CAT_PUBLISHER).length, 0, "a category with no applicability rows returns empty, never invented metrics");

// --- Search --------------------------------------------------------------
assertEqual(searchCatalog(platforms, "olga").map((p) => p.id), ["p3"], "case-insensitive exact substring search");
assertEqual(searchCatalog(platforms, "").length, 4, "empty query returns everything");
assertEqual(searchCatalog(platforms, "nonexistent xyz").length, 0, "no matches returns an empty array, not an error");

// --- Unknown/user-supplied outlet boundary (item 24/25) -----------------
assertTrue(isKnownCatalogOutlet(platforms, "OLGA"), "a real catalog entry is recognized regardless of case");
assertTrue(!isKnownCatalogOutlet(platforms, "Some Random Channel Nobody Verified"), "an arbitrary user-typed name is never treated as a known catalog outlet");

// --- Public metric snapshot history (item 16/39) -------------------------
const snapshots = [
  { metric_definition_id: "m-subs", value: 3420000, observed_at: "2026-09-01" },
  { metric_definition_id: "m-subs", value: 3300000, observed_at: "2026-08-01" }, // older, listed second (desc order assumed)
  { metric_definition_id: "m-views", value: 500000, observed_at: "2026-09-01" },
];
const latest = latestSnapshotPerMetric(snapshots);
assertEqual(latest.get("m-subs")?.value, 3420000, "latest snapshot per metric picks the most recent observation, not the first inserted");
assertEqual(latest.size, 2, "one latest entry per distinct metric, duplicates collapsed correctly");
assertTrue(snapshots.length === 3, "the ORIGINAL snapshot array is untouched (history is never mutated/deleted by taking a 'latest' view)");

// --- Rate card current vs superseded (item 20/21/23) ---------------------
const rateCards = [
  { id: "r1", status: "active", price: 2000 },
  { id: "r2", status: "superseded", price: 1500 },
  { id: "r3", status: "pending", price: 1800 },
];
assertEqual(currentRateCards(rateCards).map((r) => r.id), ["r1"], "only status=active rate cards are treated as the current price; superseded/pending never override it");
assertTrue(rateCards.some((r) => r.id === "r2"), "a superseded rate card row is preserved (history), not deleted");

console.log(`\n${failed === 0 ? "ALL" : failed} PHASE 17 MEDIA CATALOG TESTS ${failed === 0 ? "PASSED" : "FAILED"} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exit(1);
