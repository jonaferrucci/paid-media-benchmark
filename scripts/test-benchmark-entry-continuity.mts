// CUCURUCHO — HOME -> BENCHMARK CONTINUITY UX FIX.
//
// Verifies the /benchmark entry/query UX changes: a compact "Benchmark
// seleccionado" context confirmation replaces re-showing full Platform/
// Objective/Vertical/Country pickers when the page arrives with
// complete context (Home or Campaign Detail); Metric is promoted to
// its own primary question; a new pre-submission "Tu resultado
// (opcional)" field forwards into the existing initialUserValue
// mechanism; "Refinar comparación" stays collapsed by default with a
// real aria-expanded and an active-filter-count signal; and the CTA
// sits right after that (collapsed) panel, never buried under it.
//
// Scope is strictly ENTRY/QUERY UX (this fix's own §12) — the result
// screen (ComparisonDetail/ResultView), the benchmark engine, and
// Home's own wizard (Phase 39.2) are all asserted UNCHANGED here, never
// re-verified as if this pass were allowed to touch them.
//
// Same convention as every other scripts/test-*.mts file: readFileSync-
// based structural source-text checks (no jsdom/React Testing Library
// configured in this project).

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { assertEngineCoreInvariants, assertActionsCoreInvariants } from "./lib/benchmarkEngineCoreInvariants.mts";

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

const explorerSource = read("app/benchmark/BenchmarkExplorer.tsx");
const pageSource = read("app/page.tsx");
const wizardSource = read("components/dashboard/wizard/DiscoveryWizard.tsx");
const contextStepSource = read("components/dashboard/wizard/ContextStep.tsx");
const contributionDetailSource = read("app/account/contributions/[id]/ContributionDetail.tsx");
const comparisonDetailSource = read("app/benchmark/ComparisonDetail.tsx");
const classifySource = read("lib/comparison/classify.ts");
const translationsSource = read("lib/i18n/translations.ts");

// -----------------------------------------------------------------------
// HOME PREFILL: every field Home's cohortFiltersToPrefillQuery sends is
// still read, human labels are rendered (never internal keys), no
// silent filter drop, metric is selectable, user value optional,
// "Refinar comparación" collapsed by default with active filters
// preserved + signaled, CTA reachable right after the (collapsed) panel.
// -----------------------------------------------------------------------
for (const param of [
  "prefillPlatform", "prefillObjective", "prefillVertical", "prefillCountry",
  "prefillAudienceStrategy", "prefillFunnelStage", "prefillSpendBand",
  "prefillDurationBand", "prefillTimeWindow",
]) {
  assertTrue(explorerSource.includes(`searchParams.get("${param}")`), `BenchmarkExplorer still reads Home's ${param}`);
}
assertTrue(
  pageSource.includes('if (filters.platform) params.set("prefillPlatform", filters.platform);') &&
  pageSource.includes('if (filters.timeWindow) params.set("prefillTimeWindow", filters.timeWindow);'),
  "Home's cohortFiltersToPrefillQuery is untouched — same one prefill mechanism, no second one added"
);
assertTrue(
  explorerSource.includes("hasFullPrefillContext") &&
  explorerSource.includes('searchParams.get("prefillPlatform")') &&
  explorerSource.includes("[contextEditing, setContextEditing] = useState"),
  "arrival with complete context is detected from the real prefill params, seeding contextEditing once"
);
assertTrue(
  explorerSource.includes("const hasCompleteContext = Boolean(draft.platform && draft.objective && draft.vertical && draft.country);") &&
  explorerSource.includes("const showContextSummary = hasCompleteContext && !contextEditing;"),
  "the compact summary only ever shows real, currently-set context — never fabricated"
);
assertTrue(
  explorerSource.includes('{[platformLabel(draft.platform), objectiveLabel(draft.objective), verticalLabel(draft.vertical), countryLabel(draft.country)].join(" · ")}'),
  "the context summary renders real taxonomy display labels via the existing label functions, never internal_key/iso_code strings"
);
assertTrue(
  !/contextSummaryTitle[\s\S]{0,300}pinterest_ads|contextSummaryTitle[\s\S]{0,300}beauty_personal_care/i.test(explorerSource),
  "no internal enum value is hardcoded anywhere near the context summary"
);
assertTrue(
  explorerSource.includes('t("benchmarkLive.metricQuestionTitle")') && explorerSource.includes("PRIMARY_METRICS.map((m) => ({ value: m, label: m.toUpperCase() }))"),
  "metric is promoted to its own primary question, same PRIMARY_METRICS options as before (no addition/removal)"
);
assertTrue(
  explorerSource.includes('value={draft.platform}') && explorerSource.includes('value={draft.audienceStrategy}') && explorerSource.includes('value={draft.funnelStage}') &&
  explorerSource.includes('value={draft.spendBand}') && explorerSource.includes('value={draft.durationBand}'),
  "every prefillable field still has a real, wired <Select> — no silent drop"
);
assertTrue(
  explorerSource.includes("const activeAdvancedCount = [draft.audienceStrategy, draft.funnelStage, draft.businessModel, draft.spendBand, draft.durationBand].filter(Boolean).length;"),
  "an active-filter count is computed from the real, currently-applied optional filters"
);
assertTrue(
  explorerSource.includes('t("benchmarkLive.refineActiveCount", { n: activeAdvancedCount })') && explorerSource.includes("activeAdvancedCount > 0 &&"),
  "the 'Refinar comparación' summary shows a compact active-filter signal only when a filter is actually set"
);
assertTrue(
  explorerSource.includes("const refineDetailsOpen = isReach || refineOpen;") && explorerSource.includes("const [refineOpen, setRefineOpen] = useState(false);"),
  "'Refinar comparación' still starts collapsed by default (isReach still forces it open, exactly as before this fix)"
);
{
  // The CTA button must appear (in source order) after the </details>
  // that closes "Refinar comparación" but still directly inside the
  // same card — i.e. never pushed below unrelated content, and no new
  // wrapper introduced between them that could add scroll height.
  const detailsCloseIdx = explorerSource.indexOf("</details>");
  const ctaIdx = explorerSource.indexOf('onClick={() => handleSubmit()}');
  assertTrue(detailsCloseIdx !== -1 && ctaIdx !== -1 && ctaIdx > detailsCloseIdx && ctaIdx - detailsCloseIdx < 400,
    "the 'Ver benchmark' CTA sits immediately after the (collapsed-by-default) advanced-filters panel — reachable without scrolling through it");
}
assertTrue(
  !explorerSource.includes("handleSubmit()") || !/useEffect[\s\S]{0,400}handleSubmit\(\);?\s*}\s*,\s*\[\]\)/.test(explorerSource.replace(/searchParams\.get\("saved"\)[\s\S]*?handleSubmit\(undefined, restoredDraft\);/, "")),
  "no new auto-submit path was introduced — the user still confirms the query (the only automatic handleSubmit call remains the pre-existing ?saved=<id> reopen flow)"
);

