// PHASE 31 — ONBOARDING & FIRST-USE FLOW.
//
// Same convention as every other scripts/test-*.mts file in this
// project: readFileSync-based structural source-text checks (no
// jsdom/React Testing Library configured here), focused on exactly
// what this phase touched — the wizard age-band typo, the Workspace
// zero-data onboarding copy, the contribute landing/import-success
// copy and CTAs, and the benchmark no_data empty-state copy.

import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const contextStepSource = readFileSync(new URL("../components/dashboard/wizard/ContextStep.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../components/dashboard/Workspace.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const contributeLandingSource = readFileSync(new URL("../app/contribute/ContributeLanding.tsx", import.meta.url), "utf8");
const benchmarkExplorerSource = readFileSync(new URL("../app/benchmark/BenchmarkExplorer.tsx", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");

// -----------------------------------------------------------------------
// §1 Age-range typo: 18-24 / 25-34 / 35-44 / 45-54, a real partition —
// no band overlaps another, no gap is left uncovered.
// -----------------------------------------------------------------------
assertTrue(contextStepSource.includes('{ value: "25-34", label: "25–34" }'), "the age band is corrected to 25-34 (was the overlapping/typo'd 25-44)");
assertTrue(!contextStepSource.includes('{ value: "25-44", label: "25–44" }'), "the old, overlapping 25-44 band is gone");
assertTrue(
  contextStepSource.includes('{ value: "18-24", label: "18–24" }') &&
  contextStepSource.includes('{ value: "35-44", label: "35–44" }') &&
  contextStepSource.includes('{ value: "45-54", label: "45–54" }'),
  "the other three age bands (18-24, 35-44, 45-54) are preserved exactly as before"
);

// -----------------------------------------------------------------------
// §2/§11 First-time onboarding lives in exactly ONE place — Workspace's
// existing zero-data state — never a second onboarding surface added to
// Home, and it stays conditional on real state (signed-in + no data),
// never shown to a signed-out visitor or a returning user with data.
// -----------------------------------------------------------------------
assertTrue(
  workspaceSource.includes("if (userLoading || !user || !summary) return null;"),
  "a signed-out (or still-loading) visitor still sees no onboarding block at all"
);
assertTrue(
  workspaceSource.includes("if (!summary.hasAnyData) {"),
  "the onboarding block is still gated strictly on hasAnyData === false — never shown to a user who already has data"
);
assertTrue(
  translationsSource.includes('emptyStep1: "1. Encontrá un benchmark"') &&
  translationsSource.includes('emptyStep2: "2. Importá una campaña"') &&
  translationsSource.includes('emptyStep3: "3. Compará tus resultados"'),
  "the zero-data onboarding steps read: find a benchmark, import a campaign, compare your results (ES)"
);
assertTrue(
  translationsSource.includes('emptyStep1: "1. Find a benchmark"') &&
  translationsSource.includes('emptyStep2: "2. Import a campaign"') &&
  translationsSource.includes('emptyStep3: "3. Compare your results"'),
  "the zero-data onboarding steps read: find a benchmark, import a campaign, compare your results (EN)"
);
// No second onboarding component/section was added to Home itself —
// app/page.tsx still renders exactly Hero/Workspace/QuickActions/
// DiscoveryWizard, nothing new.
assertTrue(
  (pageSource.match(/<Hero \/>|<Workspace \/>|<QuickActions \/>|<DiscoveryWizard/g) ?? []).length === 4,
  "Home still renders exactly its four existing sections — no new onboarding component was added alongside Workspace's own"
);

// -----------------------------------------------------------------------
// §3 Returning-user flow untouched: recent work / recent imports /
// coverage / gaps sections and their gating are all still present and
// unmodified in shape.
// -----------------------------------------------------------------------
assertTrue(workspaceSource.includes("const hasContinueItems = summary.comparisons.length > 0 || summary.plans.length > 0;"), "\"Continue working\" still gates on real saved comparisons/plans, unchanged");
assertTrue(workspaceSource.includes("summary.recentImports.length > 0"), "recent imports section still gates on real recentImports data, unchanged");
assertTrue(workspaceSource.includes("summary.coverage.length === 0"), "coverage section still reflects real, formula-derived coverage, unchanged");
assertTrue(!/qualityScore|healthScore|completenessScore/i.test(workspaceSource), "still no arbitrary quality/health score introduced");

// -----------------------------------------------------------------------
// No mock-benchmark-number dependency reintroduced anywhere this phase
// touched.
// -----------------------------------------------------------------------
for (const [label, source] of [
  ["Workspace", workspaceSource],
  ["ContributeLanding", contributeLandingSource],
  ["BenchmarkExplorer", benchmarkExplorerSource],
  ["ContextStep", contextStepSource],
] as const) {
  assertTrue(!/from ["']@\/lib\/mock\/benchmarks["']/.test(source), `${label} never imports lib/mock/benchmarks`);
  assertTrue(!/from ["']@\/lib\/mock\/random["']/.test(source), `${label} never imports lib/mock/random`);
  assertTrue(!/GlobalInsights|MiniTrend|FeaturedModules|ExploreMarket/.test(source), `${label} never reintroduces a Phase 29-removed mock module`);
}

// -----------------------------------------------------------------------
// §4/§5 Contribute entry: automatic detection/mapping wording, honest
// verified/pending platform distinction untouched, manual entry still
// secondary.
// -----------------------------------------------------------------------
assertTrue(
  translationsSource.includes('primaryBody: "Subí el reporte exportado desde la plataforma. Cucurucho detecta y mapea las columnas automáticamente."'),
  "the primary upload action's body copy states plainly that column detection/mapping is automatic (ES)"
);
assertTrue(
  translationsSource.includes('primaryBody: "Upload the report exported from the platform. Cucurucho detects and maps the columns automatically."'),
  "the primary upload action's body copy states plainly that column detection/mapping is automatic (EN)"
);
assertTrue(
  contributeLandingSource.includes("isVerifiedWithRealExport(p)") && contributeLandingSource.includes("t(\"contribute.platformSupportLegend\")"),
  "the honest verified-vs-pending platform legend (Meta/Google verified, others compatible/pending) is untouched"
);
assertTrue(
  contributeLandingSource.includes("onClick={onQuick}") && contributeLandingSource.includes('t("contribute.pathQuickTitle")'),
  "manual campaign-result entry remains a secondary path, not the dominant action"
);

// -----------------------------------------------------------------------
// §6/§7 Import success: exactly two strong (primary-styled) next
// actions, the rest demoted to plain text links (kept, not removed);
// status wording uses the same owner-facing "in review" language as
// Phase 28, and import completion is never merged with benchmark
// validation status into one sentence.
// -----------------------------------------------------------------------
const doneBlockMatch = contributeLandingSource.match(/return \(\s*<div className="rounded-2xl border border-line bg-surface p-6 text-center">[\s\S]*?<\/div>\s*\);\s*\}\)\(\)/);
const doneBlock = doneBlockMatch ? doneBlockMatch[0] : "";
assertTrue(doneBlock.length > 0, "the import-done block is found for the checks below");
assertTrue((doneBlock.match(/bg-primary px-4 py-2 text-xs font-semibold text-white/g) ?? []).length === 2, "exactly two strong (filled, primary-colored) buttons appear on the import-done screen");
assertTrue(doneBlock.includes('href="/account/contributions"') && doneBlock.includes('t("contribute.import.ctaViewMyContributions")'), "\"Ver mis aportes\" is one of the two strong actions, linking to the real contributions list");
assertTrue(doneBlock.includes("href={compareHref ?? \"/benchmark\"}"), "the second strong action always resolves to a real benchmark destination — this exact campaign's cohort when resolvable, otherwise the plain benchmark page (never a dead link)");
assertTrue(
  doneBlock.includes('t("contribute.import.ctaContributeMore")') && doneBlock.includes('t("contribute.import.ctaHome")') &&
  doneBlock.includes("text-xs font-medium text-ink-500 hover:text-primary hover:underline"),
  "\"Aportar más datos\" / \"Volver al inicio\" are kept (not removed) but demoted to plain text links, not competing with the two strong actions"
);
assertTrue(
  translationsSource.includes('doneTitle: "Importación completada"') && translationsSource.includes('doneTitle: "Import completed"'),
  "the import-done headline leads with the plain completion fact"
);
assertTrue(
  translationsSource.includes('benchmarkValidationPendingNote: "Tus campañas quedaron en revisión para su incorporación a benchmarks."'),
  "the post-import note uses the same \"en revisión\" wording as the owner-facing contribution status, never a different phrase for the same state"
);
// Import completion and benchmark validation status stay two distinct
// sentences/keys — doneSummary (import outcome) is never the same
// string as benchmarkValidationPendingNote (benchmark eligibility).
assertTrue(
  translationsSource.includes("doneSummary: \"{imported} campañas importadas, {failed} con errores.\""),
  "import outcome (doneSummary) remains its own separate sentence from benchmark eligibility (benchmarkValidationPendingNote) — never merged into one"
);

// -----------------------------------------------------------------------
// §7 (contributions list) — the three owner-facing validation labels are
// still exactly "En revisión" / "Aprobada para benchmarks" / "No
// incluida en benchmarks", never a raw enum value in the UI.
// -----------------------------------------------------------------------
assertTrue(
  translationsSource.includes('pending: "En revisión"') &&
  translationsSource.includes('valid: "Aprobada para benchmarks"') &&
  translationsSource.includes('excluded: "No incluida en benchmarks"'),
  "the three owner-facing contribution-status labels are unchanged from Phase 28"
);

// -----------------------------------------------------------------------
// §8 Benchmark empty states: no_data explains BOTH available next moves
// in its own copy (adjust filters visible on the same screen, or
// contribute the missing data); insufficient_sample and the Reach
// methodology block are left exactly as they were (no benchmark math
// touched).
// -----------------------------------------------------------------------
assertTrue(
  translationsSource.includes("Probá ajustar los filtros o aportar los datos que faltan") &&
  translationsSource.includes("Try adjusting the filters or contributing the missing data"),
  "the no_data empty state names both real next actions in its own copy"
);
assertTrue(benchmarkExplorerSource.includes('response.status === "methodology_block"'), "the Reach methodology block branch is untouched");
assertTrue(benchmarkExplorerSource.includes('response.status === "insufficient_sample"'), "the insufficient_sample branch (with its real relaxation-suggestion action) is untouched");
assertTrue(
  translationsSource.includes('reachBlockBody: "El Alcance requiere Rango de Inversión y Duración de campaña para preservar la comparabilidad de escala. Ajustá estos filtros para obtener un benchmark válido."'),
  "the Reach-specific scale-context explanation is preserved verbatim — no benchmark methodology copy changed"
);

// -----------------------------------------------------------------------
// Mobile structure: the new two-strong-action + demoted-links layout
// still wraps (flex-wrap) rather than forcing a fixed-width row that
// could overflow on a narrow viewport.
// -----------------------------------------------------------------------
assertTrue(doneBlock.includes('className="mt-4 flex flex-wrap justify-center gap-2"'), "the two strong actions sit in a flex-wrap row — no horizontal-overflow risk on narrow screens");
assertTrue(doneBlock.includes('className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1"'), "the demoted text links also wrap rather than forcing a fixed-width row");

console.log(`test-phase31-onboarding-first-use: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
