// Phase 39 — Home Simplification, Production Integrity & Mobile UX.
//
// This phase adds no new features, touches no backend/Supabase/
// methodology: it reorders and trims the Home page so the Benchmark
// Finder is the one primary CTA, simplifies the Hero's copy, folds the
// wizard's Audience step into an optional "Afinar benchmark" panel
// (never removing it as a methodological dimension — only no longer
// forcing it before submission, matching how audienceStrategy already
// works as a plain optional filter on /benchmark itself), reduces
// QuickActions to 3 secondary tools, and fixes a real prefill-dropping
// gap (funnelStage/spendBand/durationBand silently lost between Home
// and /benchmark — the same class of bug Phase 30 fixed for
// audienceStrategy). Same convention as every other scripts/test-*.mts
// file: readFileSync-based structural source-text checks, real
// execution of pure functions where they exist, and a real
// git-diff-based check that protected files are untouched.

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { NAV_GROUP_STRUCTURE } from "../components/dashboard/DashboardSidebar";
import { PLATFORM_CARDS } from "../lib/mock/taxonomies";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

const root = new URL("..", import.meta.url);
function read(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

const pageSource = read("app/page.tsx");
const pageCodeOnly = pageSource.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const heroSource = read("components/dashboard/Hero.tsx");
const quickActionsSource = read("components/dashboard/QuickActions.tsx");
const workspaceSource = read("components/dashboard/Workspace.tsx");
const searchOverlaySource = read("components/dashboard/SearchOverlay.tsx");
const discoveryWizardSource = read("components/dashboard/wizard/DiscoveryWizard.tsx");
const contextStepSource = read("components/dashboard/wizard/ContextStep.tsx");
const platformStepSource = read("components/dashboard/wizard/PlatformStep.tsx");
const objectiveStepSource = read("components/dashboard/wizard/ObjectiveStep.tsx");
const verticalStepSource = read("components/dashboard/wizard/VerticalStep.tsx");
const countryStepSource = read("components/dashboard/wizard/CountryStep.tsx");
const breadcrumbSource = read("components/dashboard/wizard/WizardBreadcrumb.tsx");
const appHeaderSource = read("components/dashboard/AppHeader.tsx");
const translationsSource = read("lib/i18n/translations.ts");
const benchmarkExplorerSource = read("app/benchmark/BenchmarkExplorer.tsx");

// -----------------------------------------------------------------------
// 1/2. Production mock guard — Home never re-acquires a fabricated-
// numbers dependency. Real import statements only, never a blanket
// string match (app/page.tsx's own comments name these files by design).
// -----------------------------------------------------------------------
{
  assertTrue(!/from ["']@\/lib\/mock\/benchmarks["']/.test(pageCodeOnly), "app/page.tsx never imports lib/mock/benchmarks");
  assertTrue(!/from ["']@\/lib\/mock\/random["']/.test(pageCodeOnly), "app/page.tsx never imports lib/mock/random");

  let stdout = "";
  try {
    stdout = execSync(
      `grep -rlE "from [\\"']@/lib/mock/(benchmarks|random)[\\"']" app components --include="*.ts" --include="*.tsx" || true`,
      { cwd: new URL(".", root), encoding: "utf8" }
    );
  } catch {
    stdout = "ERROR";
  }
  const importers = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  assertEqual(importers, [], "no file under app/ or components/ imports lib/mock/benchmarks or lib/mock/random (Phase 39 production mock guard)");
}

// -----------------------------------------------------------------------
// 3. The Benchmark Finder is Home's one primary CTA — a distinct,
// visually heavier block directly under the Hero, above Workspace and
// QuickActions (not the other way around, as it was before this phase).
// -----------------------------------------------------------------------
{
  const heroIdx = pageCodeOnly.indexOf("<Hero");
  const finderIdx = pageCodeOnly.indexOf("<DiscoveryWizard");
  const workspaceIdx = pageCodeOnly.indexOf("<Workspace");
  const quickActionsIdx = pageCodeOnly.indexOf("<QuickActions");
  assertTrue(
    heroIdx !== -1 && finderIdx !== -1 && workspaceIdx !== -1 && quickActionsIdx !== -1,
    "Hero, the Finder, Workspace and QuickActions are all still rendered on Home"
  );
  assertTrue(
    heroIdx < finderIdx && finderIdx < workspaceIdx && workspaceIdx < quickActionsIdx,
    "render order is Hero -> Benchmark Finder -> Workspace -> QuickActions (the Finder is no longer buried below Workspace/QuickActions)"
  );
  assertTrue(
    pageCodeOnly.includes('{t("finder.title")}') && pageCodeOnly.includes("rounded-3xl border border-line bg-surface/60"),
    "the Finder has its own visually distinct heading/card, making it the page's protagonist block"
  );
}

// -----------------------------------------------------------------------
// 4/5. QuickActions: exactly the 3 secondary tools, no duplicate
// "Comparar benchmarks" CTA (the Finder above already owns that job),
// "Mis comparaciones" no longer a competing primary-looking CTA.
// -----------------------------------------------------------------------
{
  assertTrue(
    quickActionsSource.includes('href: "/contribute"') &&
    quickActionsSource.includes('href: "/platforms"') &&
    quickActionsSource.includes('href: "/planner"'),
    "QuickActions still links to its 3 secondary tools: Importar campaña, Explorar medios, Planificar"
  );
  assertTrue(
    !quickActionsSource.includes('href: "/benchmark"'),
    "QuickActions no longer duplicates a /benchmark card now that the Finder above is the primary CTA"
  );
  assertTrue(
    !quickActionsSource.includes('href: "/comparisons"'),
    "\"Mis comparaciones\" is no longer a QuickActions card competing with the Finder for a new visitor"
  );
  const secondaryActionsMatch = quickActionsSource.match(/const SECONDARY_ACTIONS: QuickAction\[\] = \[([\s\S]*?)\];/);
  const secondaryActionCount = secondaryActionsMatch ? (secondaryActionsMatch[1].match(/href:/g) ?? []).length : -1;
  assertTrue(secondaryActionCount === 3, "exactly 3 secondary action cards are defined (not 4 or 5)");
  assertTrue(quickActionsSource.includes("sm:grid-cols-3"), "the secondary tools render in at most 3 columns (matching the 3 cards, no empty 4th slot)");
}

// -----------------------------------------------------------------------
// 6/7. Wizard: only 4 required dimensions gate submission (Platform,
// Objective, Vertical, Country) — Audience/Funnel/Age/Spend/Duration
// are real, preserved, optional filters, never deleted.
// -----------------------------------------------------------------------
{
  assertTrue(
    !discoveryWizardSource.includes("!draft.audienceStrategy"),
    "handleSubmit no longer requires audienceStrategy to be set before reaching /benchmark"
  );
  assertTrue(
    discoveryWizardSource.includes("if (!draft.platformUiId || !draft.objective || !draft.verticalId || !draft.countryId) return;"),
    "handleSubmit still requires exactly the 4 core dimensions: platform, objective, vertical, country"
  );
  const breadcrumbStepsMatch = discoveryWizardSource.match(/const breadcrumbSteps = \[([\s\S]*?)\];/);
  const breadcrumbStepCount = breadcrumbStepsMatch ? (breadcrumbStepsMatch[1].match(/label:/g) ?? []).length : -1;
  assertEqual(breadcrumbStepCount, 4, "the breadcrumb tracks exactly 4 steps, so \"Paso X de 4\" is accurate");
  assertTrue(!existsSync(new URL("components/dashboard/wizard/AudienceStep.tsx", root)), "the forced, separate AudienceStep screen was removed");

  // §7: nothing methodological was deleted — every advanced dimension
  // still exists as a real, selectable field inside ContextStep.
  assertTrue(contextStepSource.includes('label={t("finder.audience")}'), "Audience is still a real, selectable filter (now inside \"Afinar benchmark\", not a forced step)");
  assertTrue(contextStepSource.includes('label={t("finder.funnelStage")}'), "Funnel Stage is preserved");
  assertTrue(contextStepSource.includes('label={t("finder.age")}'), "Age is preserved");
  assertTrue(contextStepSource.includes('label={t("finder.spendRange")}'), "Spend Range is preserved");
  assertTrue(contextStepSource.includes('label={t("finder.duration")}'), "Duration is preserved");
  assertTrue(contextStepSource.includes('label={t("finder.timeWindow")}'), "Time Window is preserved");
  assertTrue(
    discoveryWizardSource.includes("audienceStrategy: draft.context.audienceStrategy ?? null,") &&
    discoveryWizardSource.includes("funnelStage: draft.context.funnelStage ?? null,") &&
    discoveryWizardSource.includes("spendBand: draft.context.spendBand ?? null,") &&
    discoveryWizardSource.includes("durationBand: draft.context.durationBand ?? null,"),
    "every advanced field the wizard collects is still forwarded into the final CohortFilters object handed to /benchmark"
  );

  // §21: the advanced panel is collapsed by default and exposes
  // aria-expanded, one column on mobile, at most 2 on desktop.
  assertTrue(contextStepSource.includes("const [showAdvanced, setShowAdvanced] = useState(false);"), "\"Afinar benchmark\" is collapsed by default");
  assertTrue(contextStepSource.includes("aria-expanded={showAdvanced}"), "the \"Afinar benchmark\" toggle exposes aria-expanded");
  assertTrue(contextStepSource.includes("grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2"), "the advanced panel is 1 column on mobile, at most 2 on desktop");
}

// -----------------------------------------------------------------------
// 8. YouTube is still a UI-only card resolving to the real "google_ads"
// platform — never its own Platform taxonomy value.
// -----------------------------------------------------------------------
{
  const youtubeCard = PLATFORM_CARDS.find((c) => c.uiId === "youtube");
  assertTrue(!!youtubeCard, "a YouTube card exists in the platform picker");
  assertEqual(youtubeCard?.platform, "google_ads", "the YouTube card's underlying Platform value resolves to google_ads, never a separate \"youtube\" platform");
  assertTrue(
    !PLATFORM_CARDS.some((c) => (c.platform as string) === "youtube"),
    "no PLATFORM_CARDS entry has \"youtube\" as its real Platform value"
  );
}

// -----------------------------------------------------------------------
// 9/10/11. Prefill routing: Home -> /benchmark forwards every field the
// wizard/SearchOverlay can now set, and /benchmark reads it, and never
// auto-submits (the user still has to click through on /benchmark).
// -----------------------------------------------------------------------
{
  for (const param of ["prefillPlatform", "prefillObjective", "prefillVertical", "prefillCountry", "prefillAudienceStrategy", "prefillFunnelStage", "prefillSpendBand", "prefillDurationBand"]) {
    assertTrue(pageCodeOnly.includes(`params.set("${param}"`), `app/page.tsx's cohortFiltersToPrefillQuery forwards ${param}`);
    assertTrue(benchmarkExplorerSource.includes(`searchParams.get("${param}")`), `BenchmarkExplorer.tsx reads ${param} back out`);
  }
  assertTrue(
    searchOverlaySource.includes("onApply(s.apply)") && searchOverlaySource.includes("onClose()"),
    "SearchOverlay still hands its selection to the same onApply/goToBenchmark mechanism, then closes"
  );
  assertTrue(
    !/router\.push\(.*auto/.test(pageCodeOnly),
    "no auto-navigation/auto-submit path exists beyond the explicit goToBenchmark call"
  );
}

// -----------------------------------------------------------------------
// 12/13. Workspace: signed-out renders nothing, zero-data shows the
// 2-CTA onboarding, returning user sees continue-work before status
// counts (coverage/gaps stay at the bottom, unchanged).
// -----------------------------------------------------------------------
{
  assertTrue(workspaceSource.includes("if (userLoading || !user || !summary) return null;"), "a signed-out (or still-loading) visitor sees nothing from Workspace");
  assertTrue(workspaceSource.includes("if (!summary.hasAnyData) {"), "the zero-data onboarding block is still gated strictly on hasAnyData === false");
  assertTrue(
    workspaceSource.includes('{t("workspace.emptyCtaBenchmark")}') && workspaceSource.includes('{t("workspace.emptyCta")}'),
    "the zero-data onboarding still offers exactly its 2 real first-step CTAs (find a benchmark / import a campaign)"
  );
  const continueIdx = workspaceSource.indexOf('{t("comparisons.recentWorkTitle")}');
  const statusIdx = workspaceSource.indexOf('{t("workspace.statusTitle")}');
  const coverageIdx = workspaceSource.indexOf('{t("workspace.coverageTitle")}');
  assertTrue(
    continueIdx !== -1 && statusIdx !== -1 && coverageIdx !== -1 && continueIdx < statusIdx && statusIdx < coverageIdx,
    "returning-user section order is Continuar trabajando -> Estado de campañas -> coverage/gaps (never secondary info before recent work)"
  );
}

// -----------------------------------------------------------------------
// 14/15/16. No fixed benchmark sample claims, no fake metrics, no
// ranking/evaluative language anywhere in Home-facing copy.
// -----------------------------------------------------------------------
{
  const homeSurfaces = [heroSource, quickActionsSource, workspaceSource, pageCodeOnly];
  for (const src of homeSurfaces) {
    assertTrue(!/\d+\s*(campañas|campaigns)\b/i.test(src), "no hardcoded campaign-count claim appears in Home component source (real counts only ever come from summary.* props)");
    assertTrue(!/CPM\s*(USD|ARS|\$)?\s*\d/i.test(src), "no fixed CPM figure appears in Home component source");
    assertTrue(!/\+?\d+%\s*(vs\.?|versus)/i.test(src), "no fixed \"+X% vs.\" claim appears in Home component source");
  }
  // Hero/QuickActions translation copy: no evaluative "mejor"/"peor"/
  // ranking language (Cucurucho never ranks platforms or shows scores).
  // Comment lines are stripped first — this file's own Phase 39
  // explanatory comments legitimately NAME retired phrases (e.g. "...y
  // planificar mejor.") while explaining their removal; that is prose
  // about the copy, not the copy itself.
  const heroBlockMatch = translationsSource.match(/hero: \{[\s\S]*?\n {2}\},/);
  const quickActionsBlockMatch = translationsSource.match(/quickActions: \{[\s\S]*?\n {2}\},/);
  for (const [name, m] of [["hero", heroBlockMatch], ["quickActions", quickActionsBlockMatch]] as const) {
    assertTrue(!!m, `${name} translation block is present`);
    if (m) {
      const codeOnly = m[0].split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      assertTrue(!/\bmejor\b|\bpeor\b|\branking\b|\bscore\b/i.test(codeOnly), `the ${name} translation block contains no ranking/scoring language`);
    }
  }
}

// -----------------------------------------------------------------------
// 17/18/19. Mobile 320/375/425 structure — 1 or 2 columns everywhere on
// Home, never 3-4 compressed into a row, no horizontal-scroll pattern.
// -----------------------------------------------------------------------
{
  assertTrue(pageCodeOnly.includes("overflow-x-hidden"), "the Home root still guards against horizontal overflow");
  assertTrue(quickActionsSource.includes("grid-cols-1 gap-3 sm:grid-cols-3"), "QuickActions is 1 column below sm, 3 at sm+ (never 4+ compressed on mobile)");
  assertTrue(heroSource.includes("grid grid-cols-1 gap-2.5") && heroSource.includes("sm:grid-cols-3"), "Hero's value-proposition row is 1 column on mobile, 3 at sm+");
  assertTrue(platformStepSource.includes("grid-cols-2 gap-3 sm:grid-cols-3"), "PlatformStep stays at 2 columns on mobile (never 3-4 compressed)");
  assertTrue(verticalStepSource.includes("grid-cols-2 gap-2.5 sm:grid-cols-3"), "VerticalStep stays at 2 columns on mobile");
  assertTrue(countryStepSource.includes("grid-cols-2 gap-2.5 sm:grid-cols-4"), "CountryStep stays at 2 columns on mobile");
  assertTrue(
    !heroSource.includes("overflow-x-auto") && !quickActionsSource.includes("overflow-x-auto") && !workspaceSource.includes("overflow-x-auto"),
    "no horizontal-scroll pattern was introduced in Hero, QuickActions or Workspace"
  );
  assertTrue(
    !objectiveStepSource.includes("overflow-x-auto") && !contextStepSource.includes("overflow-x-auto"),
    "no horizontal-scroll pattern in ObjectiveStep or ContextStep either"
  );
}

// -----------------------------------------------------------------------
// 20. SearchOverlay: dialog semantics preserved, resolves only to real
// taxonomy values, never a fabricated number.
// -----------------------------------------------------------------------
{
  assertTrue(searchOverlaySource.includes('role="dialog"') && searchOverlaySource.includes('aria-modal="true"'), "SearchOverlay keeps its dialog semantics");
  assertTrue(searchOverlaySource.includes('e.key === "Escape"'), "Escape still closes the overlay");
  assertTrue(!/\$|USD|CPM|CTR|CPC/.test(searchOverlaySource), "SearchOverlay never shows a benchmark number");
}

// -----------------------------------------------------------------------
// 21. Header mobile shell preserved exactly (Logo/Search/Account/Menu),
// zero uncommitted changes — this phase never touched AppHeader.tsx.
// -----------------------------------------------------------------------
{
  assertTrue(
    appHeaderSource.includes("<LogoMark") && appHeaderSource.includes("onSearchClick") && appHeaderSource.includes("<AccountMenu") && appHeaderSource.includes("setMobileNavOpen(true)"),
    "the mobile header still has Logo / Search / Account / Menu, in that structure"
  );
  let headerDiff = "";
  try {
    headerDiff = execSync("git diff --stat -- components/dashboard/AppHeader.tsx", { cwd: new URL(".", root), encoding: "utf8" }).trim();
  } catch {
    headerDiff = "ERROR";
  }
  assertEqual(headerDiff, "", "components/dashboard/AppHeader.tsx has zero uncommitted changes (Phase 39 is Home-page-only)");
}

// -----------------------------------------------------------------------
// 22. Every Home nav destination is a real, structurally valid route —
// no dead links, no old routes.
// -----------------------------------------------------------------------
{
  for (const href of ["/benchmark", "/planner", "/platforms", "/contribute", "/comparisons"]) {
    const pagePath = `app${href}/page.tsx`;
    assertTrue(existsSync(new URL(pagePath, root)), `${href} resolves to a real page.tsx`);
  }
  const allNavItems = NAV_GROUP_STRUCTURE.flatMap((g) => g.items);
  assertTrue(allNavItems.length >= 6, "the primary nav still has its full complement of real routes");
  for (const item of allNavItems) {
    const pagePath = item.href === "/" ? "app/page.tsx" : `app${item.href}/page.tsx`;
    assertTrue(existsSync(new URL(pagePath, root)), `nav destination ${item.href} resolves to a real page.tsx`);
  }
}

// -----------------------------------------------------------------------
// Breadcrumb: once every required dimension is picked, the mobile
// "Paso X de Y" indicator stops counting rather than reading "Paso 5 de 4".
// -----------------------------------------------------------------------
{
  assertTrue(breadcrumbSource.includes("currentIndex < steps.length &&"), "WizardBreadcrumb only renders \"Paso X de Y\" while currentIndex is a real, counted step");
}

// -----------------------------------------------------------------------
// Protected files — zero uncommitted changes. This phase is Home-only.
// -----------------------------------------------------------------------
{
  const PROTECTED_FILES = [
    "lib/benchmark/engine.ts",
    "lib/planning/budget.ts",
    "lib/planning/comparability.ts",
    "lib/supabase/admin.ts",
    "supabase/migrations",
    "package.json",
    "package-lock.json",
  ];
  for (const rel of PROTECTED_FILES) {
    let diffStat = "";
    try {
      diffStat = execSync(`git diff --stat -- ${rel}`, { cwd: new URL(".", root), encoding: "utf8" }).trim();
    } catch {
      diffStat = "ERROR_RUNNING_GIT_DIFF";
    }
    assertEqual(diffStat, "", `${rel} has zero uncommitted changes (protected logic/backend untouched)`);
  }
  let untrackedMigrations = "";
  try {
    untrackedMigrations = execSync("git status --porcelain -- supabase/migrations", { cwd: new URL(".", root), encoding: "utf8" }).trim();
  } catch {
    untrackedMigrations = "ERROR";
  }
  assertEqual(untrackedMigrations, "", "no new/untracked migration file was added");
}

console.log(`test-phase39-home-simplification: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
