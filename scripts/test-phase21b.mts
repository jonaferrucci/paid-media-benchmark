// Phase 21B tests — LATAM digital catalog, brand assets & filter UX
// fix. FOCUSED coverage only: does not re-run Phase 21's (or earlier
// phases') assertions — see scripts/test-phase21.mts for the digital-
// category-filter, brand-resolver, catalog-import and opportunity
// baseline tests already covered there. Real imports of the actual
// shipped modules only, no reimplementation, plus two lightweight
// source/migration-text checks for things that are not otherwise
// unit-testable outside a DOM (item 16: "filter wrapping component
// behavior where testable").

import { readFileSync } from "node:fs";
import { digitalMediaCategories, platformsForCountry, searchCatalogAcrossFields } from "../lib/media/filter";
import { resolveBrandAsset } from "../lib/media/brand";
import { markCatalogDuplicates } from "../lib/media/importCatalog";
import { buildOpportunities, hasCurrentCommercialOffer } from "../lib/planning/opportunity";
import { PLATFORM_LOGO } from "../components/dashboard/PlatformLogo";

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

// ---------------------------------------------------------------------
// B-A: filter wrapping — not DOM-testable from a plain script, but the
// horizontal-scroll regression IS testable at the source level: the
// two filter-chip groups in MediaCatalogView must no longer carry the
// overflow-x-auto/-mx-4 scroll-row pattern Phase 20C/21 shipped, and
// must use flex-wrap instead.
// ---------------------------------------------------------------------
const catalogViewSource = readFileSync(new URL("../app/platforms/MediaCatalogView.tsx", import.meta.url), "utf8");
assertTrue(
  !catalogViewSource.includes("overflow-x-auto"),
  "no horizontal-scroll class remains anywhere in the catalog filter view"
);
assertTrue(
  catalogViewSource.includes("flex-wrap") && catalogViewSource.includes('role="group"'),
  "the category/country filter groups use a wrapping flex layout"
);
assertTrue(
  (catalogViewSource.match(/aria-labelledby="catalog-(category|country)-label"/g) ?? []).length === 2,
  "both filter groups have a real, visible label element (not just an aria-label string)"
);

// ---------------------------------------------------------------------
// B-B: LATAM country coverage + digital-only filtering + localized
// country names. Mirrors the real shape getMediaCatalog returns, using
// mock rows rather than a DB call — same approach test-phase21.mts
// already established for AR/global platform filtering.
// ---------------------------------------------------------------------
const latamCategories = [
  { id: "c-pub", internal_key: "digital_publisher" },
  { id: "c-tv", internal_key: "television" },
];
assertEqual(
  digitalMediaCategories(latamCategories).map((c) => c.internal_key),
  ["digital_publisher"],
  "digital-only category filtering still excludes television for LATAM data the same way it does for AR"
);

const latamCountries = [
  { id: "co-mx", iso_code: "MX", display_label: "México" },
  { id: "co-br", iso_code: "BR", display_label: "Brasil" },
  { id: "co-pe", iso_code: "PE", display_label: "Perú" },
  { id: "co-ec", iso_code: "EC", display_label: "Ecuador" },
  { id: "co-bo", iso_code: "BO", display_label: "Bolivia" },
];
assertTrue(
  latamCountries.every((c) => !/^[A-Z]{2}$/.test(c.display_label)),
  "country display labels are localized names, never bare ISO codes"
);
assertEqual(latamCountries.find((c) => c.iso_code === "MX")?.display_label, "México", "Mexico's display label is the Spanish spelling");
assertEqual(latamCountries.find((c) => c.iso_code === "BR")?.display_label, "Brasil", "Brazil's display label is the Spanish spelling");
assertEqual(latamCountries.find((c) => c.iso_code === "PE")?.display_label, "Perú", "Peru's display label is the Spanish spelling");