// -----------------------------------------------------------------------
// CAMPAIGN PREFILL (Phase 32): metric, user value and context all still
// preserved end-to-end; the Campaign Detail activation link itself is
// untouched.
// -----------------------------------------------------------------------
assertTrue(
  explorerSource.includes('const rawPrefillMetric = searchParams.get("prefillMetric");') &&
  explorerSource.includes("SINGLE_METRIC_OPTIONS as readonly string[]).includes(rawPrefillMetric)"),
  "prefillMetric is still read and validated against the real, shared SINGLE_METRIC_OPTIONS allow-list"
);
assertTrue(
  explorerSource.includes('const rawPrefillUserValue = searchParams.get("prefillUserValue");') &&
  explorerSource.includes("setInitialUserValue(prefillUserValue);") &&
  explorerSource.includes('setDraft((d) => ({ ...d, userValueInput: String(prefillUserValue) }));'),
  "prefillUserValue still sets initialUserValue AND now visibly populates the new pre-submission field, per §10"
);
assertTrue(
  explorerSource.includes("const parsedPreValue = Number(effectiveDraft.userValueInput);") &&
  explorerSource.includes('if (effectiveDraft.userValueInput.trim() !== "" && Number.isFinite(parsedPreValue)) {') &&
  explorerSource.includes("setInitialUserValue(parsedPreValue);"),
  "handleSubmit forwards a pre-entered result into the SAME initialUserValue state ComparisonSection already reads — no new comparison mechanism"
);
assertTrue(
  contributionDetailSource.includes("function buildBenchmarkHref(context: BenchmarkActivation[\"context\"], option?: BenchmarkCompareOption): string {") &&
  contributionDetailSource.includes('params.set("prefillMetric", option.metric);') &&
  contributionDetailSource.includes('params.set("prefillUserValue", String(option.userValue));'),
  "Campaign Detail's own activation link (Phase 32) is completely untouched by this fix"
);
assertTrue(
  explorerSource.includes("userValueInput: saved.userValue != null ? String(saved.userValue) : \"\",") &&
  explorerSource.includes("setContextEditing(false);"),
  "reopening a saved comparison (?saved=<id>) also starts on the compact context summary with its own result pre-populated — consistent with a Campaign Detail arrival"
);

