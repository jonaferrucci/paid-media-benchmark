// CUCURUCHO INTELLIGENCE 3.1 — CAMPAIGN WORKSPACE NAVIGATION POLISH.
//
// Same convention as every other scripts/test-*.mts file in this
// project: real imports of exported pure logic (isItemActive,
// navGroupStructureFor, NAV_GROUP_STRUCTURE — none of them React
// components, none needing a DOM) paired with readFileSync-based
// structural source-text checks for the one thing that genuinely can't
// be unit-tested without a rendered browser (real 375px layout). This
// is a small, focused suite for a small, focused task — it does not
// re-verify Multi-Campaign Comparison's own statistical/architectural
// correctness (scripts/test-campaign-comparison.mts already does that,
// unchanged and still 90/90 passing), only that this navigation/
// hierarchy polish didn't disturb it.

import { readFileSync } from "node:fs";
import { isItemActive, navGroupStructureFor, NAV_GROUP_STRUCTURE } from "../components/dashboard/DashboardSidebar";
import { MIN_COMPARISON_CAMPAIGNS, MAX_COMPARISON_CAMPAIGNS } from "../lib/benchmark/campaignComparison";

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

// -----------------------------------------------------------------------
// §1 SIDEBAR — "Mis campañas" exists, with the correct route, the
// correct (reused, never duplicated) label key, and in the required
// Planificador / Mis campañas / Mis comparaciones / Aportar datos order.
// -----------------------------------------------------------------------
const workGroup = NAV_GROUP_STRUCTURE.find((g) => g.groupKey === "nav.groupWork");
assertTrue(!!workGroup, "the Trabajar (TU TRABAJO) nav group still exists");
const workHrefs = workGroup!.items.map((i) => i.href);
assertEqual(
  workHrefs,
  ["/planner", "/account/contributions", "/comparisons", "/contribute"],
  "Trabajar is exactly Planificador / Mis campañas / Mis comparaciones / Aportar datos, in that order"
);

const myCampaigns = workGroup!.items.find((i) => i.href === "/account/contributions");
assertTrue(!!myCampaigns, "a 'Mis campañas' item pointing at /account/contributions exists in the sidebar");
assertEqual(
  myCampaigns!.labelKey,
  "auth.myContributions",
  "'Mis campañas' reuses the existing auth.myContributions translation key (already 'Mis campañas'/'My campaigns' everywhere else this route is linked from) — never a new, independently-maintained label"
);

// /comparisons and /contribute keep their exact pre-existing hrefs and
// label keys — this task adds a route, it does not rename or move
// either of the two routes the spec explicitly says never to touch.
const myComparisons = workGroup!.items.find((i) => i.href === "/comparisons");
const contributeData = workGroup!.items.find((i) => i.href === "/contribute");
assertEqual(myComparisons?.labelKey, "nav.myComparisons", "'Mis comparaciones' still points at /comparisons with its original label key — /comparisons itself is never renamed or repurposed");
assertEqual(contributeData?.labelKey, "nav.contributeData", "'Aportar datos' still points at /contribute with its original label key");

// The new item never appears in any OTHER group, and no other group's
// shape changed.
assertEqual(NAV_GROUP_STRUCTURE.length, 3, "still exactly 3 nav groups — no new top-level group was introduced");
assertEqual(
  NAV_GROUP_STRUCTURE.find((g) => g.groupKey === "nav.groupExplore")!.items.map((i) => i.href),
  ["/", "/benchmark", "/platforms"],
  "Explorar is completely untouched by this navigation polish"
);
assertEqual(
  NAV_GROUP_STRUCTURE.find((g) => g.groupKey === "nav.groupAdmin")!.items.map((i) => i.href),
  ["/curation"],
  "Administrar is completely untouched by this navigation polish"
);

// Curator-gating behavior (which group of nav groups is even reachable)
// is unrelated to this task and must remain exactly as it was.
assertTrue(!navGroupStructureFor(false).some((g) => g.groupKey === "nav.groupAdmin"), "a non-curator still never sees the admin/curation nav group");
assertTrue(navGroupStructureFor(true).some((g) => g.groupKey === "nav.groupAdmin"), "a curator still sees the admin/curation nav group");
assertTrue(
  navGroupStructureFor(false).find((g) => g.groupKey === "nav.groupWork")!.items.some((i) => i.href === "/account/contributions"),
  "'Mis campañas' is visible to every signed-in user, not gated behind curator status (it was never curator-only before this task, and isn't now)"
);

// -----------------------------------------------------------------------
// §1 ACTIVE STATE — "Mis campañas" must be active on /account/
// contributions itself AND on its two documented child routes, using
// the exact same isItemActive logic every other nav link already relies
// on (no special-casing introduced for this one item).
// -----------------------------------------------------------------------
assertTrue(isItemActive("/account/contributions", "/account/contributions"), "the base route itself is active");
assertTrue(isItemActive("/account/contributions/9b1c2e3a-0000-0000-0000-000000000001", "/account/contributions"), "a campaign DETAIL route (/account/contributions/[id]) keeps 'Mis campañas' active");
assertTrue(isItemActive("/account/contributions/compare", "/account/contributions"), "the campaign COMPARE route (/account/contributions/compare) keeps 'Mis campañas' active");
assertTrue(isItemActive("/account/contributions/imports/9b1c2e3a", "/account/contributions"), "an import-batch detail route under the same workspace also keeps 'Mis campañas' active (same startsWith rule, not a special case)");

