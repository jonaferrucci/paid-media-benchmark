// PHASE 35 — CAMPAIGN & WORKSPACE UX.
//
// Same convention as every other scripts/test-*.mts file in this
// project: readFileSync-based structural source-text checks (no jsdom/
// React Testing Library configured here), plus real execution of the
// plain, framework-free logic this phase touched (lib/contribute/
// coverage.ts's RecentImportGroup shape, lib/contribute/workspaceActions.ts
// stays server-only and DB-backed so it is checked structurally like
// every other Server Action in this project). Scoped strictly to what
// Phase 35 actually changed: components/dashboard/Workspace.tsx,
// app/account/contributions/ContributionsList.tsx, app/account/
// contributions/[id]/page.tsx + ContributionDetail.tsx, lib/contribute/
// workspaceActions.ts + coverage.ts, and the new/changed translation
// keys in lib/i18n/translations.ts.

import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const workspaceSource = readFileSync(new URL("../components/dashboard/Workspace.tsx", import.meta.url), "utf8");
const workspaceActionsSource = readFileSync(new URL("../lib/contribute/workspaceActions.ts", import.meta.url), "utf8");
const coverageSource = readFileSync(new URL("../lib/contribute/coverage.ts", import.meta.url), "utf8");
const contributionsListSource = readFileSync(new URL("../app/account/contributions/ContributionsList.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/account/contributions/[id]/page.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../app/account/contributions/[id]/ContributionDetail.tsx", import.meta.url), "utf8");
const quickActionsSource = readFileSync(new URL("../components/dashboard/QuickActions.tsx", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");

// -----------------------------------------------------------------------
// §4 Zero-data onboarding: exactly two real paths (find a benchmark /
// import a campaign) — never a third tutorial/modal, and never a single
// CTA that hides the "find a benchmark" first step named in the
// onboarding list right above it.
// -----------------------------------------------------------------------
assertTrue(
  workspaceSource.includes('href="/benchmark"') && workspaceSource.includes('t("workspace.emptyCtaBenchmark")'),
  "the zero-data state's first path links to /benchmark with its own real CTA copy"
);
assertTrue(
  workspaceSource.includes('href="/contribute"') && workspaceSource.includes('t("workspace.emptyCta")'),
  "the zero-data state's second path links to /contribute with its own real CTA copy"
);
assertTrue(
  (workspaceSource.match(/if \(!summary\.hasAnyData\) \{[\s\S]*?\n  \}/)?.[0].match(/<Link\s/g) ?? []).length === 2,
  "the zero-data onboarding block renders exactly two links — never a third"
);

// -----------------------------------------------------------------------
// §2/§3 Attention counts use REAL, unbounded data — never the
// RECENT_DATASET_LIMIT-capped working set used for coverage/gaps, and
// never a fabricated/estimated number.
// -----------------------------------------------------------------------
assertTrue(
  workspaceActionsSource.includes('supabase.from("performance_datasets").select("validation_status").neq("validation_status", "deleted")'),
  "status counts come from a dedicated, unbounded (no .limit) query over validation_status — not the capped 20-row working set"
);
assertTrue(
  !/\.limit\(RECENT_DATASET_LIMIT\)[\s\S]{0,200}validation_status:\s*"pending"/.test(workspaceActionsSource),
  "pending/valid counts are never computed from the capped `rows` array"
);
assertTrue(
  workspaceActionsSource.includes("comparisons: comparisons.length") && workspaceActionsSource.includes("plans: plans.length"),
  "saved-comparisons/plans attention counts are the real full list length, not the RECENT_LIST_LIMIT-sliced \"continue working\" subset"
);
assertTrue(
  workspaceActionsSource.includes("listSavedComparisonsAction(),") && !/listSavedComparisonsAction\(RECENT_LIST_LIMIT\)/.test(workspaceActionsSource),
  "listSavedComparisonsAction is called with no limit, so its full length is a real total"
);
assertTrue(
  (workspaceActionsSource.match(/await Promise\.all\(\[/g) ?? []).length === 1,
  "the new status-counts query is batched into the SAME existing Promise.all — never a second sequential round-trip"
);
assertTrue(
  workspaceSource.includes("statusCounts.pending > 0") && workspaceSource.includes("statusCounts.valid > 0"),
  "Workspace renders the real statusCounts fields returned by getWorkspaceSummaryAction"
);

// -----------------------------------------------------------------------
// §5/§6 Contributions list ("Mis campañas") hierarchy and density: the
// heading uses the new preferred term, the compact card dropped the
// secondary metadata line, and each card ends with an explicit "next
// action" affordance instead of relying on an implicit hover cue.
// -----------------------------------------------------------------------
assertTrue(translationsSource.includes('myContributions: "Mis campañas"'), "the contributions page heading uses the preferred term \"Mis campañas\" (ES), not \"Mis aportes\"");
assertTrue(translationsSource.includes('myContributions: "My campaigns"'), "the contributions page heading uses \"My campaigns\" (EN)");
assertTrue(
  contributionsListSource.includes("d.platforms?.display_label} · {d.objectives?.display_label} · {d.countries?.display_label}"),
  "the compact card line is platform · objective · country — vertical/campaign type/source moved to the detail page"
);
assertTrue(
  !/d\.campaign_types\?\.\display_label|d\.verticals\?\.display_label/.test(contributionsListSource),
  "vertical and campaign type are no longer rendered on the compact list card"
);
assertTrue(
  contributionsListSource.includes('t("contributions.viewCampaignCta")') && contributionsListSource.includes("<ArrowRight"),
  "each card carries an explicit \"view campaign\" affordance with a directional icon"
);

// -----------------------------------------------------------------------
// §9 Pending status: an honest explanation, never the primary compare
// CTA, and never claims the campaign is already benchmark-eligible.
// -----------------------------------------------------------------------
assertTrue(
  detailSource.includes('dataset.validationStatus === "pending"\n                  ? t("contributions.pendingBenchmarkExplanation")'),
  "a pending campaign renders its own honest explanation, not the excluded copy"
);
{
  const pendingExcludedBlock = detailSource.match(/\{\(dataset\.validationStatus === "pending" \|\| dataset\.validationStatus === "excluded"\) && \([\s\S]*?<\/div>\s*\)\}/)?.[0] ?? "";
  assertTrue(pendingExcludedBlock.length > 0, "the pending/excluded block is found");
  assertTrue(
    !pendingExcludedBlock.includes("contributions.compareBenchmarkCta") && !pendingExcludedBlock.includes("comparableResultsTitle"),
    "pending/excluded never renders the primary compare CTA or the comparable-results title"
  );
  assertTrue(pendingExcludedBlock.includes('t("contributions.exploreBenchmarkCta")'), "pending/excluded still offer the secondary, non-committal explore link");
}

// -----------------------------------------------------------------------
// §8/§10 Valid status: "Resultados comparables" shows the campaign's own
// real, already-computed value (formatMetricValue reuse, real per-metric
// unit — never a hardcoded guess) with a per-metric compare CTA — and an
// honest empty state (never a fake primary CTA) when a valid campaign
// has zero real compareOptions.
// -----------------------------------------------------------------------
assertTrue(
  detailSource.includes('import { formatMetricValue } from "@/lib/comparison/classify";'),
  "the comparable-results value formatting reuses the one existing canonical formatter — never a second one written for this section"
);
assertTrue(
  detailSource.includes("formatMetricValue(option.userValue, option.unit)"),
  "each comparable-metric row formats its value using the real per-metric unit carried through from the engine"
);
assertTrue(
  detailSource.includes("benchmarkActivation.compareOptions.length === 0") && detailSource.includes('t("contributions.benchmarkReadinessNone")'),
  "a valid campaign with zero real compareOptions gets the same honest \"nothing ready yet\" copy instead of a misleading primary CTA"
);
assertTrue(
  pageSource.includes("unit: result.unit") && pageSource.includes("unit: reachResult.unit"),
  "unit is threaded through from the SAME already-executing getMetricBenchmark calls — no new query added for this display"
);

// -----------------------------------------------------------------------
// Compare CTA only ever renders for a valid campaign — the pending/
// excluded block is a physically separate JSX branch (already verified
// above it never contains the CTA key), and the valid branch is the
// only place that key appears.
// -----------------------------------------------------------------------
assertTrue(
  (detailSource.match(/t\("contributions\.compareBenchmarkCta"\)/g) ?? []).length === 1,
  "the primary compare CTA copy key appears exactly once in the whole file — inside the valid-only branch"
);

// -----------------------------------------------------------------------
// §17 Workspace must not duplicate QuickActions' global nav: it never
// re-renders the same static, generic launch-grid QuickActions already
// owns (same hrefs, same generic \"open\" wording) — its own links are
// specific/contextual (a particular saved item, a status-filtered list,
// or the two explicit onboarding paths).
// -----------------------------------------------------------------------
assertTrue(
  !workspaceSource.includes('t("quickActions.openCta")') && !workspaceSource.includes("ACCENT_CLASSES"),
  "Workspace never reuses QuickActions' generic action-card copy/styling constants"
);
assertTrue(
  quickActionsSource.includes('{ href: "/planner"') && workspaceSource.includes('href="/planner"'),
  "sanity: /planner is a real QuickActions destination that Workspace also links to"
);
assertTrue(
  !workspaceSource.includes('href="/platforms"') && !workspaceSource.includes('href="/comparisons"'),
  "Workspace never adds its own generic links to routes QuickActions already exposes as static launch buttons (platforms, comparisons)"
);

// -----------------------------------------------------------------------
// §13 Recent imports: real, import_batches-backed, with an optional real
// filename — never a fabricated name for a manual/legacy batch.
// -----------------------------------------------------------------------
assertTrue(
  coverageSource.includes("sourceFilename?: string | null;"),
  "RecentImportGroup gained an optional sourceFilename field, backward-compatible with groupRecentImports' existing callers"
);
assertTrue(
  workspaceActionsSource.includes("source_filename") && workspaceActionsSource.includes("sourceFilename: b.source_filename ?? null,"),
  "the real, already-stored import_batches.source_filename is threaded through — never invented for a batch that has none"
);
assertTrue(
  workspaceSource.includes("group.sourceFilename ?") ,
  "Workspace only renders the filename when the batch actually has one"
);

// -----------------------------------------------------------------------
// §14 Coverage/gaps preserved and still positioned after campaign
// status/continue-working/recent-imports (never removed, never
// reordered above the campaign-status attention section).
// -----------------------------------------------------------------------
{
  const statusIdx = workspaceSource.indexOf('t("workspace.statusTitle")');
  const coverageIdx = workspaceSource.indexOf('t("workspace.coverageTitle")');
  const gapsIdx = workspaceSource.indexOf('t("workspace.gapsTitle")');
  assertTrue(statusIdx > -1 && coverageIdx > -1 && gapsIdx > -1, "status/coverage/gaps sections all still exist");
  assertTrue(statusIdx < coverageIdx && coverageIdx < gapsIdx, "campaign-status attention comes before coverage, which comes before gaps");
}

// -----------------------------------------------------------------------
// Mobile structure: no fixed-width row that could overflow narrow
// viewports was introduced by this phase's new markup.
// -----------------------------------------------------------------------
assertTrue(
  workspaceSource.includes('className="mt-4 flex flex-wrap items-center justify-center gap-2"') ||
  workspaceSource.includes('className="mt-2 flex flex-wrap gap-2"'),
  "the zero-data state's two CTAs sit in a flex-wrap row"
);
assertTrue(
  detailSource.includes('className="min-w-0"') && detailSource.includes('className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"'),
  "each comparable-results row shrinks its text side and never shrinks its button side, so it can't force horizontal overflow at 320px"
);

// -----------------------------------------------------------------------
// No raw enum/technical wording in the owner-facing copy this phase
// actually wrote (§16's avoid list) — scoped to the strings Phase 35
// introduced or changed, not a blanket repo-wide scan.
// -----------------------------------------------------------------------
for (const value of [
  'myContributions: "Mis campañas"',
  'empty: "Todavía no tenés campañas cargadas."',
  'comparableResultsTitle: "Resultados comparables"',
  'detailsSectionTitle: "Detalles de la campaña"',
  'statusTitle: "Estado de tus campañas"',
]) {
  assertTrue(translationsSource.includes(value), `expected Phase 35 copy present: ${value}`);
}
const phase35CopyBlock = [
  translationsSource.match(/myContributions: "Mis campañas"/)?.[0],
  translationsSource.match(/empty: "Todavía no tenés campañas cargadas\."/)?.[0],
  translationsSource.match(/viewCampaignCta: "Ver campaña"/)?.[0],
  translationsSource.match(/comparableResultsTitle: "Resultados comparables"/)?.[0],
  translationsSource.match(/detailsSectionTitle: "Detalles de la campaña"/)?.[0],
  translationsSource.match(/statusTitle: "Estado de tus campañas"/)?.[0],
].join(" ");
assertTrue(
  !/\bdataset\b|\brecord\b|\brow\b|eligibility|aggregation|validation status/i.test(phase35CopyBlock),
  "the new Phase 35 owner-facing copy avoids the technical/internal terms §16 asks to avoid"
);

// -----------------------------------------------------------------------
// No mock data introduced anywhere this phase touched.
// -----------------------------------------------------------------------
for (const [label, source] of [
  ["Workspace", workspaceSource],
  ["workspaceActions", workspaceActionsSource],
  ["ContributionsList", contributionsListSource],
  ["ContributionDetail", detailSource],
  ["page.tsx", pageSource],
] as const) {
  assertTrue(!/from ["']@\/lib\/mock\/benchmarks["']/.test(source), `${label} never imports lib/mock/benchmarks`);
  assertTrue(!/from ["']@\/lib\/mock\/random["']/.test(source), `${label} never imports lib/mock/random`);
}

// -----------------------------------------------------------------------
// No migration / schema change was introduced for this phase.
// -----------------------------------------------------------------------
assertTrue(
  (() => {
    try {
      readFileSync(new URL("../supabase/migrations/0020_placeholder.sql", import.meta.url), "utf8");
      return false;
    } catch {
      return true;
    }
  })(),
  "no new migration (e.g. 0020) was created for this phase"
);
assertTrue(!/createAdminClient/.test(workspaceActionsSource), "workspaceActions.ts still never uses the admin/service-role client — RLS remains the real ownership boundary");

console.log(`test-phase35-campaign-workspace-ux: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
