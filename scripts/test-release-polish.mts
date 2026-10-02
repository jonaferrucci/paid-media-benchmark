// CUCURUCHO — CROSS-SITE RELEASE POLISH / LIVE-AUDIT FIX PASS tests.
//
// Covers every area this pass touched: taxonomy label translation
// (Section 1), platform/media entity separation (Section 2), search
// suggestion chip wiring (Section 3), login error accessibility
// (Section 4), protected route consistency (Section 5), and a targeted
// extra mobile-shell check for the one page this pass touched that
// scripts/test-mobile-responsive.mts doesn't already cover (Section 6
// — the existing mobile-responsive suite is re-run unchanged alongside
// this one, never duplicated here).
//
// Same established convention as every other scripts/test-*.mts in
// this repo (see e.g. test-mobile-responsive.mts's own note): real
// imports of exported pure logic, paired with source-text structural
// checks for what genuinely isn't unit-testable without a real browser
// (no React Testing Library/jsdom set up in this project). Never a
// pixel test.

import { readFileSync } from "node:fs";
import { translateTaxonomyLabel } from "../lib/i18n/taxonomyLabels";
import { dictionaries } from "../lib/i18n/translations";
import { splitPlatformsAndMedia, isAdPlatformCategory } from "../lib/media/filter";
import { PROTECTED_PREFIXES } from "../lib/supabase/middleware";

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
// Section 1 — taxonomy localization: Spanish labels, English labels,
// no raw-English leakage in ES where a localized label exists, and the
// real display_label fallback for anything not (yet) in the dictionary.
// ---------------------------------------------------------------------

// Spanish: a sample covering every kind, including the exact 3 cases
// that were literal English strings sitting inside the ES dictionary
// itself (objectives.video_views/engagement, funnel.*) — the same bug
// class as a component reading raw display_label, just one layer
// higher up.
assertEqual(translateTaxonomyLabel("objective", "video_views", "Video Views", "es"), "Reproducciones de video", "ES objective video_views is translated, not the literal English seed value");
assertEqual(translateTaxonomyLabel("objective", "engagement", "Engagement", "es"), "Interacción", "ES objective engagement is translated, not the literal English seed value");
assertEqual(translateTaxonomyLabel("objective", "app", "App", "es"), "App", "ES objective app (a new taxonomy key) resolves");
assertEqual(translateTaxonomyLabel("vertical", "beauty_personal_care", "Beauty & Personal Care", "es"), "Belleza y cuidado personal", "ES vertical beauty_personal_care is translated");
assertEqual(translateTaxonomyLabel("audienceStrategy", "contextual", "Contextual", "es"), "Contextual", "ES audienceStrategy contextual (a new taxonomy key) resolves");
assertEqual(translateTaxonomyLabel("funnelStage", "prospecting", "Prospecting", "es"), "Prospección", "ES funnelStage prospecting is translated, not the literal English seed value");
assertEqual(translateTaxonomyLabel("businessModel", "ecommerce", "Ecommerce", "es"), "Ecommerce", "ES businessModel ecommerce resolves");
assertEqual(translateTaxonomyLabel("mediaCategory", "digital_publisher", "Digital Publishers / Digital News", "es"), "Editores digitales / Noticias digitales", "ES mediaCategory digital_publisher (the confirmed-live-buggy label) is translated");
assertEqual(translateTaxonomyLabel("mediaCategory", "streaming_live", "Streaming / Social-Native Media", "es"), "Streaming / medios nativos sociales", "ES mediaCategory streaming_live (the confirmed-live-buggy label) is translated");
assertEqual(translateTaxonomyLabel("mediaCategory", "podcast", "Podcast / Digital Audio", "es"), "Podcast / Audio digital", "ES mediaCategory podcast (the confirmed-live-buggy label) is translated");
assertEqual(translateTaxonomyLabel("country", "US", "United States", "es"), "Estados Unidos", "ES country US (a new taxonomy key) resolves");