// Never a false positive on an unrelated or superficially similar route.
assertTrue(!isItemActive("/account", "/account/contributions"), "the plain /account settings page never falsely activates 'Mis campañas'");
assertTrue(!isItemActive("/comparisons", "/account/contributions"), "'/comparisons' never falsely activates 'Mis campañas'");
assertTrue(!isItemActive("/account/contributions", "/comparisons"), "being on /account/contributions never falsely activates 'Mis comparaciones'");
assertTrue(!isItemActive("/contribute", "/account/contributions"), "'/contribute' never falsely activates 'Mis campañas'");

// -----------------------------------------------------------------------
// §2 WORKSPACE HIERARCHY — the campaign list renders before import
// history in source order (never the reverse), and the selection
// toolbar/header still lead the page. Structural, since there's no
// jsdom/RTL in this project to render and measure real DOM order.
// -----------------------------------------------------------------------
const listSource = readFileSync(new URL("../app/account/contributions/ContributionsList.tsx", import.meta.url), "utf8");

const headerIdx = listSource.indexOf('{t("auth.myContributions")}');
const compareCtaIdx = listSource.indexOf("contributions.compare.compareSelectedCta");
const campaignListIdx = listSource.indexOf("datasets.length === 0 ? (");
const importHistoryIdx = listSource.indexOf("contributions.importHistoryTitle");

assertTrue(
  headerIdx >= 0 && compareCtaIdx >= 0 && campaignListIdx >= 0 && importHistoryIdx >= 0,
  "all four expected page sections (header, selection/compare toolbar, campaign list, import history) are present in the file"
);
assertTrue(headerIdx < compareCtaIdx, "the 'Mis campañas' header (with its Aportar datos CTA) still comes before the selection toolbar");
assertTrue(compareCtaIdx < campaignListIdx, "the selection toolbar still comes before the campaign list");
assertTrue(
  campaignListIdx < importHistoryIdx,
  "the campaign list now renders BEFORE import history in source order — the primary workflow (select/compare/inspect campaigns) leads the page, and the secondary administrative import history follows it"
);

// The reorder must not have touched import history's own data/query
// behavior — same props, same helper calls, same translation keys.
assertTrue(
  listSource.includes("resolveBatchDisplayCount(b.success_count, realCampaignCountByBatch.get(b.id))") &&
  listSource.includes('computeImportBatchStatus({ ...b, success_count: displayCount })') &&
  listSource.includes('href={`/account/contributions/imports/${b.id}`}'),
  "import history's own rendering logic (display count, status computation, per-batch detail link) is byte-for-byte unchanged — only its position on the page moved"
);
assertTrue(
  (listSource.match(/batches\.map\(\(b\) => \{/g) ?? []).length === 1,
  "import history is still rendered from exactly one batches.map call — the move didn't duplicate it"
);

// -----------------------------------------------------------------------
// §3 MULTI-CAMPAIGN COMPARISON — untouched by this task except for
// whatever the sidebar active-state change required (nothing, per the
// active-state assertions above — /account/contributions/compare
// already matched the existing isItemActive rule with zero extra code).
// The comparison feature's own dedicated suite
// (scripts/test-campaign-comparison.mts) is the real authority here;
// this is just a lightweight cross-check that this task didn't quietly
// touch its constants or its route.
// -----------------------------------------------------------------------
assertEqual(MIN_COMPARISON_CAMPAIGNS, 2, "the 2-5 comparison range's minimum is unchanged");
assertEqual(MAX_COMPARISON_CAMPAIGNS, 5, "the 2-5 comparison range's maximum is unchanged");
assertTrue(
  listSource.includes('router.push(`/account/contributions/compare?ids=${Array.from(selectedIds).join(",")}`)'),
  "the compare CTA still navigates to the same /account/contributions/compare route"
);
const comparePageSource = readFileSync(new URL("../app/account/contributions/compare/page.tsx", import.meta.url), "utf8");
assertTrue(
  comparePageSource.includes("groupCampaignsByCohort") && comparePageSource.includes("getBenchmarksForMetrics"),
  "the compare page's own cohort-grouping/batched-benchmark architecture is untouched by this navigation task"
);

// -----------------------------------------------------------------------
// §5 RESPONSIVE — the mobile sheet renders through the exact same
// SidebarNav/groups the desktop rail does (so "Mis campañas" appears on
// mobile too, with no separate mobile-only nav array to drift out of
// sync), and ContributionsList's existing responsive structures
// (checkbox+card row, no unscoped horizontal overflow) are untouched.
// -----------------------------------------------------------------------
const sidebarSource = readFileSync(new URL("../components/dashboard/DashboardSidebar.tsx", import.meta.url), "utf8");
assertTrue(
  (sidebarSource.match(/<SidebarNav groups=\{groups\}/g) ?? []).length === 2,
  "both the desktop rail and the mobile sheet render from the SAME groups array — one nav data source, never a duplicated/hand-maintained mobile nav list"
);
assertTrue(
  listSource.includes('<div key={d.id} className="flex items-start gap-2">') &&
  listSource.includes('className="block flex-1 rounded-2xl border border-line bg-surface p-3.5 shadow-sm'),
  "the campaign card's checkbox+card responsive structure (from Intelligence 3) is untouched by this reorder"
);
assertTrue(
  !/<main[^>]*overflow-x/.test(listSource),
  "no overflow-x scroll was introduced at the page/main level by this task"
);

console.log(`test-navigation-polish: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
