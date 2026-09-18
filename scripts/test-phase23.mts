// Phase 23 tests — the shared "intelligence layer" (lib/intelligence/):
// benchmark next-action/no-data resolvers, diagnostic action mapping,
// media completeness/next-action/rate-card-change sentences, planner
// summary/grouped-warnings, and contribution success actions. Pure
// functions only, no DOM/Supabase — mirrors the Phase 20-22 test style.

import { resolveBenchmarkNextActions, resolveNoDataAction, resolveDiagnosticActionKey } from "../lib/intelligence/benchmarkIntelligence";
import { resolveMediaCompleteness, resolveMediaNextAction, describeRateCardChange } from "../lib/intelligence/mediaIntelligence";
import { buildPlanSummaryLines, groupPlannerWarnings, countStaleSignals } from "../lib/intelligence/plannerIntelligence";
import { resolveContributionSuccessActions } from "../lib/intelligence/contributionIntelligence";

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
// §6/§7: benchmark next actions & no-data action resolver
// ---------------------------------------------------------------------
assertEqual(resolveBenchmarkNextActions("success"), ["explore_media", "build_plan"], "a real result offers exactly explore+plan, never a ranking claim");
assertEqual(resolveBenchmarkNextActions("no_data"), ["contribute_data"], "no_data offers exactly one action: contribute");
assertEqual(resolveBenchmarkNextActions("insufficient_sample"), ["contribute_data"], "insufficient_sample offers exactly one action: contribute");
assertEqual(resolveBenchmarkNextActions("error"), [], "an error state offers no navigation actions");
assertEqual(resolveBenchmarkNextActions("methodology_block"), [], "a methodology block offers no navigation actions");

assertEqual(resolveNoDataAction(true), "expand_filters", "a real relaxation suggestion means the one useful action is expanding filters");
assertEqual(resolveNoDataAction(false), "contribute_data", "no relaxation suggestion available means the one useful action is contributing data");

// ---------------------------------------------------------------------
// §8: diagnostic category -> generic follow-up action key
// ---------------------------------------------------------------------
assertEqual(resolveDiagnosticActionKey("entrega"), "actionEntrega", "entrega category maps to its own action key");
assertEqual(resolveDiagnosticActionKey("interaccion"), "actionInteraccion", "interaccion category maps to its own action key");
assertEqual(resolveDiagnosticActionKey("conversion"), "actionConversion", "conversion category maps to its own action key");
assertEqual(resolveDiagnosticActionKey("rentabilidad"), "actionRentabilidad", "rentabilidad category maps to its own action key");

// ---------------------------------------------------------------------
// §10/§11: media completeness state & next-action resolver
// ---------------------------------------------------------------------
assertEqual(resolveMediaCompleteness(true, true), "full", "public metrics + rate card present -> full");
assertEqual(resolveMediaCompleteness(true, false), "partial", "only public metrics present -> partial");
assertEqual(resolveMediaCompleteness(false, true), "partial", "only rate card present -> partial");
assertEqual(resolveMediaCompleteness(false, false), "limited", "neither present -> limited");

assertEqual(resolveMediaNextAction(false, false), "contribute_rate_card", "missing rate card takes priority as the one secondary action");
assertEqual(resolveMediaNextAction(false, true), "contribute_public_data", "rate card present, public data missing -> that secondary action");
assertEqual(resolveMediaNextAction(true, true), null, "both present -> no secondary action at all (never force a CTA)");

// ---------------------------------------------------------------------
// §13: rate-card change sentence — only from a REAL resolved change
// ---------------------------------------------------------------------
assertEqual(describeRateCardChange(null, "es"), "", "no change at all (no previous compatible rate card) renders nothing");
assertTrue(
  describeRateCardChange({ absolute: 1200, percent: 12 }, "es").includes("12%") && describeRateCardChange({ absolute: 1200, percent: 12 }, "es").includes("mayor"),
  "a positive percent change is described as higher, with the real percentage"
);
assertTrue(
  describeRateCardChange({ absolute: -500, percent: -8 }, "es").includes("menor"),
  "a negative percent change is described as lower"
);
assertEqual(
  describeRateCardChange({ absolute: 0, percent: 0 }, "es"),
  "Este tarifario no cambió respecto del anterior comparable.",
  "a zero change is stated as unchanged, not 0% higher"
);