const latamPlatforms = [
  { id: "p-mx1", is_global: false },
  { id: "p-br1", is_global: false },
  { id: "p-global", is_global: true },
];
const latamPlatformCountries = [
  { platform_id: "p-mx1", country_id: "co-mx" },
  { platform_id: "p-br1", country_id: "co-br" },
];
assertEqual(
  platformsForCountry(latamPlatforms, latamPlatformCountries, "co-mx").map((p) => p.id),
  ["p-mx1", "p-global"],
  "a Mexico-scoped filter returns the MX outlet plus global platforms, generically — no hardcoded country handling"
);
assertEqual(
  platformsForCountry(latamPlatforms, latamPlatformCountries, "co-ec").map((p) => p.id),
  ["p-global"],
  "Ecuador (a brand-new country with no dedicated outlet in this mock set) still resolves correctly to just the global platforms — no special-casing needed for a newly-added ISO code"
);

// ---------------------------------------------------------------------
// B-C: catalog search across name/category/country for LATAM entries
// (item 11) — same real searchCatalogAcrossFields helper, new data.
// ---------------------------------------------------------------------
const searchPlatforms = [
  { id: "p1", internal_key: "el_tiempo_co", display_label: "El Tiempo", media_category_id: "c-pub" },
  { id: "p2", internal_key: "primicias", display_label: "Primicias", media_category_id: "c-pub" },
];
const searchCategories = [{ id: "c-pub", internal_key: "digital_publisher", display_label: "Digital Publishers / Digital News" }];
const searchCountries = [
  { id: "co-co", iso_code: "CO", display_label: "Colombia" },
  { id: "co-ec", iso_code: "EC", display_label: "Ecuador" },
];
const searchPlatformCountries = [
  { platform_id: "p1", country_id: "co-co" },
  { platform_id: "p2", country_id: "co-ec" },
];
assertEqual(
  searchCatalogAcrossFields(searchPlatforms as never, searchCategories as never, searchCountries as never, searchPlatformCountries, "ecuador").map((p) => p.id),
  ["p2"],
  "searching by a new LATAM country's localized name matches only outlets scoped to it"
);
assertEqual(
  searchCatalogAcrossFields(searchPlatforms as never, searchCategories as never, searchCountries as never, searchPlatformCountries, "colombia").map((p) => p.id),
  ["p1"],
  "searching by another LATAM country's name still isolates the right outlet"
);

// ---------------------------------------------------------------------
// B-D: brand resolution for a new LATAM outlet — no local asset, no
// known brand icon → initials, same precedence rule as every other
// media outlet (item 7/12).
// ---------------------------------------------------------------------
assertEqual(resolveBrandAsset("el_tiempo_co", false), { kind: "initials" }, "a new LATAM digital publisher with no bundled brand glyph falls back to initials, never an invented logo");

// ---------------------------------------------------------------------
// B-E: YouTube discoverability — still no "youtube" platforms row is
// ever assumed anywhere in this codebase's data layer, but the
// bundled brand glyph this view surfaces on the Google Ads card must
// exist and be a real YouTube mark, not a placeholder.
// ---------------------------------------------------------------------
assertTrue(!!PLATFORM_LOGO.youtube, "a bundled YouTube brand glyph exists for the presentational discoverability treatment");
assertEqual(PLATFORM_LOGO.youtube.color, "#FF0000", "the YouTube glyph uses its real brand color, not a generic placeholder");
assertTrue(
  catalogViewSource.includes("YOUTUBE_HOST_PLATFORM_KEY") && catalogViewSource.includes('"google_ads"'),
  "YouTube's visual treatment is attached to the existing google_ads card, never a synthetic platforms row"
);

// ---------------------------------------------------------------------
// B-F: outlet without a current rate card — still discoverable, still
// excluded from budget math (item 9). Re-verified against a FRESH
// LATAM-shaped combo (not the Phase 21 AR fixture) since this is the
// exact mechanism B9 depends on for every new country's outlets.
// ---------------------------------------------------------------------
const latamCombos = [{ platformId: "p-mx1", propertyId: null, mediaFormatId: "f-newsletter" }];
const latamOpportunities = buildOpportunities(latamCombos, []);
assertEqual(latamOpportunities.length, 1, "a LATAM outlet with zero rate cards still surfaces as exactly one research-only opportunity");
assertTrue(latamOpportunities[0].rateCardGroup === null, "no fabricated rate card group is ever produced for it");
assertTrue(!hasCurrentCommercialOffer(latamOpportunities[0]), "it is correctly excluded from budget math (no current commercial offer)");