// English: every kind resolves to the real English display_label value
// (the dictionary and the DB's own seed text should always agree for
// the English locale — this is the regression guard for that).
assertEqual(translateTaxonomyLabel("objective", "video_views", "Video Views", "en"), "Video Views", "EN objective video_views matches the real seed display_label");
assertEqual(translateTaxonomyLabel("vertical", "gaming", "Gaming", "en"), "Gaming", "EN vertical gaming matches the real seed display_label");
assertEqual(translateTaxonomyLabel("mediaCategory", "digital_publisher", "Digital Publishers / Digital News", "en"), "Digital Publishers / Digital News", "EN mediaCategory digital_publisher matches the real (post-migration-0016) seed display_label exactly");
assertEqual(translateTaxonomyLabel("country", "BO", "Bolivia", "en"), "Bolivia", "EN country BO matches the real seed display_label");

// Fallback: an internal_key the dictionary has never heard of (a future
// taxonomy row, or a locale/kind combination not yet covered) returns
// the real displayLabel unchanged — never a generic "humanized path"
// fallback, and never an empty string.
assertEqual(translateTaxonomyLabel("vertical", "some_future_vertical", "Some Future Vertical", "es"), "Some Future Vertical", "an unknown internal_key falls back to the real displayLabel, never a generic placeholder");
assertEqual(translateTaxonomyLabel("vertical", null, "Whatever Label", "es"), "Whatever Label", "a null internal_key (no real taxonomy row to key off of) falls back to the real displayLabel");

// No raw-English leakage: every ES dictionary block this pass added or
// extended must have exactly as many keys as its EN counterpart (the
// `typeof es` TypeScript constraint already enforces this at compile
// time — this is an independent runtime guard against it silently
// regressing, same "belt and suspenders" reasoning test-phase38's own
// i18n-key-retirement check uses).
const MIRRORED_BLOCKS = ["objectives", "verticals", "audiences", "funnel", "businessModels", "mediaCategories", "countries"] as const;
for (const block of MIRRORED_BLOCKS) {
  const esKeys = Object.keys(dictionaries.es[block]).sort();
  const enKeys = Object.keys(dictionaries.en[block]).sort();
  assertEqual(esKeys, enKeys, `dictionaries.es.${block} and dictionaries.en.${block} have the exact same key set`);
}

// Real-taxonomy completeness: every internal_key supabase/seed.sql (and
// 0017_latam_digital_catalog.sql for EC/BO) actually defines for these
// dimensions has a matching ES entry — never a dimension silently
// missing a subset of its real rows the way objectives/audiences/
// funnel/countries all were before this pass.
const REAL_OBJECTIVE_KEYS = ["awareness", "reach", "traffic", "video_views", "engagement", "leads", "sales", "app", "store_visits", "other"];
const REAL_VERTICAL_KEYS = [
  "beauty_personal_care", "fashion_apparel", "home_kitchen", "consumer_electronics", "automotive", "financial_services",
  "insurance", "education", "real_estate", "travel_tourism", "food_beverage", "health_wellness", "fitness", "b2b_services",
  "saas", "retail", "entertainment", "gaming", "telecommunications", "professional_services", "construction",
  "industrial_manufacturing", "agriculture", "pet_care", "baby_kids", "sports_outdoor", "jewelry_accessories", "marketplace", "other",
];
const REAL_AUDIENCE_STRATEGY_KEYS = ["broad", "interest_based", "lookalike", "remarketing", "customer_list", "contextual", "keyword_based", "automated_algorithmic", "mixed", "other", "unknown"];
const REAL_FUNNEL_STAGE_KEYS = ["prospecting", "consideration", "remarketing", "retention", "mixed", "other", "unknown"];
const REAL_BUSINESS_MODEL_KEYS = ["ecommerce", "marketplace_seller", "lead_generation", "retail", "b2b", "saas", "app", "subscription", "services", "local_business", "omnichannel", "other", "unknown"];
const REAL_COUNTRY_CODES = ["AR", "MX", "UY", "BR", "CL", "CO", "PE", "PY", "US", "ES", "EC", "BO"];
// Digital-only (lib/media/filter.ts excludes print/television/radio/ooh/dooh from every surface this pass touches).
const REAL_DIGITAL_MEDIA_CATEGORY_KEYS = ["paid_social", "search", "marketplace_ads", "online_video", "streaming_live", "digital_publisher", "podcast", "programmatic", "other"];

