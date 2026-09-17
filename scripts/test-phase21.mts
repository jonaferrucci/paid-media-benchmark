// Phase 21 tests — digital media catalog & placements. Real imports of
// the actual shipped modules only, no reimplementation.

import { digitalMediaCategories, isAdPlatformCategory, searchCatalogAcrossFields, platformsForCountry, formatsForCategory } from "../lib/media/filter";
import { resolveBrandAsset } from "../lib/media/brand";
import { detectCatalogMapping, applyCatalogMapping, validateCatalogRow, markCatalogDuplicates } from "../lib/media/importCatalog";
import { authorizeGovernanceAction } from "../lib/media/governanceRules";
import { buildOpportunities, hasCurrentCommercialOffer } from "../lib/planning/opportunity";
import type { RawTable } from "../lib/import/types";

let passed = 0;
let failed = 0;
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`);
  }
}
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

// --- digital category filter (item 6/7, still correct with the
// refined digital_publisher/streaming_live/podcast display labels) ---
const categories = [
  { id: "c-social", internal_key: "paid_social" },
  { id: "c-stream", internal_key: "streaming_live" },
  { id: "c-pub", internal_key: "digital_publisher" },
  { id: "c-pod", internal_key: "podcast" },
  { id: "c-tv", internal_key: "television" },
];
assertEqual(
  digitalMediaCategories(categories).map((c) => c.internal_key),
  ["paid_social", "streaming_live", "digital_publisher", "podcast"],
  "podcast (digital audio) stays digital-eligible; television stays excluded"
);

// --- platform vs media split (item 5) ---
assertTrue(isAdPlatformCategory("paid_social"), "paid_social is an ad-platform category");
assertTrue(!isAdPlatformCategory("podcast"), "podcast is media, not an ad platform");

// --- catalog search across name/category/country (item 23) ---
const searchPlatforms = [
  { id: "p1", internal_key: "perfil", display_label: "Perfil", media_category_id: "c-pub" },
  { id: "p2", internal_key: "olga", display_label: "OLGA", media_category_id: "c-stream" },
];
const searchCategories = [
  { id: "c-pub", internal_key: "digital_publisher", display_label: "Digital Publishers / Digital News" },
  { id: "c-stream", internal_key: "streaming_live", display_label: "Streaming / Social-Native Media" },
];
const searchCountries = [{ id: "co-ar", iso_code: "AR", display_label: "Argentina" }];
const searchPlatformCountries = [{ platform_id: "p1", country_id: "co-ar" }, { platform_id: "p2", country_id: "co-ar" }];
assertEqual(
  searchCatalogAcrossFields(searchPlatforms as never, searchCategories as never, searchCountries as never, searchPlatformCountries, "digital news").map((p) => p.id),
  ["p1"],
  "search matches by category label, not just outlet name"
);
assertEqual(
  searchCatalogAcrossFields(searchPlatforms as never, searchCategories as never, searchCountries as never, searchPlatformCountries, "argentina").map((p) => p.id),
  ["p1", "p2"],
  "search matches by country label"
);
assertEqual(
  searchCatalogAcrossFields(searchPlatforms as never, searchCategories as never, searchCountries as never, searchPlatformCountries, "olga").map((p) => p.id),
  ["p2"],
  "search still matches by outlet display name"
);

// --- Argentina country filtering / outlet-country relation (item 3/10) ---
const countryPlatforms = [
  { id: "p1", is_global: false },
  { id: "p2", is_global: false },
  { id: "p3", is_global: true },
];
assertEqual(
  platformsForCountry(countryPlatforms, searchPlatformCountries, "co-ar").map((p) => p.id),
  ["p1", "p2", "p3"],
  "AR-scoped outlets plus global platforms are returned for an AR filter"
);

// --- outlet/category relation, format/category applicability (item 4/10/11) ---
const formats = [
  { id: "f1", media_category_id: "c-social", internal_key: "reels" },
  { id: "f2", media_category_id: "c-pub", internal_key: "newsletter" },
];
assertEqual(formatsForCategory(formats, "c-social").map((f) => f.id), ["f1"], "new paid_social formats are scoped to their category");

// --- planner format filtering / no-fake-data fallback (item 11/26) ---
const combos = [{ platformId: "p1", propertyId: null, mediaFormatId: "f2" }];
const opportunitiesNoRateCard = buildOpportunities(combos, []);
assertEqual(opportunitiesNoRateCard.length, 1, "a combo with no rate card still surfaces as one opportunity for research");
assertTrue(opportunitiesNoRateCard[0].rateCardGroup === null, "no rate card group means null — never a fabricated price");
assertTrue(!hasCurrentCommercialOffer(opportunitiesNoRateCard[0]), "an opportunity with no rate card group is never treated as having a current offer");

// --- brand resolver / initials fallback (item 8/12) ---
assertEqual(resolveBrandAsset("meta_ads", true), { kind: "brand-icon" }, "a known brand icon takes precedence over initials");
assertEqual(resolveBrandAsset("perfil", false), { kind: "initials" }, "an outlet with no local asset and no brand icon falls back to initials");

// --- catalog import: alias mapping (item 13/15) ---
const catalogTable: RawTable = {
  headers: ["slug", "nombre", "pais", "categoria", "estado"],
  rows: [
    ["perfil", "Perfil", "AR", "digital_publisher", "active"],
    ["radio_nueva", "Radio Nueva", "ZZ", "unknown_category", "active"],
    ["olga", "OLGA", "AR", "streaming_live", "active"],
    ["olga", "OLGA", "AR", "streaming_live", "active"],
  ],
};
const catalogMapping = detectCatalogMapping(catalogTable);
assertEqual(
  catalogMapping.map((m) => m.field),
  ["media_outlet", "display_name", "country", "media_category", "status"],
  "ES header aliases (slug/nombre/pais/categoria/estado) map to the right canonical fields"
);

const knownCategories = [{ internal_key: "digital_publisher", display_label: "Digital Publishers / Digital News" }, { internal_key: "streaming_live", display_label: "Streaming / Social-Native Media" }];
const knownCountries = [{ iso_code: "AR", display_label: "Argentina" }];
const knownPlatforms = [{ internal_key: "olga", display_label: "OLGA" }];

const rawCatalogRows = applyCatalogMapping(catalogTable, catalogMapping);
const validated = rawCatalogRows.map((row) => validateCatalogRow(row, knownCategories, knownCountries, knownPlatforms));

// --- unknown country / unknown category rejection (item 15) ---
assertTrue(validated[1].status_ === "needs_review", "an unknown country AND unknown category sends the row to review");
assertTrue(validated[1].errors.includes("import.issue.unknownCountry"), "unknown country is reported specifically");
assertTrue(validated[1].errors.includes("import.issue.unknownMediaCategory"), "unknown category is reported specifically");

// --- create-vs-existing behavior (item 18/19) ---
assertTrue(validated[0].status_ === "valid", "a new, fully-resolvable outlet (Perfil) is ready to create");
assertTrue(validated[2].status_ === "existing", "an outlet whose slug already exists in the catalog is flagged existing, never silently re-created");

// --- duplicate row detection (item 18) ---
const withDuplicates = markCatalogDuplicates(validated);
assertTrue(withDuplicates[2].status_ === "existing", "the first OLGA row stays existing (it matches a real catalog row, duplicate-marking never overrides that)");

const freshDuplicateRows = markCatalogDuplicates([
  { rowNumber: 1, slug: "nuevo_medio", displayName: "Nuevo Medio", countryIso: "AR", mediaCategoryKey: "streaming_live", status: "pending", websiteDomain: null, status_: "valid", errors: [] },
  { rowNumber: 2, slug: "nuevo_medio", displayName: "Nuevo Medio", countryIso: "AR", mediaCategoryKey: "streaming_live", status: "pending", websiteDomain: null, status_: "valid", errors: [] },
]);
assertEqual(freshDuplicateRows.map((r) => r.status_), ["valid", "duplicate"], "the second occurrence of a brand-new slug within one file is flagged duplicate, the first stays valid");

// --- curator authorization helper (item 16) ---
assertEqual(authorizeGovernanceAction(false, false), { allowed: false, error: "not_authenticated" }, "a signed-out visitor can never import catalog rows");
assertEqual(authorizeGovernanceAction(true, false), { allowed: false, error: "not_authorized" }, "an authenticated non-curator can never import catalog rows");
assertEqual(authorizeGovernanceAction(true, true), { allowed: true }, "an authenticated curator is authorized");

console.log(`\n${failed === 0 ? "ALL" : `${failed} of ${passed + failed}`} PHASE 21 TESTS ${failed === 0 ? "PASSED" : "FAILED"} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exit(1);