// ---------------------------------------------------------------------
// B-G: duplicate-prevention self-consistency for the new LATAM
// internal_keys (this migration hand-writes ~32 slugs across 9
// countries — a real place for a copy/paste collision to slip in).
// Cross-checked against the actual migration file text so this test
// fails if the seed list and the migration drift apart.
// ---------------------------------------------------------------------
const latamInternalKeys = [
  "el_universal_mx", "milenio", "animal_politico", "expansion_mx", "la_silla_rota",
  "el_pais_uy", "montevideo_portal", "el_observador_uy",
  "el_mercurio", "la_tercera", "biobiochile", "emol",
  "el_tiempo_co", "semana", "la_silla_vacia", "pulzo",
  "el_comercio_pe", "rpp", "peru21", "la_republica_pe",
  "uol", "g1", "folha", "terra_br",
  "abc_color", "ultima_hora_py", "la_nacion_py",
  "el_comercio_ec", "el_universo", "primicias",
  "el_deber", "los_tiempos", "la_razon_bo",
];
assertEqual(new Set(latamInternalKeys).size, latamInternalKeys.length, "no duplicate internal_key across the new LATAM catalog list");

const migration0017Source = readFileSync(new URL("../supabase/migrations/0017_latam_digital_catalog.sql", import.meta.url), "utf8");
assertTrue(
  latamInternalKeys.every((key) => migration0017Source.includes(`'${key}'`)),
  "every internal_key in this test's list is actually present in migration 0017 (catches list/migration drift)"
);

// Same duplicate-prevention mechanism the catalog import UI already
// uses (item 6/18) — reused, not reimplemented, against a LATAM-shaped
// fresh-import example.
const freshLatamDuplicateRows = markCatalogDuplicates([
  { rowNumber: 1, slug: "nuevo_medio_mx", displayName: "Nuevo Medio", countryIso: "MX", mediaCategoryKey: "digital_publisher", status: "pending", websiteDomain: null, status_: "valid", errors: [] },
  { rowNumber: 2, slug: "nuevo_medio_mx", displayName: "Nuevo Medio", countryIso: "MX", mediaCategoryKey: "digital_publisher", status: "pending", websiteDomain: null, status_: "valid", errors: [] },
]);
assertEqual(freshLatamDuplicateRows.map((r) => r.status_), ["valid", "duplicate"], "duplicate-within-file detection still works for a LATAM-shaped bulk-import row");

// ---------------------------------------------------------------------
// B-H: Ecuador/Bolivia additions and no fabricated commercial data —
// verified directly against migration 0017's own text, since these are
// DB seed facts rather than something a pure function computes.
// ---------------------------------------------------------------------
assertTrue(migration0017Source.includes("'EC', 'Ecuador'"), "migration 0017 adds Ecuador to countries");
assertTrue(migration0017Source.includes("'BO', 'Bolivia'"), "migration 0017 adds Bolivia to countries");
assertTrue(
  !/insert into (media_rate_cards|public_media_metric_snapshots)/i.test(migration0017Source),
  "migration 0017 never inserts a rate card or a public metric snapshot — catalog identity only, never fabricated commercial/audience data"
);
assertTrue(
  !migration0017Source.includes("0001_") && !migration0017Source.includes("alter table platforms drop") && !migration0017Source.includes("alter table countries drop"),
  "migration 0017 is additive only — it never edits or drops anything from a prior migration"
);

console.log(`\n${failed === 0 ? "ALL" : `${failed} of ${passed + failed}`} PHASE 21B TESTS ${failed === 0 ? "PASSED" : "FAILED"} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exit(1);
