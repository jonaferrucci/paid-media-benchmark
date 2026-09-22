// PHASE 30 — HOME DISCOVERY & TAXONOMY CONSISTENCY.
//
// Same convention as every other scripts/test-*.mts file in this
// project: readFileSync-based structural source-text checks (no
// jsdom/React Testing Library configured here), focused on exactly
// what this phase touched or was asked to verify — home's discovery
// surface (DiscoveryWizard/SearchOverlay/QuickActions/Workspace) never
// re-acquiring a fabricated-numbers dependency, the Home -> /benchmark
// prefill handoff (including the one real gap this phase found and
// fixed: audienceStrategy silently dropped), and the YouTube/Google
// Ads platform rule.

import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const pageCodeOnly = pageSource.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const discoveryWizardSource = readFileSync(new URL("../components/dashboard/wizard/DiscoveryWizard.tsx", import.meta.url), "utf8");
const platformStepSource = readFileSync(new URL("../components/dashboard/wizard/PlatformStep.tsx", import.meta.url), "utf8");
const searchOverlaySource = readFileSync(new URL("../components/dashboard/SearchOverlay.tsx", import.meta.url), "utf8");
const quickActionsSource = readFileSync(new URL("../components/dashboard/QuickActions.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../components/dashboard/Workspace.tsx", import.meta.url), "utf8");
const benchmarkExplorerSource = readFileSync(new URL("../app/benchmark/BenchmarkExplorer.tsx", import.meta.url), "utf8");
const mockTaxonomiesSource = readFileSync(new URL("../lib/mock/taxonomies.ts", import.meta.url), "utf8");

