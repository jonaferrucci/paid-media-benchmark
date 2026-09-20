// POST-MVP MOBILE & RESPONSIVE PRODUCT EXPERIENCE PASS (§21).
//
// Focused contract tests for the responsive rework — mobile header
// control visibility, desktop-search-vs-mobile-trigger (one shared
// implementation, never a second search), the mobile nav trigger's new
// header position, the comparisons card's responsive structure, the
// mobile import review card, and the "no desktop sidebar inset on
// mobile" contract. None of these are real DOM/visual regressions
// (no React Testing Library / jsdom is set up in this project — see
// scripts/test-phase22.mts's own note), so, following that script's
// established pattern, this suite pairs real imports of exported pure
// logic (navGroupStructureFor) with source-text structural checks for
// what genuinely isn't unit-testable outside a real browser. Never a
// brittle pixel test — every check is about markup/class STRUCTURE
// (e.g. "the mobile trigger lives in AppHeader, not a floating button"),
// not exact pixel values.

import { readFileSync } from "node:fs";
import { navGroupStructureFor } from "../components/dashboard/DashboardSidebar";

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

const headerSource = readFileSync(new URL("../components/dashboard/AppHeader.tsx", import.meta.url), "utf8");
const sidebarSource = readFileSync(new URL("../components/dashboard/DashboardSidebar.tsx", import.meta.url), "utf8");
const accountMenuSource = readFileSync(new URL("../components/dashboard/AccountMenu.tsx", import.meta.url), "utf8");
const searchOverlaySource = readFileSync(new URL("../components/dashboard/SearchOverlay.tsx", import.meta.url), "utf8");
const comparisonsSource = readFileSync(new URL("../app/comparisons/SavedComparisonsList.tsx", import.meta.url), "utf8");
const contributeLandingSource = readFileSync(new URL("../app/contribute/ContributeLanding.tsx", import.meta.url), "utf8");
const entityCardSource = readFileSync(new URL("../components/ui/EntityCard.tsx", import.meta.url), "utf8");

// ---------------------------------------------------------------------
// §2/§20: mobile header control visibility. The full desktop search
// input must never render permanently below sm — only the icon trigger
// does, and it opens the SAME SearchOverlay every page already passes
// in via onSearchClick (never a second search implementation).
// ---------------------------------------------------------------------
assertTrue(
  headerSource.includes('aria-label={t("search.open")}'),
  "a labeled, icon-only search trigger exists in the header"
);
assertTrue(
  /className="hidden truncate text-left text-sm sm:inline">\{t\("search\.placeholder"\)\}/.test(headerSource),
  "the full search placeholder text is hidden below sm — only the icon shows at mobile widths"
);
assertTrue(
  // One button element serves BOTH the mobile icon-only trigger and the
  // sm+ full pill (via responsive classes) — never two separate search
  // buttons/implementations.
  (headerSource.match(/onClick=\{onSearchClick\}/g) ?? []).length === 1,
  "exactly one search trigger button exists — mobile and desktop share the same element via responsive classes, not two parallel implementations"
);
assertTrue(
  !/<input[\s\S]{0,80}search\.placeholder/.test(headerSource),
  "AppHeader itself renders no raw <input> for search — the real input still lives only in SearchOverlay"
);

// §2/§3: the mobile nav trigger and account control both live in the
// header now, and the account control collapses to avatar-only below sm.
assertTrue(
  headerSource.includes('aria-label={t("nav.openMenu")}') && headerSource.includes("useMobileNav"),
  "AppHeader owns the mobile nav trigger, driven by the shared MobileNavContext"
);
assertTrue(
  headerSource.includes("md:hidden") && /Menu size=\{18\}/.test(headerSource),
  "the header's menu trigger is hidden at md+ (desktop keeps the rail, no redundant trigger)"
);
assertTrue(
  accountMenuSource.includes('sm:h-auto sm:w-auto') && accountMenuSource.includes('className="hidden max-w-[100px] truncate sm:inline"'),
  "AccountMenu collapses to an avatar-only control below sm and reveals the name+chevron at sm+"
);

// ---------------------------------------------------------------------
// §3: the old floating bottom-right nav trigger is gone from
// DashboardSidebar — the sheet is now opened exclusively from the
// header. The sheet itself (contents, backdrop, close button) is
// otherwise unchanged.
// ---------------------------------------------------------------------
assertTrue(
  !/fixed bottom-4 right-4/.test(sidebarSource),
  "the old visually isolated floating mobile-nav button no longer exists in DashboardSidebar"
);
assertTrue(
  sidebarSource.includes("useMobileNav()") && sidebarSource.includes("mobileOpen"),
  "DashboardSidebar reads its open state from the shared MobileNavContext instead of owning private local state"
);
assertTrue(
  /role="dialog"[\s\S]{0,40}aria-modal="true"/.test(sidebarSource),
  "the mobile nav sheet keeps its dialog semantics"
);
assertTrue(
  sidebarSource.includes('e.key === "Escape"') && sidebarSource.includes("panelRef.current?.focus()"),
  "§18: Escape closes the sheet and opening it moves focus into the panel"
);
assertTrue(
  sidebarSource.includes('t("nav.preferences")') && sidebarSource.includes("signOutAction"),
  "§3: language/theme and sign-out are reachable from the mobile sheet, not lost when the header hides them below sm"
);