// ---------------------------------------------------------------------
// §14: plan summary lines — no score, no winner, only real counts
// ---------------------------------------------------------------------
assertEqual(buildPlanSummaryLines({ selectedCount: 0, withRateCardCount: 0, budgetValid: false, overBudget: false, formattedBudgetDelta: null }), [], "nothing selected -> no summary at all");

const summaryAllGood = buildPlanSummaryLines(
  { selectedCount: 2, withRateCardCount: 2, budgetValid: true, overBudget: false, formattedBudgetDelta: "ARS 50.000" },
  "es"
);
assertEqual(summaryAllGood.length, 3, "2 selected, both with rate card, valid budget -> selected + rate-card + remaining lines (no excluded line)");
assertTrue(summaryAllGood[0].includes("2"), "first line states the selected count");
assertTrue(summaryAllGood[summaryAllGood.length - 1].includes("Quedan"), "last line states remaining budget when under budget");

const summaryWithExclusion = buildPlanSummaryLines(
  { selectedCount: 3, withRateCardCount: 2, budgetValid: true, overBudget: true, formattedBudgetDelta: "ARS 10.000" },
  "es"
);
assertEqual(summaryWithExclusion.length, 4, "1 excluded from budget math -> adds the exclusion line on top of the other three");
assertTrue(summaryWithExclusion.some((l) => l.includes("no puede incluirse")), "the exclusion line uses singular phrasing for exactly 1");
assertTrue(summaryWithExclusion[summaryWithExclusion.length - 1].includes("Excede"), "over-budget is stated as exceeding, never silently absorbed");

// ---------------------------------------------------------------------
// §15: grouped warnings — fixed order, zero-count groups omitted
// ---------------------------------------------------------------------
assertEqual(
  groupPlannerWarnings({ pairwiseReasons: [], missingRateCardCount: 0, staleSignalCount: 0 }),
  [],
  "no warnings at all when nothing is wrong"
);
assertEqual(
  groupPlannerWarnings({
    pairwiseReasons: [["currency_mismatch"], ["pricing_unit_mismatch"], ["currency_mismatch", "pricing_unit_mismatch"]],
    missingRateCardCount: 2,
    staleSignalCount: 1,
  }),
  [
    { id: "currency_mismatch", count: 2 },
    { id: "pricing_unit_mismatch", count: 2 },
    { id: "missing_rate_card", count: 2 },
    { id: "stale_public_data", count: 1 },
  ],
  "every real warning is grouped and counted, in the fixed §15 order"
);

const now = new Date("2026-09-17T00:00:00Z");
assertEqual(countStaleSignals([{ observed_at: "2026-09-10" }], now, 90), 0, "a signal from 7 days ago is not stale at a 90-day threshold");
assertEqual(countStaleSignals([{ observed_at: "2026-01-01" }], now, 90), 1, "a signal from ~8 months ago is stale at a 90-day threshold");

// ---------------------------------------------------------------------
// §19: contribution success actions — at most 2, contextual per kind
// ---------------------------------------------------------------------
assertEqual(resolveContributionSuccessActions("campaign_results"), ["view_benchmarks", "view_contributions"], "campaign results point back at benchmarks");
assertEqual(resolveContributionSuccessActions("public_metrics"), ["explore_media", "view_contributions"], "public metrics point at the media catalog, not benchmarks");
assertEqual(resolveContributionSuccessActions("rate_card"), ["explore_media", "view_contributions"], "rate cards point at the media catalog, not benchmarks");
assertEqual(resolveContributionSuccessActions("bulk_import"), ["explore_media", "view_contributions"], "bulk import follows the same commercial-data path");
assertTrue(resolveContributionSuccessActions("campaign_results").length <= 2, "never more than 2 relevant actions at once");

console.log(`\n${failed === 0 ? "ALL" : `${failed} of ${passed + failed}`} PHASE 23 TESTS ${failed === 0 ? "PASSED" : "FAILED"} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exit(1);