assertEqual(Object.keys(dictionaries.es.objectives).sort(), [...REAL_OBJECTIVE_KEYS].sort(), "ES objectives dictionary covers every real objectives.internal_key row (10/10)");
assertEqual(Object.keys(dictionaries.es.verticals).sort(), [...REAL_VERTICAL_KEYS].sort(), "ES verticals dictionary covers every real verticals.internal_key row (29/29)");
assertEqual(Object.keys(dictionaries.es.audiences).sort(), [...REAL_AUDIENCE_STRATEGY_KEYS].sort(), "ES audiences dictionary covers every real audience_strategies.internal_key row (11/11)");
assertEqual(Object.keys(dictionaries.es.funnel).sort(), [...REAL_FUNNEL_STAGE_KEYS].sort(), "ES funnel dictionary covers every real funnel_stages.internal_key row (7/7)");
assertEqual(Object.keys(dictionaries.es.businessModels).sort(), [...REAL_BUSINESS_MODEL_KEYS].sort(), "ES businessModels dictionary covers every real business_models.internal_key row (13/13)");
assertEqual(Object.keys(dictionaries.es.countries).sort(), [...REAL_COUNTRY_CODES].sort(), "ES countries dictionary covers every real countries.iso_code row (12/12)");
assertEqual(Object.keys(dictionaries.es.mediaCategories).sort(), [...REAL_DIGITAL_MEDIA_CATEGORY_KEYS].sort(), "ES mediaCategories dictionary covers every real digital media_categories.internal_key row (9/9)");

// Every surface Section 1 named ("at least Benchmark, Coverage, Media
// Catalog, Media Profile") plus Planner and the Home wizard's Vertical
// step actually imports and uses the shared helper — never a
// page-specific hardcoded translation reimplementing this logic.
const SECTION1_SURFACES = [
  "app/benchmark/CampaignExplorer.tsx",
  "app/benchmark/BenchmarkExplorer.tsx",
  "app/coverage/CoverageExplorer.tsx",
  "app/platforms/MediaCatalogView.tsx",
  "app/media/[slug]/MediaProfileView.tsx",
  "app/planner/PlannerView.tsx",
  "components/dashboard/wizard/VerticalStep.tsx",
  "components/dashboard/wizard/DiscoveryWizard.tsx",
];
for (const rel of SECTION1_SURFACES) {
  const src = read(rel);
  assertTrue(
    src.includes('from "@/lib/i18n/taxonomyLabels"') && src.includes("translateTaxonomyLabel("),
    `${rel} resolves taxonomy labels through the shared lib/i18n/taxonomyLabels helper (never a second, page-specific translation)`
  );
}

// ---------------------------------------------------------------------
// Section 2 — platform vs. media entity separation.
// ---------------------------------------------------------------------

// splitPlatformsAndMedia/isAdPlatformCategory themselves, exercised
// directly with fixture rows shaped like the real schema (never a
// synthetic key that wouldn't exist for real) — confirms the already-
// correct, reused-unchanged helper still does the job this pass leans
// on it for in three more call sites.
const FIXTURE_CATEGORIES = [
  { id: "cat-paid-social", internal_key: "paid_social" },
  { id: "cat-digital-publisher", internal_key: "digital_publisher" },
];
const FIXTURE_PLATFORMS = [
  { id: "p-meta", internal_key: "meta_ads", media_category_id: "cat-paid-social" },
  { id: "p-outlet", internal_key: "some_news_site", media_category_id: "cat-digital-publisher" },
];
const split = splitPlatformsAndMedia(FIXTURE_PLATFORMS, FIXTURE_CATEGORIES);
assertEqual(split.adPlatforms.map((p) => p.internal_key), ["meta_ads"], "splitPlatformsAndMedia keeps real ad platforms in adPlatforms");
assertEqual(split.media.map((p) => p.internal_key), ["some_news_site"], "splitPlatformsAndMedia keeps individual media/outlets out of adPlatforms");
assertTrue(isAdPlatformCategory("paid_social") && isAdPlatformCategory("search") && isAdPlatformCategory("marketplace_ads") && isAdPlatformCategory("programmatic"), "every real ad-platform category key is recognized");
assertTrue(!isAdPlatformCategory("digital_publisher") && !isAdPlatformCategory("streaming_live") && !isAdPlatformCategory("podcast"), "media/outlet category keys are never misclassified as ad-platform categories");

