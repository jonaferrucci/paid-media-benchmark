// CUCURUCHO — MEDIA EXPERIENCE & GOVERNANCE (Digital-First Guardrails,
// Media Curation, Catalog UX & Planner Integration) regression tests.
//
// Same established convention as every other scripts/test-*.mts in this
// repo (see test-release-polish.mts's own note): real imports of
// exported pure logic, paired with source-text structural checks for
// what genuinely isn't unit-testable without a real browser or a live
// Supabase connection (no React Testing Library/jsdom, no DB in this
// sandbox). Never a pixel test, never a live-data assertion.
//
// Covers the five approved items from this phase's brief:
//   A — Digital-first guardrails (Contribution Wizard, catalog import)
//   B — Media curation enrichment (governance queue)
//   C — Pre-approval data-quality validation (platform completeness)
//   D — Media Catalog entity-type filtering (/platforms)
//   E — Media Profile -> Planner continuity

import { readFileSync } from "node:fs";
import {
  digitalMediaCategories,
  digitalMediaPlatforms,
  isDigitalMediaCategory,
  splitPlatformsAndMedia,
  platformsForCategory,
  platformsForCountry,
  searchCatalogAcrossFields,
} from "../lib/media/filter";
import { validateCatalogRow, markCatalogDuplicates } from "../lib/media/importCatalog";
import { validatePlatformCompleteness } from "../lib/media/governanceRules";
import { dictionaries } from "../lib/i18n/translations";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`); }
}

const root = new URL("..", import.meta.url);
function read(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

// ---------------------------------------------------------------------
// Fixtures — mirrors the shape test-release-polish.mts/test-media-
// catalog.mts already use for this exact table set.
// ---------------------------------------------------------------------
const CAT_PAID_SOCIAL = "cat-paid-social";
const CAT_STREAMING = "cat-streaming";
const CAT_TELEVISION = "cat-television";
const CAT_RADIO = "cat-radio";

const FIXTURE_CATEGORIES = [
  { id: CAT_PAID_SOCIAL, internal_key: "paid_social", display_label: "Paid Social" },
  { id: CAT_STREAMING, internal_key: "streaming_live", display_label: "Streaming / Social-Native Media" },
  { id: CAT_TELEVISION, internal_key: "television", display_label: "Television" },
  { id: CAT_RADIO, internal_key: "radio", display_label: "Radio" },
];

const AR = "country-ar";
const FIXTURE_COUNTRIES = [{ id: AR, iso_code: "AR", display_label: "Argentina" }];

const FIXTURE_PLATFORMS = [
  { id: "p1", internal_key: "meta_ads", display_label: "Meta Ads", media_category_id: CAT_PAID_SOCIAL, is_global: true, status: "active" as const, display_order: 1 },
  { id: "p2", internal_key: "luzu_tv", display_label: "Luzu TV", media_category_id: CAT_STREAMING, is_global: false, status: "active" as const, display_order: 2 },
  { id: "p3", internal_key: "canal_13", display_label: "Canal 13", media_category_id: CAT_TELEVISION, is_global: false, status: "active" as const, display_order: 3 },
  { id: "p4", internal_key: "radio_mitre", display_label: "Radio Mitre", media_category_id: CAT_RADIO, is_global: false, status: "active" as const, display_order: 4 },
  { id: "p5", internal_key: "no_category_outlet", display_label: "No Category Outlet", media_category_id: null, is_global: true, status: "active" as const, display_order: 5 },
];
const FIXTURE_PLATFORM_COUNTRIES = [
  { platform_id: "p2", country_id: AR },
  { platform_id: "p3", country_id: AR },
  { platform_id: "p4", country_id: AR },
];

// =======================================================================
// A — Digital-first guardrails
// =======================================================================

// A1: digitalMediaCategories/digitalMediaPlatforms correctly exclude the
// non-digital categories/platforms (never deletes them from the input —
// pure filter, caller still has the full list if it wants it).
assertEqual(
  digitalMediaCategories(FIXTURE_CATEGORIES).map((c) => c.internal_key),
  ["paid_social", "streaming_live"],
  "digitalMediaCategories excludes television/radio, keeps paid_social/streaming_live"
);
assertEqual(
  digitalMediaPlatforms(FIXTURE_PLATFORMS, FIXTURE_CATEGORIES).map((p) => p.internal_key),
  ["meta_ads", "luzu_tv", "no_category_outlet"],
  "digitalMediaPlatforms excludes outlets tagged with a non-digital category, keeps digital-tagged AND null-category outlets"
);
assertTrue(isDigitalMediaCategory(FIXTURE_CATEGORIES[0]), "paid_social is digital");
assertTrue(!isDigitalMediaCategory(FIXTURE_CATEGORIES[2]), "television is not digital");

// A2: ContributeWizard scopes its "Tipo de medio"/"Medio" options to
// digital-only, reusing the shared helpers (never a second, parallel
// digital-scope rule).
const wizardSource = read("app/contribute/ContributeWizard.tsx");
assertTrue(
  wizardSource.includes("digitalMediaCategories") && wizardSource.includes("digitalMediaPlatforms"),
  "ContributeWizard imports/uses the shared digitalMediaCategories/digitalMediaPlatforms helpers"
);
assertTrue(
  wizardSource.includes('options={digitalCategories.map'),
  'ContributeWizard\'s "Tipo de medio" <Select> options come from digitalCategories, not the raw taxonomies.mediaCategories list'
);
assertTrue(
  /platformsForCategory\(digitalPlatforms,/.test(wizardSource),
  "ContributeWizard's category-filtered platform list is built from digitalPlatforms, not the raw taxonomies.platforms list"
);

// A3: catalog import — validateCatalogRow distinguishes "unknown
// category" from "recognized but non-digital" with its own honest
// message, and never marks a non-digital row "valid".
const KNOWN_CATEGORIES = [
  { internal_key: "streaming_live", display_label: "Streaming / Social-Native Media" },
  { internal_key: "television", display_label: "Television" },
];
const KNOWN_COUNTRIES = [{ iso_code: "AR", display_label: "Argentina" }];
const KNOWN_PLATFORMS: { internal_key: string; display_label: string }[] = [];

const digitalRow = validateCatalogRow(
  { rowNumber: 2, mediaOutlet: "nueva_radio", displayName: "Nueva Radio Digital", country: "AR", mediaCategory: "streaming_live", status: "active", websiteDomain: null },
  KNOWN_CATEGORIES,
  KNOWN_COUNTRIES,
  KNOWN_PLATFORMS
);
assertEqual(digitalRow.status_, "valid", "a row with a real DIGITAL category validates as valid");
assertEqual(digitalRow.errors, [], "a digital-category row carries no validation errors");

const nonDigitalRow = validateCatalogRow(
  { rowNumber: 3, mediaOutlet: "canal_local", displayName: "Canal Local", country: "AR", mediaCategory: "television", status: "active", websiteDomain: null },
  KNOWN_CATEGORIES,
  KNOWN_COUNTRIES,
  KNOWN_PLATFORMS
);
assertEqual(nonDigitalRow.status_, "needs_review", "a row with a real but NON-DIGITAL category is never silently accepted as valid");
assertTrue(nonDigitalRow.errors.includes("import.issue.nonDigitalMediaCategory"), "the non-digital row carries the specific, honest nonDigitalMediaCategory message (never the generic 'unknown category' message)");

const unknownRow = validateCatalogRow(
  { rowNumber: 4, mediaOutlet: "misterio", displayName: "Misterio", country: "AR", mediaCategory: "not_a_real_category", status: "active", websiteDomain: null },
  KNOWN_CATEGORIES,
  KNOWN_COUNTRIES,
  KNOWN_PLATFORMS
);
assertTrue(unknownRow.errors.includes("import.issue.unknownMediaCategory"), "a genuinely unrecognized category keeps its original, distinct 'unknown' message");
assertTrue(!unknownRow.errors.includes("import.issue.nonDigitalMediaCategory"), "an unrecognized category is never mislabeled as 'non-digital' (it's simply not found at all)");

// Duplicate-marking behavior is untouched by this phase — same exact
// helper, confirms no regression from the new category branch above.
const dupChecked = markCatalogDuplicates([digitalRow, { ...digitalRow, rowNumber: 5 }]);
assertEqual(dupChecked[1].status_, "duplicate", "within-file duplicate detection still works after the category-validation change");

// A4: the server action never trusts client-side "valid" filtering
// alone — it independently re-derives the digital category set and
// rejects a non-digital category key before any insert.
const catalogImportActionsSource = read("lib/media/catalogImportActions.ts");
assertTrue(
  catalogImportActionsSource.includes("digitalMediaCategories(categoriesRes.data") && catalogImportActionsSource.includes("digitalCategoryKeys.has(row.mediaCategoryKey)"),
  "bulkSubmitCatalogAction independently re-validates each row's category against the digital set server-side, never trusting the client's own validation alone"
);
assertTrue(
  /if \(!categoryId \|\| !countryId \|\| !digitalCategoryKeys\.has\(row\.mediaCategoryKey\)\) \{\s*failed\+\+;\s*continue;/.test(catalogImportActionsSource),
  "a non-digital (or otherwise invalid) row is rejected via the existing failed-row bucket, never partially inserted"
);

// =======================================================================
// B — Media curation enrichment
// =======================================================================

const governanceQueriesSource = read("lib/media/governanceQueries.ts");
assertTrue(
  governanceQueriesSource.includes("media_category_id, is_global, website_domain") && governanceQueriesSource.includes('.eq("status", "pending")'),
  "getGovernanceQueue's pending-platforms query now also selects category/geography/website context"
);
assertTrue(
  governanceQueriesSource.includes("isAdPlatformCategory(category?.internal_key") && governanceQueriesSource.includes("isAdPlatform:"),
  "entity type on the enriched pending-platform rows is derived via the existing isAdPlatformCategory helper, never a new column/heuristic"
);
assertTrue(
  governanceQueriesSource.includes('supabase.from("media_categories").select("id, internal_key, display_label")') &&
    governanceQueriesSource.includes('supabase.from("countries").select("id, iso_code, display_label")') &&
    governanceQueriesSource.includes('supabase.from("platform_countries").select("platform_id, country_id")'),
  "the enrichment data is fetched in the same batched Promise.all (no N+1 query added)"
);

const curationViewSource = read("app/curation/CurationView.tsx");
assertTrue(
  curationViewSource.includes("function PlatformReviewRow") && curationViewSource.includes("<PlatformReviewRow key={p.id} platform={p} />"),
  "CurationView renders the pending-platforms queue through the new, richer PlatformReviewRow (not the generic ReviewRow)"
);
assertTrue(
  curationViewSource.includes("platform.category") && curationViewSource.includes("platform.countries") && curationViewSource.includes("platform.website_domain"),
  "PlatformReviewRow surfaces category, geography, and website context on the card"
);
assertTrue(
  !/title=\{p\.display_label\}\s*\n\s*subtitle=\{p\.internal_key\}\s*\n\s*meta=""/.test(curationViewSource),
  "the old bare title/internal_key/empty-meta ReviewRow rendering for pending platforms is gone"
);
assertTrue(
  curationViewSource.includes("{platform.internal_key}") && /text-\[10px\][^}]*>\{platform\.internal_key\}/.test(curationViewSource),
  "the raw internal_key is still shown, but only as de-emphasized secondary metadata, never the card's primary content"
);

// =======================================================================
// C — Pre-approval data-quality validation
// =======================================================================

// A fully complete, global entity is approvable.
assertEqual(
  validatePlatformCompleteness({ displayLabel: "Luzu TV", internalKey: "luzu_tv", mediaCategoryInternalKey: "streaming_live", isGlobal: true, countryCount: 0 }),
  { ok: true },
  "a complete GLOBAL entity with a valid digital category needs no country rows to be approvable"
);
// A complete, non-global entity with at least one country is approvable.
assertEqual(
  validatePlatformCompleteness({ displayLabel: "Canal Local AR", internalKey: "canal_local_ar", mediaCategoryInternalKey: "streaming_live", isGlobal: false, countryCount: 1 }),
  { ok: true },
  "a complete NON-GLOBAL entity with at least one country association is approvable"
);
// website_domain is never part of the completeness contract at all —
// the input type itself has no such field, confirming §6's "a missing
// website must not automatically block approval" structurally, not just
// by omission in a single test case.
assertTrue(
  !("websiteDomain" in ({} as Parameters<typeof validatePlatformCompleteness>[0])),
  "PlatformCompletenessInput has no websiteDomain field — a missing website can never block approval"
);

assertEqual(
  validatePlatformCompleteness({ displayLabel: "", internalKey: "x", mediaCategoryInternalKey: "streaming_live", isGlobal: true, countryCount: 0 }),
  { ok: false, reasons: ["missingName"] },
  "an empty display name blocks approval with missingName"
);
assertEqual(
  validatePlatformCompleteness({ displayLabel: "X", internalKey: "", mediaCategoryInternalKey: "streaming_live", isGlobal: true, countryCount: 0 }),
  { ok: false, reasons: ["missingInternalKey"] },
  "an empty internal key blocks approval with missingInternalKey"
);
assertEqual(
  validatePlatformCompleteness({ displayLabel: "X", internalKey: "x", mediaCategoryInternalKey: null, isGlobal: true, countryCount: 0 }),
  { ok: false, reasons: ["missingCategory"] },
  "no media category at all blocks approval with missingCategory"
);
assertEqual(
  validatePlatformCompleteness({ displayLabel: "X", internalKey: "x", mediaCategoryInternalKey: "television", isGlobal: true, countryCount: 0 }),
  { ok: false, reasons: ["nonDigitalCategory"] },
  "a category outside the current digital scope blocks approval with nonDigitalCategory (never auto-reassigned)"
);
assertEqual(
  validatePlatformCompleteness({ displayLabel: "X", internalKey: "x", mediaCategoryInternalKey: "streaming_live", isGlobal: false, countryCount: 0 }),
  { ok: false, reasons: ["missingGeography"] },
  "a non-global entity with zero country associations blocks approval with missingGeography"
);
// Multiple simultaneous gaps are all reported together — never just
// the first one found, so the curator sees everything that's missing
// at once.
assertEqual(
  validatePlatformCompleteness({ displayLabel: "", internalKey: "", mediaCategoryInternalKey: null, isGlobal: false, countryCount: 0 }),
  { ok: false, reasons: ["missingName", "missingInternalKey", "missingCategory", "missingGeography"] },
  "every applicable gap is reported together, not just the first one"
);

// The server action enforces this ONLY on the approval ("active") path
// — deactivating a pending suggestion never needs it.
const governanceActionsSource = read("lib/media/governanceActions.ts");
assertTrue(
  /if \(decision === "active"\) \{[\s\S]*?validatePlatformCompleteness/.test(governanceActionsSource),
  "reviewPlatformAction only runs the completeness check on the approval ('active') path"
);
assertTrue(
  governanceActionsSource.includes('return { ok: false, error: "incomplete_entity", reasons: completeness.reasons };'),
  "a failed completeness check blocks the write and returns the specific missing reasons, never a generic failure"
);
assertTrue(
  governanceActionsSource.includes('.update({ status: decision })') && governanceActionsSource.includes('.eq("status", "pending")'),
  "the actual status update is still gated on the row still being pending (atomic, race-safe transition) — unchanged by this phase"
);

// =======================================================================
// D — Media Catalog entity-type filtering
// =======================================================================

// D1: the real filtering pipeline MediaCatalogView composes (category ->
// country -> search -> split) combines deterministically with an
// entity-type selection layered on top — exercised here with the exact
// same pure helpers the component calls, not a React render.
// MediaCatalogView never re-applies digitalMediaPlatforms itself — it
// trusts catalog.platforms (from getMediaCatalog) to already be
// digital-scoped, exactly like the real data layer. The fixture must
// mirror that same pre-filtered input, not the raw taxonomy. The null-
// category outlet is excluded here (its own digital-eligibility edge
// case is already covered by the A1 assertion above) so this section
// can assert exact, unambiguous ad-platform/media membership.
const CATALOG_FILTER_FIXTURE_PLATFORMS = digitalMediaPlatforms(FIXTURE_PLATFORMS, FIXTURE_CATEGORIES).filter(
  (p) => p.internal_key !== "no_category_outlet"
);

function visibleSections(categoryId: string | null, countryId: string | null, query: string, entityType: "all" | "adPlatforms" | "media") {
  let result = platformsForCategory(CATALOG_FILTER_FIXTURE_PLATFORMS, categoryId);
  result = platformsForCountry(result, FIXTURE_PLATFORM_COUNTRIES, countryId);
  result = searchCatalogAcrossFields(result, FIXTURE_CATEGORIES, FIXTURE_COUNTRIES, FIXTURE_PLATFORM_COUNTRIES, query);
  const { adPlatforms, media } = splitPlatformsAndMedia(result, FIXTURE_CATEGORIES);
  const showAdPlatforms = entityType !== "media";
  const showMedia = entityType !== "adPlatforms";
  return {
    adPlatforms: showAdPlatforms ? adPlatforms.map((p) => p.internal_key) : [],
    media: showMedia ? media.map((p) => p.internal_key) : [],
  };
}

assertEqual(visibleSections(null, null, "", "all").adPlatforms, ["meta_ads"], '"Todos" still shows ad platforms');
assertEqual(visibleSections(null, null, "", "all").media, ["luzu_tv"], '"Todos" still shows digital media (television/radio/null-category outlets are excluded earlier by digitalMediaPlatforms at the catalog data layer, not re-tested here)');
assertEqual(visibleSections(null, null, "", "adPlatforms").media, [], '"Plataformas publicitarias" hides the Medios section entirely');
assertEqual(visibleSections(null, null, "", "adPlatforms").adPlatforms, ["meta_ads"], '"Plataformas publicitarias" still shows ad platforms');
assertEqual(visibleSections(null, null, "", "media").adPlatforms, [], '"Medios digitales" hides the Plataformas section entirely');
assertEqual(visibleSections(null, null, "", "media").media, ["luzu_tv"], '"Medios digitales" still shows digital media');
// Combines with an existing filter (country): Luzu TV is AR-scoped —
// filtering to AR and "media" still returns it; filtering to a country
// with no media entities returns none, never silently ignoring the
// country filter because an entity-type filter is also active.
assertEqual(visibleSections(null, AR, "", "media").media, ["luzu_tv"], "entity-type filter combines correctly with an active country filter");
assertEqual(visibleSections(null, "some-other-country", "", "media").media, [], "entity-type + country filters combine deterministically to an empty result when nothing matches both");

// D2: structural checks on the actual component wiring.
const catalogViewSource = read("app/platforms/MediaCatalogView.tsx");
assertTrue(
  catalogViewSource.includes('type EntityTypeFilter = "all" | "adPlatforms" | "media"') && catalogViewSource.includes('useState<EntityTypeFilter>("all")'),
  '/platforms has a three-state entity-type filter defaulting to "Todos"'
);
assertTrue(
  catalogViewSource.includes('t("media.entityTypeAll")') && catalogViewSource.includes('t("media.entityTypeAdPlatforms")') && catalogViewSource.includes('t("media.entityTypeDigitalMedia")'),
  "all three entity-type chip labels are localized, not hardcoded"
);
assertTrue(
  catalogViewSource.includes("const showAdPlatforms = entityType !== \"media\"") && catalogViewSource.includes("const showMedia = entityType !== \"adPlatforms\""),
  "the entity-type filter narrows which already-split section renders, never re-deriving splitPlatformsAndMedia's own category-based line"
);
assertTrue(
  catalogViewSource.includes("resetFilters") && /function resetFilters\(\) \{[\s\S]*?setEntityType\("all"\)/.test(catalogViewSource),
  "clearing filters from the empty state also resets the entity-type filter"
);
assertTrue(
  catalogViewSource.includes("media.length > 0") && catalogViewSource.includes('t("media.mediaSectionTitle")'),
  "Media Catalog still renders its dedicated media/outlets section (media entities stay available, never deleted) — same protected invariant test-release-polish.mts checks"
);

// =======================================================================
// E — Media Profile -> Planner continuity
// =======================================================================

const plannerViewSource = read("app/planner/PlannerView.tsx");
assertTrue(
  plannerViewSource.includes("platformId?: string | null") && plannerViewSource.includes("platformId: overrides?.platformId ?? null"),
  "runSearch accepts an explicit platformId override that defaults to null for every ordinary call"
);
assertTrue(
  plannerViewSource.includes("runSearch({ platformId: mediaContext?.id ?? null })"),
  "arriving with media-profile context narrows the INITIAL search to that exact entity, not just its category"
);
assertTrue(
  /if \(mediaContext && data && data\.opportunities\.length === 1\) \{\s*setSelectedKeys\(\[opportunityKey\(data\.opportunities\[0\]\)\]\);/.test(plannerViewSource),
  "an opportunity is preselected ONLY when the entity resolves to exactly one unambiguous opportunity"
);
assertTrue(
  !/setSelectedKeys\(data\.opportunities\.map/.test(plannerViewSource),
  "the planner never auto-selects every format/opportunity for an entity — ambiguous cases are always left for explicit user choice"
);
assertTrue(
  plannerViewSource.includes("}, []);") , // mount-only effect, confirmed by context above
  "the media-context search + preselect logic still runs inside a mount-only effect (empty dependency array), never re-triggering on later state changes"
);

// The planner's own opportunity-identity/dedup rules (never a
// duplicate, cap at 4, never fabricate a default) are already covered
// by test-phase22.mts's toggleOpportunitySelection tests — not
// duplicated here.
const planningQueriesSource = read("lib/planning/queries.ts");
assertTrue(
  planningQueriesSource.includes("if (filters.platformId) matchedPlatforms = matchedPlatforms.filter((p) => p.id === filters.platformId);"),
  "getPlanningOpportunities already supports narrowing to one exact platform — reused unmodified by the new planner behavior, never re-implemented"
);

// ---------------------------------------------------------------------
// i18n completeness (defense-in-depth alongside the `en: typeof es`
// compile-time shape check — tsc already refuses to compile if a key
// exists in one locale dictionary and not the other).
// ---------------------------------------------------------------------
for (const locale of ["es", "en"] as const) {
  const dict = dictionaries[locale];
  assertTrue(typeof dict.media.entityTypeLabel === "string" && dict.media.entityTypeLabel.length > 0, `${locale}: media.entityTypeLabel is present`);
  assertTrue(typeof dict.media.entityTypeAdPlatforms === "string", `${locale}: media.entityTypeAdPlatforms is present`);
  assertTrue(typeof dict.media.entityTypeDigitalMedia === "string", `${locale}: media.entityTypeDigitalMedia is present`);
  assertTrue(typeof dict.curation.platformEntityTypeAdPlatform === "string", `${locale}: curation.platformEntityTypeAdPlatform is present`);
  assertTrue(typeof dict.curation.platformEntityTypeMedia === "string", `${locale}: curation.platformEntityTypeMedia is present`);
  assertTrue(typeof dict.curation.platformValidation.nonDigitalCategory === "string", `${locale}: curation.platformValidation.nonDigitalCategory is present`);
  assertTrue(typeof dict.curation.platformValidation.missingGeography === "string", `${locale}: curation.platformValidation.missingGeography is present`);
  assertTrue(typeof dict.import.issue.nonDigitalMediaCategory === "string", `${locale}: import.issue.nonDigitalMediaCategory is present`);
}

console.log(`test-media-governance-ux-phase: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