// §18: SearchOverlay also closes on Escape and is labeled as a dialog.
assertTrue(
  searchOverlaySource.includes('e.key === "Escape"') && searchOverlaySource.includes('role="dialog"'),
  "§18: the search overlay closes on Escape and carries dialog semantics"
);

// ---------------------------------------------------------------------
// §3: "Curación only when authorized" — a pure, translation-free
// function so this decision doesn't need a DOM or LanguageContext to
// verify. Never a security boundary on its own (the /curation route's
// own server-side gate is untouched by this task).
// ---------------------------------------------------------------------
const groupsForVisitor = navGroupStructureFor(false);
const groupsForCurator = navGroupStructureFor(true);
assertTrue(
  !groupsForVisitor.some((g) => g.groupKey === "nav.groupAdmin"),
  "a non-curator's nav structure never includes the Curación group"
);
assertTrue(
  groupsForCurator.some((g) => g.groupKey === "nav.groupAdmin"),
  "a curator's nav structure still includes the Curación group"
);
assertEqual(
  groupsForVisitor.filter((g) => g.groupKey !== "nav.groupAdmin"),
  groupsForCurator.filter((g) => g.groupKey !== "nav.groupAdmin"),
  "every OTHER nav group is identical regardless of curator status — only Curación's visibility changes"
);

// ---------------------------------------------------------------------
// §4/§19: "no desktop sidebar inset on mobile" contract — the reserved
// content padding must only ever apply behind the md: breakpoint, never
// unprefixed (which would reserve rail space even where no rail
// renders).
// ---------------------------------------------------------------------
const shellFiles = [
  "../app/page.tsx",
  "../app/benchmark/BenchmarkExplorer.tsx",
  "../app/planner/PlannerView.tsx",
  "../app/comparisons/SavedComparisonsList.tsx",
  "../app/contribute/ContributeLanding.tsx",
  "../app/platforms/MediaCatalogView.tsx",
  "../app/media/[slug]/MediaProfileView.tsx",
  "../app/account/page.tsx",
  "../components/dashboard/PlaceholderPage.tsx",
];
for (const rel of shellFiles) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  assertTrue(
    !/[^d]pl-\[var\(--sidebar-inset\)\]/.test(src) || /md:pl-\[var\(--sidebar-inset\)\]/.test(src),
    `${rel}: the sidebar-inset padding is only ever applied behind md: (never an unprefixed pl-[var(--sidebar-inset)] that would reserve rail space on mobile)`
  );
}

// ---------------------------------------------------------------------
// §5: the comparisons card. One shared interactive tree (never a
// duplicated mobile/desktop DOM, which would produce duplicate ids and
// duplicate autoFocus) reflowed with responsive classes; the title
// wraps instead of a single-line truncate below md.
// ---------------------------------------------------------------------
assertTrue(
  (comparisonsSource.match(/id={`rename-\$\{c\.id\}`}/g) ?? []).length === 1,
  "the comparisons card renders exactly ONE rename input per row (no duplicated mobile/desktop markup with a colliding id)"
);
assertTrue(
  comparisonsSource.includes("line-clamp-2") && comparisonsSource.includes("md:truncate"),
  "the comparison title wraps (line-clamp-2) below md and only truncates to one line at md+, where the dense layout returns"
);
assertTrue(
  !/truncate font-display text-\[15px\] font-semibold text-ink-900">\{c\.name\}/.test(comparisonsSource),
  "the title is never unconditionally truncated at every width (the old single-line-always truncate is gone)"
);
assertTrue(
  /h-11[^"]*flex-1[\s\S]{0,200}md:h-auto md:flex-none/.test(comparisonsSource),
  "the primary 'Abrir comparación' action gets a full ~44px touch target below md"
);

// ---------------------------------------------------------------------
// §9: the import review step's mobile campaign cards — a real
// alternative to the desktop table, not the table with squeezed
// columns, and gated by the SAME hasCampaignNames/
// showCampaignReviewColumns flags as the table beside it.
// ---------------------------------------------------------------------
assertTrue(
  contributeLandingSource.includes("md:hidden") && /normalizedRows\.map\(\(row, idx\) => \(\s*<div key=\{row\.rowNumber\}/.test(contributeLandingSource),
  "a mobile campaign-review card list (one <div> per row) exists alongside the desktop table"
);
assertTrue(
  /mt-4 hidden max-h-96[\s\S]{0,100}md:block/.test(contributeLandingSource),
  "the desktop review TABLE is hidden below md — it no longer renders unconditionally at every width"
);

// ---------------------------------------------------------------------
// §15/§20: a shared-primitive fix — EntityCard's title (used across the
// homepage, media catalog, planner, and benchmark platform selection)
// wraps instead of truncating to one line everywhere it's used.
// ---------------------------------------------------------------------
assertTrue(
  entityCardSource.includes('className="line-clamp-2 font-display text-sm font-semibold text-ink-900">{title}'),
  "EntityCard's primary title wraps (line-clamp-2) instead of a single-line truncate — fixes every card built from this shared component at once"
);

console.log(`test-mobile-responsive: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
