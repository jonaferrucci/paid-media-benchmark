// PHASE 39.2 — HOME DENSITY & FINAL UX POLISH.
//
// This phase changes PRESENTATION only (§23): the Benchmark Finder,
// prefill params, advanced filters, workspace queries, recent work,
// campaign counts, import history, gap computation, navigation, and
// signed-in/signed-out/zero-data states are all functionally untouched
// — only how much of the returning-user Workspace renders below the
// Finder was reduced. Same convention as every other scripts/test-*.mts
// file in this project: readFileSync-based structural source-text
// checks (no jsdom/React Testing Library configured here).

import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const root = new URL("..", import.meta.url);
function read(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

const pageSource = read("app/page.tsx");
const pageCodeOnly = pageSource.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const workspaceSource = read("components/dashboard/Workspace.tsx");
const workspaceCodeOnly = workspaceSource.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const quickActionsSource = read("components/dashboard/QuickActions.tsx");
const heroSource = read("components/dashboard/Hero.tsx");
const platformStepSource = read("components/dashboard/wizard/PlatformStep.tsx");
const contextStepSource = read("components/dashboard/wizard/ContextStep.tsx");
const benchmarkExplorerSource = read("app/benchmark/BenchmarkExplorer.tsx");
const translationsSource = read("lib/i18n/translations.ts");
const mockTaxonomiesSource = read("lib/mock/taxonomies.ts");

// -----------------------------------------------------------------------
// 1. Finder still comes before Workspace (density pass didn't reorder
//    the one primary CTA below the continuity hub).
// -----------------------------------------------------------------------
{
  const finderIdx = pageCodeOnly.indexOf('t("finder.title")');
  const workspaceIdx = pageCodeOnly.indexOf("<Workspace");
  assertTrue(finderIdx !== -1 && workspaceIdx !== -1 && finderIdx < workspaceIdx, "the Benchmark Finder still renders before Workspace on Home");
}

// -----------------------------------------------------------------------
// 2. Platform question copy updated (§5) — no longer phrased like the
//    Planner's own question.
// -----------------------------------------------------------------------
assertTrue(translationsSource.includes('questionPlatform: "¿Qué plataforma querés analizar?"'), "wizard.questionPlatform (ES) asks which platform to analyze, not where to advertise");
assertTrue(translationsSource.includes('questionPlatform: "What platform do you want to analyze?"'), "wizard.questionPlatform (EN) asks which platform to analyze, not where to advertise");
assertTrue(!translationsSource.includes('questionPlatform: "¿Dónde vas a pautar?"'), "the old, Planner-sounding ES question is gone");
assertTrue(!translationsSource.includes('questionPlatform: "Where are you advertising?"'), "the old, Planner-sounding EN question is gone");

// -----------------------------------------------------------------------
// 3. Platform cards render without the secondary description line in
//    Home's Finder (§6) — icon + name only.
// -----------------------------------------------------------------------
assertTrue(!platformStepSource.includes("meta={t(card.descriptionKey)}"), "PlatformStep no longer passes a description into EntityCard's meta slot");
assertTrue(platformStepSource.includes("title={card.label}"), "PlatformStep still shows the platform's real name");
assertTrue(mockTaxonomiesSource.includes("descriptionKey:"), "PLATFORM_CARDS' descriptionKey taxonomy field is untouched globally — only Home's render of it changed");

// -----------------------------------------------------------------------
// 4. YouTube still resolves internally to google_ads — no new "youtube"
//    platform introduced by this phase.
// -----------------------------------------------------------------------
assertTrue(
  mockTaxonomiesSource.includes('{ uiId: "youtube", platform: "google_ads", label: "YouTube"'),
  "the YouTube discovery card still maps to the google_ads platform value"
);

// -----------------------------------------------------------------------
// 5. Real Workspace preserved — signed-out/loading renders nothing,
//    zero-data onboarding untouched, the same getWorkspaceSummaryAction
//    data source.
// -----------------------------------------------------------------------
assertTrue(workspaceSource.includes("if (userLoading || !user || !summary) return null;"), "signed-out/still-loading visitor still sees nothing from Workspace");
assertTrue(workspaceSource.includes("if (!summary.hasAnyData) {"), "zero-data onboarding is still gated strictly on hasAnyData === false");
assertTrue(workspaceSource.includes("getWorkspaceSummaryAction()"), "Workspace still reads from the one real summary action — no new fetch introduced");

// -----------------------------------------------------------------------
// 6. Campaign status is no longer a heavy independent section — folded
//    into the continuity block as compact chips, no separate heading.
// -----------------------------------------------------------------------
assertTrue(!workspaceSource.includes('t("workspace.statusTitle")'), "the standalone \"Estado de tus campañas\" heading is gone from Home");
assertTrue(
  workspaceSource.includes('t("workspace.statusPendingCount"') && workspaceSource.includes('t("workspace.statusValidCount"'),
  "the real status counts still render, just without their own section heading"
);
{
  const continueIdx = workspaceSource.indexOf('{t("comparisons.recentWorkTitle")}');
  const statusChipIdx = workspaceSource.indexOf('t("workspace.statusPendingCount"');
  assertTrue(continueIdx !== -1 && statusChipIdx !== -1 && continueIdx < statusChipIdx, "status chips render inside the \"Continuar trabajando\" continuity block, not before it");
}

// -----------------------------------------------------------------------
// 7. Imports compacted — a single most-recent-import line, no more
//    "Importaciones recientes" heading or 3-card grid.
// -----------------------------------------------------------------------
assertTrue(!workspaceSource.includes('t("workspace.recentImportsTitle")'), "the standalone \"Importaciones recientes\" heading is gone from Home");
assertTrue(workspaceSource.includes('t("workspace.lastImportLabel")'), "a compact \"latest import\" label replaces the old imports grid heading");
assertTrue(
  workspaceSource.includes("summary.recentImports.length > 0") && workspaceSource.includes("summary.recentImports[0]"),
  "only the single most recent import batch is read for the compact summary — same real recentImports array, first entry only"
);
assertTrue(!/summary\.recentImports\.map/.test(workspaceSource), "the previous 3-card recentImports.map grid is gone");

// -----------------------------------------------------------------------
// 8. "Qué podés analizar" (coverage) no longer renders in Home. Its
//    underlying logic/labels stay real and untouched elsewhere.
// -----------------------------------------------------------------------
assertTrue(!workspaceSource.includes('t("workspace.coverageTitle")'), "the \"Qué podés analizar\" heading no longer renders on Home");
assertTrue(!workspaceSource.includes('from "@/lib/contribute/coverage"'), "Workspace no longer imports lib/contribute/coverage — it doesn't need DERIVED_METRIC_LABELS now that it doesn't render coverage chips (the helper itself is untouched and still imported elsewhere, checked below)");
{
  const coverageLibSource = read("lib/contribute/coverage.ts");
  assertTrue(coverageLibSource.includes("export const DERIVED_METRIC_LABELS"), "the DERIVED_METRIC_LABELS helper itself is untouched (still exported)");
  const contributionsListSource = read("app/account/contributions/ContributionsList.tsx");
  const contributionDetailSource = read("app/account/contributions/[id]/ContributionDetail.tsx");
  assertTrue(
    contributionsListSource.includes("DERIVED_METRIC_LABELS") && contributionDetailSource.includes("DERIVED_METRIC_LABELS"),
    "DERIVED_METRIC_LABELS still backs /account/contributions pages — only Home's own render path was retired"
  );
  const workspaceActionsSource = read("lib/contribute/workspaceActions.ts");
  assertTrue(workspaceActionsSource.includes("coverage: computeDataCoverage(rawSummaries),"), "workspaceActions.ts still computes real coverage — no query/logic change, only Home stopped rendering it");
}

// -----------------------------------------------------------------------
// 9. Detailed per-gap list ("Podrías sumar más") doesn't render in Home
//    any more; a single compact, actionable signal DOES render when a
//    real gap exists, and is hidden entirely with no gaps.
// -----------------------------------------------------------------------
assertTrue(!workspaceSource.includes('t("workspace.gapsTitle")'), "the old per-gap list heading is gone from Home");
assertTrue(!/GAP_MESSAGE_KEYS/.test(workspaceSource), "the per-field gap message lookup table is gone — Home no longer renders one row per missing field");
assertTrue(
  workspaceSource.includes('t("workspace.gapsSummaryTitle")') && workspaceSource.includes('t("workspace.gapsSummaryBody")'),
  "a single compact gap-signal title/body pair renders instead"
);
assertTrue(workspaceSource.includes("summary.gaps.length > 0"), "the compact gap signal is still gated on the real, unfabricated computeDataGaps() result");
assertTrue(!/todo completo|sin gaps|excelente/i.test(workspaceSource), "no \"all complete\"/celebration copy was added for the no-gaps case — the block is simply absent");

// -----------------------------------------------------------------------
// 10. QuickActions still exactly 3 secondary actions (Aportar datos /
//     Explorar medios / Planificar medios) — no over-polish regression.
// -----------------------------------------------------------------------
{
  const actionsMatch = quickActionsSource.match(/const SECONDARY_ACTIONS: QuickAction\[\] = \[([\s\S]*?)\];/);
  const actionsCount = (actionsMatch?.[1].match(/href:/g) ?? []).length;
  assertTrue(actionsCount === 3, "QuickActions still renders exactly 3 secondary actions");
  assertTrue(
    quickActionsSource.includes('href: "/contribute"') && quickActionsSource.includes('href: "/platforms"') && quickActionsSource.includes('href: "/planner"'),
    "QuickActions still links to contribute/platforms/planner only"
  );
  assertTrue(
    !quickActionsSource.includes('href: "/benchmark"') && !quickActionsSource.includes('href: "/comparisons"'),
    "no benchmark-finder-duplicating or comparisons CTA was added back to QuickActions"
  );
}

// -----------------------------------------------------------------------
// 11. No duplicate benchmark CTA anywhere on Home outside the one
//     Finder + the existing "continue a saved comparison" links.
// -----------------------------------------------------------------------
assertTrue(
  (pageCodeOnly.match(/<DiscoveryWizard/g) ?? []).length === 1,
  "exactly one DiscoveryWizard (the Finder) renders on Home"
);

// -----------------------------------------------------------------------
// 12. No mock benchmark data, no fixed metrics/sample-size claims
//     introduced by this phase's changed files.
// -----------------------------------------------------------------------
for (const [label, source] of [
  ["Workspace", workspaceSource],
  ["QuickActions", quickActionsSource],
  ["Hero", heroSource],
  ["PlatformStep", platformStepSource],
  ["page.tsx", pageCodeOnly],
] as const) {
  assertTrue(!/from ["']@\/lib\/mock\/benchmarks["']/.test(source), `${label} never imports lib/mock/benchmarks`);
  assertTrue(!/from ["']@\/lib\/mock\/random["']/.test(source), `${label} never imports lib/mock/random`);
  assertTrue(!/\d+\s*(campañas|campaigns)\b/i.test(source), `${label} has no hardcoded campaign-count claim — real counts only ever come from summary.* props`);
  assertTrue(!/CPM\s*(USD|ARS|\$)?\s*\d/i.test(source), `${label} has no fixed CPM figure`);
}

// -----------------------------------------------------------------------
// 13. Signed-out behavior unaffected: Workspace still renders nothing,
//     Home still shows Hero/Finder/QuickActions for a visitor.
// -----------------------------------------------------------------------
assertTrue(
  (pageCodeOnly.match(/<Hero \/>|<Workspace \/>|<QuickActions \/>|<DiscoveryWizard/g) ?? []).length === 4,
  "Home still renders exactly its four existing sections — no new section was added"
);

// -----------------------------------------------------------------------
// 14. Zero-data behavior unaffected — same 2-CTA onboarding block, no
//     empty Continuar-trabajando/status/imports/gaps blocks rendered.
// -----------------------------------------------------------------------
assertTrue(
  workspaceSource.includes('{t("workspace.emptyCtaBenchmark")}') && workspaceSource.includes('{t("workspace.emptyCta")}'),
  "the zero-data onboarding still offers its 2 real first-step CTAs"
);

// -----------------------------------------------------------------------
// 15. Returning-user behavior — continuity block only renders when at
//     least one real signal exists (comparisons/plans, status counts,
//     or a recent import); never an empty shell.
// -----------------------------------------------------------------------
assertTrue(
  workspaceSource.includes("const hasContinuity = hasContinueItems || hasStatusCounts || summary.recentImports.length > 0;"),
  "the continuity block is gated on real comparisons/plans, status counts, or a recent import — never shown empty"
);

// -----------------------------------------------------------------------
// 16. Mobile responsive classes present — chip rows flex-wrap, no fixed
//     3-column grid for the compact elements this phase touched.
// -----------------------------------------------------------------------
assertTrue(workspaceSource.includes('className="mt-2 flex flex-wrap gap-2"'), "the status chip row still uses flex-wrap (legible at 320px)");
assertTrue(platformStepSource.includes("grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"), "Home's platform cards keep their responsive column classes (2 on mobile)");
assertTrue(quickActionsSource.includes("grid-cols-1 gap-3 sm:grid-cols-3"), "QuickActions stays 1 column on mobile");

// -----------------------------------------------------------------------
// 17. No horizontal-scroll pattern (overflow-x-auto / whitespace-nowrap
//     table-like markup) introduced in the touched files.
// -----------------------------------------------------------------------
for (const [label, source] of [
  ["Workspace", workspaceSource],
  ["PlatformStep", platformStepSource],
  ["Hero", heroSource],
] as const) {
  assertTrue(!/overflow-x-auto|whitespace-nowrap/.test(source), `${label} introduces no horizontal-scroll pattern`);
}

// -----------------------------------------------------------------------
// 18. Advanced filters still work — ContextStep/BenchmarkExplorer
//     prefill mechanism from Phase 39/39.1 is untouched by this phase.
// -----------------------------------------------------------------------
assertTrue(contextStepSource.includes('t("wizard.moreOptions")'), "ContextStep's advanced-filters toggle is untouched");
assertTrue(
  contextStepSource.includes("audienceStrategy") && contextStepSource.includes("funnelStage") && contextStepSource.includes("spendBand") && contextStepSource.includes("durationBand"),
  "ContextStep's 4 real advanced fields are untouched"
);
assertTrue(
  benchmarkExplorerSource.includes("SUPPORTED_PREFILL_TIME_WINDOWS"),
  "BenchmarkExplorer's Phase 39.1 prefill validation is untouched"
);
assertTrue(
  pageCodeOnly.includes("prefillAudienceStrategy") && pageCodeOnly.includes("prefillFunnelStage") && pageCodeOnly.includes("prefillSpendBand") && pageCodeOnly.includes("prefillDurationBand") && pageCodeOnly.includes("prefillTimeWindow"),
  "app/page.tsx's prefill query builder still forwards every advanced filter"
);

// -----------------------------------------------------------------------
// 19. No new dependency / new Supabase query / new fetch was introduced
//     (§22) — workspaceActions.ts's Promise.all shape is unchanged.
// -----------------------------------------------------------------------
{
  const workspaceActionsSource = read("lib/contribute/workspaceActions.ts");
  assertTrue(
    workspaceActionsSource.includes("const [datasetsRes, statusRes, batchesRes, comparisons, plans] = await Promise.all(["),
    "workspaceActions.ts's real query shape (5 batched reads) is unchanged — no new query added for this phase"
  );
}

// -----------------------------------------------------------------------
// 20. No ranking/evaluative or fabricated-precision language introduced
//     in the new copy this phase actually wrote.
// -----------------------------------------------------------------------
{
  const stripComments = (src: string) => src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  const newCopy = [
    translationsSource.match(/questionPlatform: "¿Qué plataforma querés analizar\?"/)?.[0],
    translationsSource.match(/questionPlatform: "What platform do you want to analyze\?"/)?.[0],
    translationsSource.match(/lastImportLabel: "Última importación"/)?.[0],
    translationsSource.match(/lastImportLabel: "Latest import"/)?.[0],
    translationsSource.match(/gapsSummaryTitle: "Mejorá tus comparaciones"/)?.[0],
    translationsSource.match(/gapsSummaryBody: "Hay campañas a las que podés sumar más métricas\."/)?.[0],
    translationsSource.match(/gapsSummaryTitle: "Improve your comparisons"/)?.[0],
    translationsSource.match(/gapsSummaryBody: "Some campaigns could use more metrics\."/)?.[0],
  ].join(" ");
  // "Mejorá" (imperative "improve") is not the evaluative "mejor"
  // ("better") — JS's ASCII-only \b treats the boundary before "á" as
  // a word break, so \bmejor\b would false-positive on it. Strip that
  // one legitimate word before running the ranking/evaluative check.
  const rankingCheckText = stripComments(newCopy).replace(/mejorá/gi, "");
  assertTrue(!/\bmejor\b|\bpeor\b|ranking|score|puntaje/i.test(rankingCheckText), "the new Phase 39.2 copy avoids ranking/evaluative/score language");
}

// -----------------------------------------------------------------------
// 21. Protected files untouched by this phase — no backend/methodology
//     files appear among the ones this suite reads for Home.
// -----------------------------------------------------------------------
assertTrue(!pageCodeOnly.includes("createServerSupabaseClient") && !pageCodeOnly.includes("createAdminClient"), "app/page.tsx never talks to Supabase directly — it's a client component");
assertTrue(!/supabase\.from\(/.test(workspaceSource), "Workspace.tsx never issues its own Supabase query — it only reads getWorkspaceSummaryAction()'s result");

console.log(`test-phase39-2-home-density: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
