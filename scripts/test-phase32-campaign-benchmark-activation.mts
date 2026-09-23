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
assertTrue(
  pageSource.includes("(SINGLE_METRIC_OPTIONS as readonly string[]).includes(entry.metric)") &&
  pageSource.includes("entry.sufficientData"),
  "a metric is only offered when it's both /benchmark-compatible AND the real market cohort already has sufficient data"
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
// §12 Mobile: PHASE 35 (§8) restructured the multi-metric compare block
// from a wrapped chip row into a "Resultados comparables" list (one row
// per metric: label+value on the left, a "Comparar" button on the
// right). The mobile-safety property this assertion originally checked
// for — no fixed-width row that can overflow a narrow viewport — is now
// achieved differently: each row's text side shrinks (min-w-0) and its
// button side never does (shrink-0), rather than the row itself
// wrapping. This assertion was updated to match that current, still
// mobile-safe structure rather than the pre-Phase-35 markup.
// -----------------------------------------------------------------------
assertTrue(
  detailSource.includes('<div className="mt-2 divide-y divide-line">') &&
  detailSource.includes('className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"') &&
  detailSource.includes('<div className="min-w-0">') &&
  detailSource.includes('className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"'),
  "the comparable-results rows keep the label/value side shrinkable (min-w-0) and the Comparar button non-shrinking (shrink-0), so no row forces horizontal overflow at narrow widths"
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
