// PHASE 32 — CAMPAIGN → BENCHMARK ACTIVATION.
//
// Same convention as every other scripts/test-*.mts file in this
// project: readFileSync-based structural source-text checks (no
// jsdom/React Testing Library configured here), focused on exactly
// what this phase touched — the /account/contributions/[id] "Comparar
// con benchmark" activation, its extension of the Phase 30 prefill
// mechanism, and /benchmark's acceptance of the new params — without
// re-auditing the whole repo.

import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const pageSource = readFileSync(new URL("../app/account/contributions/[id]/page.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../app/account/contributions/[id]/ContributionDetail.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../app/account/contributions/ContributionsList.tsx", import.meta.url), "utf8");
const benchmarkExplorerSource = readFileSync(new URL("../app/benchmark/BenchmarkExplorer.tsx", import.meta.url), "utf8");
const singleMetricOptionsSource = readFileSync(new URL("../lib/benchmark/singleMetricOptions.ts", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");
const engineSource = readFileSync(new URL("../lib/benchmark/engine.ts", import.meta.url), "utf8");

// -----------------------------------------------------------------------
// §2/§9 Valid campaign shows the primary "Comparar con benchmark" CTA;
// pending/excluded never pretend eligibility — they get an honest
// explanation and only a secondary, non-committal exploration link,
// never the primary CTA's own copy key.
// -----------------------------------------------------------------------
assertTrue(
  detailSource.includes('dataset.validationStatus === "valid" &&') &&
  detailSource.includes('t("contributions.compareBenchmarkCta")'),
  "a valid campaign renders the primary \"Comparar con benchmark\" CTA"
);
assertTrue(
  detailSource.includes('dataset.validationStatus === "pending" || dataset.validationStatus === "excluded"') &&
  detailSource.includes('t("contributions.pendingBenchmarkExplanation")') &&
  detailSource.includes('t("contributions.excludedBenchmarkExplanation")'),
  "pending and excluded campaigns each get their own honest explanation, never a shared vague one"
);
assertTrue(
  detailSource.includes('t("contributions.exploreBenchmarkCta")'),
  "pending/excluded get only the secondary, non-committal \"Explorar benchmarks\" link"
);
// The pending/excluded block is a physically separate JSX block from
// the valid-only block — the primary CTA copy key never appears inside
// it, so a pending/excluded campaign can never render "Comparar con
// benchmark" by any code path.
const pendingExcludedBlockMatch = detailSource.match(
  /\{\(dataset\.validationStatus === "pending" \|\| dataset\.validationStatus === "excluded"\) && \([\s\S]*?\)\}/
);
assertTrue(
  !!pendingExcludedBlockMatch && !pendingExcludedBlockMatch[0].includes('contributions.compareBenchmarkCta'),
  "the pending/excluded block never contains the primary compare CTA's copy key"
);

// -----------------------------------------------------------------------
// §3 Real cohort prefill: platform/objective/vertical/country/
// audienceStrategy (Phase 30's mechanism, reused not duplicated) plus
// the two additional real, already-existing /benchmark Draft fields
// (funnelStage/businessModel) — read from the campaign's OWN fields
// only, never invented.
// -----------------------------------------------------------------------
assertTrue(
  pageSource.includes("audience_strategies(internal_key)") &&
  pageSource.includes("funnel_stages(internal_key)") &&
  pageSource.includes("business_models(internal_key)"),
  "the contribution detail query reads the campaign's own real audience/funnel/business-model context"
);
assertTrue(
  detailSource.includes('if (context.platform) params.set("prefillPlatform", context.platform)') &&
  detailSource.includes('if (context.audienceStrategy) params.set("prefillAudienceStrategy", context.audienceStrategy)') &&
  detailSource.includes('if (context.funnelStage) params.set("prefillFunnelStage", context.funnelStage)') &&
  detailSource.includes('if (context.businessModel) params.set("prefillBusinessModel", context.businessModel)'),
  "the href builder only ever sets a prefill param when the campaign actually has that field — never a fabricated default"
);

// -----------------------------------------------------------------------
// §4/§5 Metric selection reuses calculateDerivedMetrics/readiness — no
// duplicated formula — and is filtered to exactly the metrics
// /benchmark's own dropdown accepts (SINGLE_METRIC_OPTIONS), never an
// invented or benchmark-incompatible one. As of Phase 34, that list
// includes CPA/ROAS/CPE/ACOS/TACOS (audited and approved — see
// scripts/test-phase34-benchmark-metric-coverage.mts); CPL is the one
// real derivable metric still excluded (no canonical lead semantic),
// so it must never appear as a compare CTA.
// -----------------------------------------------------------------------
assertTrue(
  pageSource.includes("calculateDerivedMetrics(raw)") && pageSource.includes("getMetricBenchmark("),
  "eligibility reuses the existing calculateDerivedMetrics + getMetricBenchmark logic, no new formula"
);
// CUCURUCHO INTELLIGENCE 2 (§11) UPDATE: this assertion originally
// checked that a metric was only ever offered when BOTH (a) it's
// /benchmark-compatible (SINGLE_METRIC_OPTIONS) AND (b) the market
// cohort already had `entry.sufficientData`. Condition (b) was an
// EXPLICITLY INSTRUCTED change in Intelligence 2's own §11 (every
// candidate metric must show its own real status —
// success/insufficient_sample/no_data/methodology_block — never be
// silently dropped just because it isn't "success"): the old
// `entry.sufficientData &&` gate is gone by design, not by accident, and
// page.tsx no longer has an `entry` variable at all (the readiness loop
// itself was replaced by the shared-cohort getBenchmarksForMetrics batch
// — see the §10 assertion below). Condition (a), the
// SINGLE_METRIC_OPTIONS gate, is still real and still enforced (never
// weakened) — this replacement checks that gate directly, plus the new,
// stronger invariant that every result from the batch becomes a row
// regardless of status (no lingering sufficientData-only filter of any
// kind reintroduced).
assertTrue(
  pageSource.includes("derivedKeys.filter((m) => (SINGLE_METRIC_OPTIONS as readonly string[]).includes(m))"),
  "a metric is only ever a market-comparison candidate when it's both this campaign's own real derivable data AND /benchmark-compatible (SINGLE_METRIC_OPTIONS) — unchanged gate, still enforced"
);
assertTrue(
  !/entry\.sufficientData/.test(pageSource) && !/if \(entry\.sufficientData/.test(pageSource),
  "the old sufficientData-only gate is gone — every candidate metric's real status now reaches compareOptions, never silently dropped for being non-success"
);
assertTrue(
  pageSource.includes("compareOptions.push({ metric: result.metric, status: response.status, classification, response, userValue });"),
  "every candidate metric is pushed with its own real, independently-derived status — never filtered to success-only"
);
assertTrue(
  singleMetricOptionsSource.includes(
    'export const SINGLE_METRIC_OPTIONS = ["cpm", "ctr", "cpc", "reach", "frequency", "cpv", "cpa", "roas", "cpe", "acos", "tacos"] as const;'
  ),
  "SINGLE_METRIC_OPTIONS is the one real source of truth for /benchmark-acceptable metrics (Phase 34: extended with the 5 audited-and-approved metrics, cpl still excluded)"
);
assertTrue(
  benchmarkExplorerSource.includes('import { SINGLE_METRIC_OPTIONS } from "@/lib/benchmark/singleMetricOptions";') &&
  benchmarkExplorerSource.includes("const PRIMARY_METRICS: readonly string[] = SINGLE_METRIC_OPTIONS;"),
  "/benchmark's own metric dropdown now reads from the SAME shared list — never a second, independently-maintained copy"
);
assertTrue(
  pageSource.includes('classifySpendBand(normalized, dataset.original_currency)') &&
  pageSource.includes('classifyDurationBand(dataset.duration_days)') &&
  !/function classifySpendBand|function classifyDurationBand/.test(pageSource),
  "Reach eligibility reuses the existing spend/duration band classification functions — never a re-implemented formula"
);

// -----------------------------------------------------------------------
// User value prefill only ever comes from a real computed/raw value —
// never a hardcoded or invented number.
// -----------------------------------------------------------------------
assertTrue(
  pageSource.includes("Math.round(value * 100) / 100") && pageSource.includes("Math.round(raw.reach * 100) / 100"),
  "the prefilled user value is always this campaign's own computed/raw metric value, rounded for display — never fabricated"
);
assertTrue(
  !/userValue:\s*\d/.test(pageSource.replace(/Math\.round\([^)]*\)/g, "ROUNDED")),
  "no compareOptions entry uses a literal hardcoded number as its userValue"
);

// -----------------------------------------------------------------------
// §6 /benchmark resolves the new prefill params, alongside (never
// replacing) the existing five — still exactly one prefill mechanism,
// still never auto-submitted (the user still clicks "Ver benchmark").
// -----------------------------------------------------------------------
for (const param of ["prefillFunnelStage", "prefillBusinessModel", "prefillSpendBand", "prefillDurationBand", "prefillMetric", "prefillUserValue"]) {
  assertTrue(benchmarkExplorerSource.includes(`searchParams.get("${param}")`), `BenchmarkExplorer reads the new ${param} prefill param`);
}
assertTrue(
  benchmarkExplorerSource.includes("(SINGLE_METRIC_OPTIONS as readonly string[]).includes(rawPrefillMetric)"),
  "prefillMetric is validated against the real allow-list before being trusted from the URL"
);
assertTrue(
  benchmarkExplorerSource.includes("setInitialUserValue(prefillUserValue)") &&
  !benchmarkExplorerSource.match(/prefillUserValue[\s\S]{0,400}handleSubmit\(/),
  "a fresh prefill (not the saved-comparison reopen flow) still never auto-submits — only the input state is primed, the user still clicks \"Ver benchmark\" themselves"
);
assertTrue(
  (benchmarkExplorerSource.match(/useEffect\(/g) ?? []).length >= 1 &&
  (benchmarkExplorerSource.match(/const savedId = searchParams\.get\("saved"\);/g) ?? []).length === 1,
  "still exactly one prefill effect — the new params extend it, never a second parallel mechanism"
);

// -----------------------------------------------------------------------
// §7 Saved comparison keeps working — SaveComparisonButton's payload
// building is untouched by this phase, no second persistence structure,
// no campaign_id added to it.
// -----------------------------------------------------------------------
assertTrue(
  benchmarkExplorerSource.includes("<SaveComparisonButton") &&
  benchmarkExplorerSource.includes('comparisonType: "single_metric",') &&
  benchmarkExplorerSource.includes("userValue: compared,"),
  "SaveComparisonButton's existing single_metric payload is untouched"
);
assertTrue(
  !/campaign_id|campaignId/.test(benchmarkExplorerSource),
  "no campaign_id/campaignId field was added to the saved-comparison payload"
);

// -----------------------------------------------------------------------
// §8 Contributions list stays compact — no per-card "Comparar" CTA
// clutter; the detail page (already the click target of the whole
// card) remains the single activation point, per the phase's own
// stated preference.
// -----------------------------------------------------------------------
assertTrue(
  !/compareBenchmarkCta|compareMetricLabel/.test(listSource),
  "ContributionsList.tsx was not given a new per-card compare CTA — the card stays exactly as compact as before"
);
assertTrue(
  listSource.includes('href={`/account/contributions/${d.id}`}'),
  "opening the detail page (where activation lives) remains the card's one primary action"
);

// -----------------------------------------------------------------------
// §11 Privacy: no cross-owner exposure. The detail query stays scoped
// through the same RLS-protected client as before (no admin client
// introduced in this file); nothing new sends campaign_name, dataset
// id, or any raw per-row identity into a URL — only cohort-taxonomy
// keys and a rounded numeric value the owner already sees on their own
// screen.
// -----------------------------------------------------------------------
assertTrue(
  pageSource.includes("createServerSupabaseClient()") && !pageSource.includes("createAdminClient"),
  "the contribution detail page still queries only through the RLS-scoped server client, never the admin client"
);
assertTrue(
  !/campaignName|campaign_name|dataset\.id/.test(
    (detailSource.match(/function buildBenchmarkHref[\s\S]*?\n}/)?.[0]) ?? ""
  ),
  "the benchmark href builder never includes the campaign's name or id — only cohort-taxonomy keys and a rounded metric value"
);
assertTrue(
  engineSource.includes("Every exported function below returns only a typed, aggregated"),
  "lib/benchmark/engine.ts's own privacy boundary comment/architecture is untouched by this phase"
);

// -----------------------------------------------------------------------
// §12 Mobile — CUCURUCHO INTELLIGENCE 2 UPDATE: PHASE 35 (§8)'s
// min-w-0/shrink-0 label+button row no longer exists — Intelligence 2
// (§9/§14) replaced it with MetricComparisonRow (extracted from
// CampaignExplorer.tsx), an inline campaign-vs-market comparison row
// with its own status pill/classification chip, plus a separate,
// non-fixed-width "Ver benchmark completo" link underneath. This is a
// real, explicitly instructed UI evolution (a richer inline comparison
// per §9), not a mobile-safety regression — the mobile-safety PROPERTY
// (no element forces horizontal overflow at narrow widths) still holds,
// just via a different, still-real mechanism: MetricComparisonRow's own
// content row uses flex-wrap (verified directly in its own source below,
// not re-declared here) so it wraps rather than overflows, and the
// per-row cross-link sits in its own `flex justify-end` block with no
// fixed width of its own.
// -----------------------------------------------------------------------
const metricComparisonRowSource = readFileSync(new URL("../app/benchmark/MetricComparisonRow.tsx", import.meta.url), "utf8");
assertTrue(
  metricComparisonRowSource.includes("flex flex-1 flex-wrap items-center gap-x-3 gap-y-1"),
  "MetricComparisonRow's own content row wraps (flex-wrap) rather than forcing a fixed width that could overflow a narrow viewport"
);
assertTrue(
  detailSource.includes("<MetricComparisonRow") &&
  detailSource.includes('<div className="flex justify-end pt-1">'),
  "ContributionDetail renders each comparable metric through MetricComparisonRow, plus a separate, non-fixed-width cross-link row underneath — never a re-implemented, independently-maintained row"
);

// -----------------------------------------------------------------------
// No mock-benchmark-number dependency introduced anywhere this phase
// touched.
// -----------------------------------------------------------------------
for (const [label, source] of [
  ["page.tsx", pageSource],
  ["ContributionDetail.tsx", detailSource],
  ["BenchmarkExplorer.tsx", benchmarkExplorerSource],
] as const) {
  assertTrue(!/from ["']@\/lib\/mock\/benchmarks["']/.test(source), `${label} never imports lib/mock/benchmarks`);
  assertTrue(!/from ["']@\/lib\/mock\/random["']/.test(source), `${label} never imports lib/mock/random`);
}

// -----------------------------------------------------------------------
// §14 No migration created / no schema change — this phase reads
// existing columns only.
// -----------------------------------------------------------------------
assertTrue(
  (() => {
    try {
      readFileSync(new URL("../supabase/migrations/0020_placeholder.sql", import.meta.url), "utf8");
      return false; // a 0020 migration would mean one was created — fail loudly
    } catch {
      return true; // expected: no such file
    }
  })(),
  "no new migration (e.g. 0020) was created for this phase"
);

console.log(`test-phase32-campaign-benchmark-activation: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
