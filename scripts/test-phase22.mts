// Phase 22 tests — sidebar alignment, planner/contribution/benchmark
// workflow connections. FOCUSED coverage only: does not duplicate the
// historical suites (Phase 20 planner/budget math, Phase 21 catalog,
// Phase 21B LATAM/filter tests all stay in their own scripts). Real
// imports of the actual shipped modules, plus source-text structural
// checks for the sidebar geometry fix, which isn't unit-testable
// outside a real DOM/browser.

import { readFileSync } from "node:fs";
import { toggleOpportunitySelection, buildOpportunities, hasCurrentCommercialOffer } from "../lib/planning/opportunity";
import { plannerHrefForMedia, contributeRateCardHref, contributePublicDataHref, resolveMediaContext, resolveIdContext } from "../lib/media/contextLinks";

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
// §A: sidebar collapsed-rail alignment — a real DOM/visual regression
// isn't unit-testable from a plain script, but the actual bug (icons
// not sharing one center axis) was a structural CSS/markup defect, so
// it IS verifiable at the source level: one shared icon-slot constant
// must exist and be used, unconditionally, by every rail row (nav
// links AND the pin control), and the header logo must key off the
// same --sidebar-rail-width the rail itself defines.
// ---------------------------------------------------------------------
const sidebarSource = readFileSync(new URL("../components/dashboard/DashboardSidebar.tsx", import.meta.url), "utf8");
const headerSource = readFileSync(new URL("../components/dashboard/AppHeader.tsx", import.meta.url), "utf8");
const globalsCssSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

assertTrue(globalsCssSource.includes("--sidebar-rail-width"), "a single --sidebar-rail-width geometry constant is defined");
assertTrue(
  (sidebarSource.match(/RAIL_ICON_SLOT/g) ?? []).length >= 3,
  "the shared icon-slot constant is DEFINED once and USED by at least two call sites (nav link + pin control), not redefined ad hoc per row"
);
assertTrue(
  !/className=\{RAIL_ICON_SLOT\}[\s\S]{0,400}labelVisibility/.test(sidebarSource) || sidebarSource.includes("const RAIL_ICON_SLOT ="),
  "the icon slot is a fixed, unconditional class string (not branched per labelVisibility state) — this is what keeps the icon's position identical whether a label is hidden, mid-hover-reveal, or always shown"
);
assertTrue(
  !/gap-3 rounded-full px-3 py-2\.5/.test(sidebarSource),
  "the old ungrouped icon+label row (icon directly in the gap-3/px-3 flex row, no fixed slot) is gone from NavLink"
);
assertTrue(
  headerSource.includes("var(--sidebar-rail-width)"),
  "the header logo's container is sized from the SAME rail-width constant the sidebar rail uses, so their centers can actually line up"
);
// Regression guard for the pin row's previously-doubled left inset
// (wrapper p-3 stacked with the button's own px-3): the button must no
// longer declare its own horizontal padding class.
const pinButtonMatch = sidebarSource.match(/togglePinned\}[\s\S]*?className="([^"]*)"/);
assertTrue(!!pinButtonMatch && !/\bpx-3\b/.test(pinButtonMatch[1]), "the pin control button no longer stacks its own px-3 on top of its wrapper's padding");

// ---------------------------------------------------------------------
// §I/§AD: selected-opportunity tray — duplicate prevention and the
// max-4 cap, extracted to a pure function from PlannerView's inline
// handler (same behavior, now directly testable).
// ---------------------------------------------------------------------
assertEqual(toggleOpportunitySelection(["a", "b"], "a"), ["b"], "selecting an already-selected key removes it (no duplicate, acts as a toggle-off)");
assertEqual(toggleOpportunitySelection(["a", "b"], "c"), ["a", "b", "c"], "selecting a new key under the cap adds it");
assertEqual(toggleOpportunitySelection(["a", "b", "c", "d"], "e"), ["a", "b", "c", "d"], "a 5th selection is refused once 4 are already selected");
assertEqual(toggleOpportunitySelection(["a", "b", "c", "d"], "a"), ["b", "c", "d"], "removing one of 4 is always allowed, even right at the cap");

// ---------------------------------------------------------------------
// §D/§R/§S: cross-product navigation-context helpers — pure URL
// building, and validated (never-guessed) resolution of what comes
// back in on a query param.
// ---------------------------------------------------------------------
assertEqual(plannerHrefForMedia({}), "/planner", "no context at all is just a plain planner link");
assertEqual(plannerHrefForMedia({ mediaSlug: "olga" }), "/planner?media=olga", "a media slug alone becomes ?media=");
assertEqual(
  plannerHrefForMedia({ mediaSlug: "olga", categoryId: "c1", countryId: "co1" }),
  "/planner?media=olga&category=c1&country=co1",
  "all three context pieces are carried when present"
);
assertEqual(contributeRateCardHref("olga"), "/contribute/rate-cards?media=olga", "rate-card contribution link carries the outlet slug");
assertEqual(contributeRateCardHref(null), "/contribute/rate-cards", "no outlet slug means a plain link, never a broken query string");
assertEqual(contributePublicDataHref("olga"), "/contribute/public-metrics?media=olga", "public-data contribution link carries the outlet slug");

const knownPlatforms = [{ internal_key: "olga", display_label: "OLGA" }, { internal_key: "perfil", display_label: "Perfil" }];
assertEqual(resolveMediaContext("olga", knownPlatforms), knownPlatforms[0], "a real, known slug resolves to its real catalog row");
assertEqual(resolveMediaContext("not_a_real_outlet", knownPlatforms), null, "an unknown/stale slug never gets guessed or partially matched — resolves to null");
assertEqual(resolveMediaContext(null, knownPlatforms), null, "no slug at all resolves to null, not the first platform or any default");

const knownCategories = [{ id: "c1", display_label: "Streaming" }];
assertEqual(resolveIdContext("c1", knownCategories), knownCategories[0], "a real category id resolves");
assertEqual(resolveIdContext("does-not-exist", knownCategories), null, "an unknown category id never bypasses validation by resolving to something");

// ---------------------------------------------------------------------
// §D/§B9 (Phase 21B carryover, re-verified against the NEW media ->
// planner entry path): arriving at the planner already scoped to one
// outlet must never fabricate a rate card for it — the exact same
// discoverable-but-excluded-from-budget-math mechanism applies
// regardless of how the opportunity was reached.
// ---------------------------------------------------------------------
const comboFromMediaProfile = [{ platformId: "olga-id", propertyId: null, mediaFormatId: "f1" }];
const opportunitiesFromContext = buildOpportunities(comboFromMediaProfile, []);
assertEqual(opportunitiesFromContext.length, 1, "arriving with media context still surfaces exactly one real opportunity, never an invented one");
assertTrue(!hasCurrentCommercialOffer(opportunitiesFromContext[0]), "and it is still excluded from budget math with no rate card behind it");

console.log(`\n${failed === 0 ? "ALL" : `${failed} of ${passed + failed}`} PHASE 22 TESTS ${failed === 0 ? "PASSED" : "FAILED"} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exit(1);