// Benchmark (both tabs) and Coverage now build their "Plataforma"
// selector from a split, never from the raw, mixed taxonomies.platforms
// list — the exact live-confirmed bug (media outlets appearing inside
// a platform dropdown).
for (const rel of ["app/benchmark/CampaignExplorer.tsx", "app/benchmark/BenchmarkExplorer.tsx"]) {
  const src = read(rel);
  assertTrue(src.includes("splitPlatformsAndMedia(taxonomies.platforms, taxonomies.mediaCategories)"), `${rel} splits platforms vs. media before building its "Plataforma" selector`);
  assertTrue(/options=\{adPlatforms\.map/.test(src), `${rel}'s "Plataforma" Select options come from adPlatforms, not the raw mixed taxonomies.platforms list`);
}
const coverageSource = read("lib/benchmark/coverage.ts");
assertTrue(coverageSource.includes("splitPlatformsAndMedia(platforms.data"), "getCoverageTaxonomies() filters platforms through splitPlatformsAndMedia before returning them");
assertTrue(/platforms:\s*adPlatforms\.map/.test(coverageSource), "getCoverageTaxonomies() returns only adPlatforms as its platforms list");

// Media entities are explicitly NOT deleted — they remain available in
// every media-specific surface (Media Catalog's own "Medios" section,
// Planner's category/format filters, Media Profile).
const catalogSource = read("app/platforms/MediaCatalogView.tsx");
assertTrue(catalogSource.includes("media.length > 0") && catalogSource.includes('t("media.mediaSectionTitle")'), "Media Catalog still renders its dedicated media/outlets section (media entities stay available, never deleted)");
const plannerSource = read("app/planner/PlannerView.tsx");
assertTrue(plannerSource.includes("catalog.categories.map") && plannerSource.includes("formatsForFilter.map"), "Planner's category/format filters are untouched — media entities stay fully discoverable there");

// ---------------------------------------------------------------------
// Section 3 — search suggestion chips: ONE correct behavior (apply the
// suggestion — it always meant a Benchmark cohort filter, and the real
// wiring for that already existed in app/page.tsx), reused everywhere
// instead of each page's own `onApply={() => {}}` no-op. Keyboard
// accessibility comes for free — every chip is a native <button>,
// confirmed below.
// ---------------------------------------------------------------------

const prefillQuerySource = read("lib/benchmark/prefillQuery.ts");
assertTrue(prefillQuerySource.includes("export function benchmarkHrefForCohortFilters"), "the shared prefill-navigation helper exists");

const FIXED_SEARCH_OVERLAY_SURFACES = [
  "app/benchmark/BenchmarkExplorer.tsx",
  "app/coverage/CoverageExplorer.tsx",
  "app/platforms/MediaCatalogView.tsx",
  "app/planner/PlannerView.tsx",
  "app/media/[slug]/MediaProfileView.tsx",
  "components/dashboard/PlaceholderPage.tsx",
];
for (const rel of FIXED_SEARCH_OVERLAY_SURFACES) {
  const src = read(rel);
  assertTrue(!src.includes("onApply={() => {}}"), `${rel} no longer passes a no-op onApply to SearchOverlay`);
  assertTrue(src.includes("benchmarkHrefForCohortFilters"), `${rel} wires SearchOverlay's onApply through the shared benchmark-prefill navigation`);
}

// app/page.tsx is intentionally left untouched (several pre-existing
// scripts/test-phase3*.mts suites pin its exact source-level shape) —
// it already had the correct, real wiring before this pass and keeps
// its own independent (behaviorally identical) implementation rather
// than importing the new shared module.
const homeSource = read("app/page.tsx");
assertTrue(homeSource.includes("onApply={goToBenchmark}"), "app/page.tsx keeps its own already-correct onApply wiring, unchanged");

const searchOverlaySource = read("components/dashboard/SearchOverlay.tsx");
assertTrue(
  /filtered\.map\(\(s\) => \(\s*<button/.test(searchOverlaySource),
  "every suggestion chip is a native <button> — keyboard activation (Tab + Enter/Space) works with no extra wiring"
);
assertTrue(
  searchOverlaySource.includes("onApply(s.apply)") && searchOverlaySource.includes("onClose()"),
  "SearchOverlay's own chip handler is untouched — it already called onApply correctly; the bug was always in what callers passed it"
);

// ---------------------------------------------------------------------
// Section 4 — login error accessibility: role="alert", aria-describedby
// tying the error to its fields, aria-invalid, and focus moving to the
// error when one appears — never a change to what signInWithEmailAction
// (or the sign-up/forgot/reset equivalents) actually validates.
// ---------------------------------------------------------------------

const AUTH_FORM_PAGES: { rel: string; errorId: string }[] = [
  { rel: "app/auth/sign-in/page.tsx", errorId: "signin-error" },
  { rel: "app/auth/sign-up/page.tsx", errorId: "signup-error" },
  { rel: "app/auth/forgot-password/page.tsx", errorId: "forgot-password-error" },
  { rel: "app/auth/reset-password/page.tsx", errorId: "reset-password-error" },
];
for (const { rel, errorId } of AUTH_FORM_PAGES) {
  const src = read(rel);
  assertTrue(src.includes(`id="${errorId}"`) && src.includes('role="alert"'), `${rel}: the error message carries an id and role="alert" live-region semantics`);
  assertTrue(src.includes(`aria-describedby={state.error ? "${errorId}" : undefined}`), `${rel}: at least one input is associated with the error via aria-describedby`);
  assertTrue(src.includes("aria-invalid={state.error ? true : undefined}"), `${rel}: at least one input exposes aria-invalid when the submission failed`);
  assertTrue(src.includes("errorRef.current?.focus()"), `${rel}: focus moves to the error message when a new error appears`);
  assertTrue(src.includes("authErrors.$" + "{state.error}"), `${rel}: the real, existing error copy is preserved (no new/invented error strings)`);
}

// ---------------------------------------------------------------------
// Section 5 — protected route consistency: ONE rule for every
// user-specific workspace ("unauthenticated redirects to login with a
// return destination"), never a permissions/RLS change.
// ---------------------------------------------------------------------

assertEqual(PROTECTED_PREFIXES, ["/account", "/contribute", "/comparisons", "/curation"], "middleware redirects every user-specific workspace to login when signed out — /comparisons and /curation now join /account and /contribute");

const curationPageSource = read("app/curation/page.tsx");
assertTrue(
  curationPageSource.includes("getCurrentProfileIsCurator()") && curationPageSource.includes("if (!userId || !isCurator)"),
  "Curation's own server-side curator check is completely untouched — middleware only ever handles the plain signed-out case, never role/permission logic (no RLS/permission change)"
);

// ---------------------------------------------------------------------
// Section 6 — mobile regression: scripts/test-mobile-responsive.mts is
// re-run unchanged as part of this pass's full regression (Section 9/
// 10) and is the real source of truth for every shell file it already
// covers. CoverageExplorer.tsx is the one page this pass touched that
// isn't in that suite's own shellFiles list — this is the one targeted
// addition, not a duplicate of what that suite already checks.
// ---------------------------------------------------------------------

const coverageExplorerSource = read("app/coverage/CoverageExplorer.tsx");
assertTrue(
  !/[^d]pl-\[var\(--sidebar-inset\)\]/.test(coverageExplorerSource) || /md:pl-\[var\(--sidebar-inset\)\]/.test(coverageExplorerSource),
  "CoverageExplorer.tsx: the sidebar-inset padding this pass touched (SearchOverlay/label edits only) is still only ever applied behind md: — no accidental mobile rail-space regression"
);

console.log(`test-release-polish: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