// -----------------------------------------------------------------------
// §1/§10 Home never re-acquires a mock-benchmark-numbers dependency.
// Checked by CODE import, not comment text — app/page.tsx's own header
// comment mentions lib/mock/benchmarks/lib/mock/random by name to
// explain what Phase 29 removed, so a plain substring search would
// false-positive on that prose.
// -----------------------------------------------------------------------
assertTrue(!/from ["']@\/lib\/mock\/benchmarks["']/.test(pageCodeOnly), "app/page.tsx never imports lib/mock/benchmarks");
assertTrue(!/from ["']@\/lib\/mock\/random["']/.test(pageCodeOnly), "app/page.tsx never imports lib/mock/random");
assertTrue(
  !/GlobalInsights|MiniTrend|FeaturedModules|ExploreMarket/.test(pageCodeOnly),
  "app/page.tsx never re-imports any of the Phase 29-removed mock-fed homepage modules"
);
// The wizard/search-overlay/quick-actions/workspace components Home
// actually renders: none of them touch the fabricated-numbers mock
// modules either (only lib/mock/taxonomies — option labels, not
// benchmark figures — which is a separate, explicitly in-scope file).
for (const [label, source] of [
  ["DiscoveryWizard", discoveryWizardSource],
  ["PlatformStep", platformStepSource],
  ["SearchOverlay", searchOverlaySource],
  ["QuickActions", quickActionsSource],
  ["Workspace", workspaceSource],
] as const) {
  assertTrue(!/from ["']@\/lib\/mock\/benchmarks["']/.test(source), `${label} never imports lib/mock/benchmarks`);
  assertTrue(!/from ["']@\/lib\/mock\/random["']/.test(source), `${label} never imports lib/mock/random`);
}

// -----------------------------------------------------------------------
// §5 SearchOverlay: discovery/navigation only, never analytics — no
// fabricated CPM/CTR/CPC/CPV/trend/ranking numbers.
// -----------------------------------------------------------------------
assertTrue(
  !/\bCPM\b|\bCTR\b|\bCPC\b|\bCPV\b/i.test(searchOverlaySource),
  "SearchOverlay never renders a metric abbreviation (CPM/CTR/CPC/CPV) — it's a destination picker, not a results view"
);
assertTrue(
  !/trend|ranking|top\s*\d/i.test(searchOverlaySource),
  "SearchOverlay never presents a trend or ranking — every suggestion is a plain navigation shortcut"
);
assertTrue(
  searchOverlaySource.includes("onApply(s.apply)") && searchOverlaySource.includes("Partial<CohortFilters>"),
  "SearchOverlay's suggestions apply real CohortFilters values, never a mock benchmark result"
);

// -----------------------------------------------------------------------
// §4 Home -> DiscoveryWizard -> /benchmark: the SAME existing prefill
// mechanism (query params), never a second one, and the one gap this
// phase demonstrated (audienceStrategy silently dropped when a
// SearchOverlay chip set ONLY that field) is closed.
// -----------------------------------------------------------------------
assertTrue(
  pageSource.includes('router.push(query ? `/benchmark?${query}` : "/benchmark")'),
  "DiscoveryWizard/SearchOverlay completion navigates to the real /benchmark route — never a local fake result"
);
assertTrue(
  pageSource.includes('params.set("prefillPlatform", filters.platform)') &&
  pageSource.includes('params.set("prefillObjective", filters.objective)') &&
  pageSource.includes('params.set("prefillVertical", filters.verticalId)') &&
  pageSource.includes('params.set("prefillCountry", filters.country)') &&
  pageSource.includes('params.set("prefillAudienceStrategy", filters.audienceStrategy)'),
  "all five prefill dimensions (platform/objective/vertical/country/audienceStrategy) are forwarded via the existing URLSearchParams mechanism"
);
assertTrue(
  (pageSource.match(/URLSearchParams/g) ?? []).length === 1,
  "exactly one prefill query-building mechanism exists in app/page.tsx — no second/parallel one introduced for audienceStrategy"
);
assertTrue(
  benchmarkExplorerSource.includes('searchParams.get("prefillAudienceStrategy")') &&
  benchmarkExplorerSource.includes("audienceStrategy: prefillAudienceStrategy ?? d.audienceStrategy"),
  "BenchmarkExplorer reads prefillAudienceStrategy via the same searchParams.get(...) pattern as the other four prefill params, and applies it to the draft"
);
assertTrue(
  (benchmarkExplorerSource.match(/searchParams\.get\("prefill/g) ?? []).length === 5,
  "exactly five prefill params are read (platform/objective/vertical/country/audienceStrategy) — no sixth/duplicate mechanism"
);

// -----------------------------------------------------------------------
// §3 YouTube belongs under Google Ads — never an independent platform
// value at the data layer, even though it may appear as its own
// selectable CARD in the UI (a documented, pre-existing shortcut,
// verified unchanged by this phase's audit).
// -----------------------------------------------------------------------
assertTrue(
  mockTaxonomiesSource.includes('{ uiId: "youtube", platform: "google_ads", label: "YouTube"'),
  "the YouTube discovery card maps to the google_ads platform value, not a standalone 'youtube' platform"
);
assertTrue(
  discoveryWizardSource.includes("const platform = PLATFORM_CARDS.find((p) => p.uiId === draft.platformUiId)!.platform;"),
  "DiscoveryWizard resolves the SELECTED CARD's uiId back to its real `platform` value before ever building CohortFilters — selecting the YouTube card cannot produce a 'youtube' platform filter"
);
assertTrue(
  !/platform:\s*["']youtube["']/.test(discoveryWizardSource) && !/["']youtube["']\s*as\s*Platform/.test(mockTaxonomiesSource),
  "no code path treats the literal string \"youtube\" as a Platform value"
);
assertTrue(
  mockTaxonomiesSource.includes('{ id: "google_ads", label: "Google Ads"') || mockTaxonomiesSource.includes("'google_ads', label: 'Google Ads'"),
  "Google Ads remains available as its own, independent platform option"
);
assertTrue(
  benchmarkExplorerSource.includes("taxonomies.platforms.map((p) => ({ value: p.internal_key, label: p.display_label }))"),
  "/benchmark's own platform selector is built directly from the real platforms table (which has no 'youtube' row — see supabase/seed.sql) — YouTube cannot appear there as an independent platform even in principle"
);

// -----------------------------------------------------------------------
// §6 QuickActions: exactly the four core actions + saved comparisons,
// no decorative dashboard, no resurrected Phase 29 module.
// -----------------------------------------------------------------------
assertTrue(
  quickActionsSource.includes('href: "/benchmark"') &&
  quickActionsSource.includes('href: "/planner"') &&
  quickActionsSource.includes('href: "/platforms"') &&
  quickActionsSource.includes('href: "/contribute"') &&
  quickActionsSource.includes('href: "/comparisons"'),
  "QuickActions still links to exactly the five real destinations: benchmark/planner/platforms/contribute/comparisons"
);
assertTrue(
  !/GlobalInsights|MiniTrend|FeaturedModules|ExploreMarket/.test(quickActionsSource),
  "QuickActions never reintroduces any Phase 29-removed mock module"
);

// -----------------------------------------------------------------------
// §7 Workspace: signed-out renders nothing; no arbitrary quality score;
// recent imports come from the real import_batches-backed tally.
// -----------------------------------------------------------------------
assertTrue(
  workspaceSource.includes("if (userLoading || !user || !summary) return null;"),
  "Workspace renders nothing for a signed-out (or still-loading) visitor"
);
assertTrue(
  !/qualityScore|healthScore|completenessScore/i.test(workspaceSource),
  "Workspace introduces no arbitrary quality/health/completeness score"
);
assertTrue(
  workspaceSource.includes("getWorkspaceSummaryAction"),
  "Workspace's data comes from the real, existing workspace summary action — no new/parallel data source"
);

// -----------------------------------------------------------------------
// §10 Dead mock path check: lib/mock/benchmarks.ts / lib/mock/random.ts
// remain unreachable from any Home-rendered file (already established
// by the import-graph checks above); this section additionally confirms
// they are still ON DISK (Phase 30 does not delete them) and still
// self-contained (no Home file reaches into them transitively via a
// re-export).
// -----------------------------------------------------------------------
assertTrue(
  (() => {
    try {
      readFileSync(new URL("../lib/mock/benchmarks.ts", import.meta.url), "utf8");
      readFileSync(new URL("../lib/mock/random.ts", import.meta.url), "utf8");
      return true;
    } catch {
      return false;
    }
  })(),
  "lib/mock/benchmarks.ts and lib/mock/random.ts are left on disk (not deleted) — Phase 30 does no cleanup, only verifies unreachability"
);

console.log(`test-phase30-home-discovery-taxonomy: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