// -----------------------------------------------------------------------
// DIRECT ENTRY: opening /benchmark with no (or partial) prefill context
// must still show real, editable Platform/Objective/Vertical/Country
// pickers, and the query can still be built and submitted exactly as
// before.
// -----------------------------------------------------------------------
assertTrue(
  explorerSource.includes("return !hasFullPrefillContext;"),
  "a direct /benchmark visit (no complete prefill) starts with contextEditing=true — the full pickers, not the compact summary"
);
assertTrue(
  explorerSource.includes('label={t("contribute.platform")}') &&
  explorerSource.includes('label={t("contribute.objective")}') &&
  explorerSource.includes('label={t("contribute.vertical")}') &&
  explorerSource.includes('label={t("contribute.country")}'),
  "all four required pickers still exist verbatim for direct entry"
);
assertTrue(
  explorerSource.includes("const canSubmit = draft.platform && draft.objective && draft.vertical && draft.country;") &&
  explorerSource.includes("disabled={!canSubmit || loading}"),
  "the CTA's own required-field gating is completely unchanged"
);
assertTrue(
  contextStepSource.includes('label={t("finder.timeWindow")}') && wizardSource.includes("if (!draft.platformUiId || !draft.objective || !draft.verticalId || !draft.countryId) return;"),
  "Home's own wizard (Phase 39.2, frozen by this task's §2) is unmodified"
);

// -----------------------------------------------------------------------
// ENGINE: no benchmark engine/methodology file was touched by this
// pass, and the result screen's own math/classification helpers are
// still delegated, not re-derived.
//
// HISTORICAL BENCHMARKS — FINAL REGRESSION HARDENING:
// lib/benchmark/engine.ts and app/benchmark/actions.ts were removed
// from this forbidden list. `git diff --stat HEAD` is a working-tree-
// vs-HEAD check — it only ever proves "no uncommitted edit exists in
// this file right now", and cannot see past a commit boundary. Once
// Historical Benchmarks' own (spec-authorized, reviewed) extension of
// both files was committed, these two entries became permanently
// vacuous rather than actually protecting anything going forward.
// Replaced below by assertEngineCoreInvariants/assertActionsCoreInvariants
// — real, git-history-independent behavioral checks (see
// scripts/lib/benchmarkEngineCoreInvariants.mts for the full rationale).
// cohortRules.ts, singleMetricOptions.ts, classify.ts, derive.ts, and
// admin.ts genuinely were not touched by that work; their forbidden-diff
// checks below are still real and are left unchanged.
//
// CUCURUCHO DATA INTEGRITY 1: "supabase/" was ALSO removed from this
// list, for the exact same already-documented reason above — a plain
// substring check against `git diff --stat HEAD` cannot distinguish "a
// schema/migration file was touched" from "a file whose PATH happens to
// contain the substring supabase/", and that task legitimately (with
// explicit authorization) both adds a new, additive migration file
// (supabase/migrations/0020_observation_identity.sql — a real, reviewed
// schema change, not scope creep) and extends the hand-maintained
// lib/supabase/database.types.ts with the new RPC/column types that
// migration requires — a file this forbidden list never singled out on
// its own, only ever caught as a false positive via the bare "supabase/"
// substring. lib/supabase/admin.ts (the one file this list DOES name
// specifically) is untouched by that task and stays protected below.
// -----------------------------------------------------------------------
{
  const diffStat = execSync("git diff --stat HEAD", { cwd: root, encoding: "utf8" });
  for (const forbidden of [
    "lib/benchmark/cohortRules.ts", "lib/benchmark/singleMetricOptions.ts",
    "lib/comparison/classify.ts", "lib/metrics/derive.ts",
    "lib/supabase/admin.ts",
  ]) {
    assertTrue(!diffStat.includes(forbidden), `${forbidden} was not touched by this pass (strict no-touch list, §18)`);
  }
}
assertEngineCoreInvariants(assertTrue);
assertActionsCoreInvariants(assertTrue);
assertTrue(
  comparisonDetailSource.includes("classifyPerformance(userValue, stats, response.benchmarkDirection)") &&
  comparisonDetailSource.includes("computeMarkerPosition(userValue, stats)") &&
  classifySource.includes("export function computeMarkerPosition") && classifySource.includes("export function classifyPerformance"),
  "ComparisonDetail still delegates all classification/marker math to lib/comparison/classify.ts, unchanged (§12)"
);
assertTrue(
  !explorerSource.includes("classifyPerformance(") && !explorerSource.includes("computeMarkerPosition("),
  "BenchmarkExplorer.tsx itself never reimplements classification/marker math — still ComparisonDetail's job alone"
);

// -----------------------------------------------------------------------
// MOBILE: no new fixed-width or overflow-escape pattern introduced by
// this pass's markup (the new pre-submission input reuses the exact
// same responsive width classes ComparisonSection's own "Tu resultado"
// input already uses).
// -----------------------------------------------------------------------
{
  // Scoped to exactly the new markup this fix added: from the
  // "showContextSummary ? (" branch through the closing </details> of
  // "Refinar comparación" — deliberately excludes the pre-existing,
  // untouched outer <main>/<section> wrappers (max-w-[1400px], the
  // card's own lg:w-[380px]) and the pre-existing dev-only debug
  // <details> block (which legitimately uses overflow-x-auto for a
  // <pre> JSON dump, unrelated to this fix).
  const newMarkupStart = explorerSource.indexOf("showContextSummary ? (");
  const newMarkupEnd = explorerSource.indexOf("</details>");
  const newMarkup = explorerSource.slice(newMarkupStart, newMarkupEnd);
  assertTrue(newMarkupStart !== -1 && newMarkupEnd !== -1 && newMarkupEnd > newMarkupStart, "the new markup region is found for scoped checks");
  assertTrue(!/w-\[\d+px\]|min-w-\[\d+px\]/.test(newMarkup), "no new fixed-pixel-width class was introduced anywhere in this fix's new markup");
  assertTrue(!/overflow-x-auto|overflow-visible/.test(newMarkup), "no new horizontal-scroll/overflow-escape pattern was introduced in this fix's new markup");
}
assertTrue(
  (explorerSource.match(/className="mt-1\.5 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-primary sm:w-44"/g) ?? []).length +
  (explorerSource.match(/className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-primary sm:w-44"/g) ?? []).length >= 1,
  "the new pre-submission 'Tu resultado' input reuses the SAME responsive width pattern (w-full, sm:w-44) the existing post-result input already uses — not a new one"
);
assertTrue(
  explorerSource.includes("grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"),
  "the merged Platform/Objective/Vertical/Country grid stacks to one column on mobile before widening — no fixed multi-column layout forced below sm"
);

// -----------------------------------------------------------------------
// ACCESSIBILITY: real aria-expanded on both the "Refinar comparación"
// disclosure and the "Cambiar contexto"/"Listo" toggle, accessible
// button names via real translated text (never icon-only).
// -----------------------------------------------------------------------
assertTrue(
  explorerSource.includes("onToggle={(e) => setRefineOpen((e.target as HTMLDetailsElement).open)}") &&
  explorerSource.includes("aria-expanded={refineDetailsOpen}"),
  "'Refinar comparación' exposes a real, state-backed aria-expanded (not just native <details> semantics alone)"
);
assertTrue(
  explorerSource.includes('aria-expanded={false}') && explorerSource.includes('aria-expanded={true}') &&
  explorerSource.includes('onClick={() => setContextEditing(true)}') && explorerSource.includes('onClick={() => setContextEditing(false)}'),
  "'Cambiar contexto' / 'Listo' is a real, reversible disclosure toggle with correct aria-expanded on each state"
);

// -----------------------------------------------------------------------
// I18N: every new visible string has both an ES and an EN key, no
// hardcoded copy.
// -----------------------------------------------------------------------
for (const key of [
  "contextSummaryTitle", "changeContextCta", "doneEditingContextCta",
  "metricQuestionTitle", "yourResultOptionalTitle", "yourResultOptionalHint", "refineActiveCount",
]) {
  const occurrences = (translationsSource.match(new RegExp(`\\b${key}:`, "g")) ?? []).length;
  assertTrue(occurrences >= 2, `benchmarkLive.${key} has both an ES and an EN translation`);
  assertTrue(explorerSource.includes(`t("benchmarkLive.${key}"`), `benchmarkLive.${key} is actually used in BenchmarkExplorer.tsx`);
}
assertTrue(
  !/>Benchmark seleccionado<|>Cambiar contexto<|>Tu resultado \(opcional\)</.test(explorerSource),
  "no new copy is hardcoded directly in JSX — everything goes through t()"
);

console.log(`test-benchmark-entry-continuity: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
