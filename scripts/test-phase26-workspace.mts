// PHASE 26 — DATA WORKSPACE & REAL-USAGE OPERATING MODE.
//
// Focused tests for the new pure logic (lib/contribute/coverage.ts,
// lib/contribute/dataQuality.ts) plus structural source-text checks for
// the cross-link wiring (§8/§9), the new-user vs. returning-user
// workspace states (§13/§14), and owner-only contribution summaries
// (§10/§11) — same real-import + readFileSync pattern already
// established by scripts/test-mobile-responsive.mts and
// scripts/test-phase24-multiplatform-import.mts (no jsdom/React Testing
// Library configured in this project).

import { readFileSync } from "node:fs";
import { computeDataCoverage, computeDataGaps, groupRecentImports, DERIVED_METRIC_LABELS } from "../lib/contribute/coverage";
import { assessDatasetQuality, flagSuspectedDuplicates, type DatasetQualityInput } from "../lib/contribute/dataQuality";

let passed = 0;
let failed = 0;
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`); }
}
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

// ---------------------------------------------------------------------
// §4: Data Coverage — reuses derive.ts's own formulas, no arbitrary
// score. A campaign missing a required input for a metric simply never
// counts toward it.
// ---------------------------------------------------------------------
{
  const datasets = [
    { id: "a", raw: { ad_spend: 100, impressions: 1000, clicks: 20 } }, // cpm, ctr, cpc
    { id: "b", raw: { ad_spend: 200, impressions: 2000 } }, // cpm only (no clicks)
    { id: "c", raw: { ad_spend: 300, attributed_revenue: 900 } }, // roas, acos
  ];
  const coverage = computeDataCoverage(datasets);
  const byMetric = new Map(coverage.map((c) => [c.metric, c.campaignCount]));
  assertEqual(byMetric.get("cpm"), 2, "CPM counts every campaign with both spend and impressions");
  assertEqual(byMetric.get("ctr"), 1, "CTR counts only the campaign that also has clicks");
  assertEqual(byMetric.get("cpc"), 1, "CPC counts only the campaign that also has clicks");
  assertEqual(byMetric.get("roas"), 1, "ROAS counts only the campaign with attributed revenue");
  assertEqual(byMetric.get("acos"), 1, "ACOS counts only the campaign with attributed revenue");
  assertTrue(!byMetric.has("tacos"), "a metric with zero eligible campaigns is never listed at all — never a fabricated zero row");
}

// ---------------------------------------------------------------------
// §5: Data Gaps — every campaign already has ad_spend (required at
// import); a gap is the ONE other field blocking a real derive.ts
// formula, never a fabricated recommendation.
// ---------------------------------------------------------------------
{
  const datasets = [
    { id: "a", raw: { ad_spend: 100, impressions: 1000 } }, // has spend+impressions, no clicks
    { id: "b", raw: { ad_spend: 200, impressions: 2000 } }, // same
    { id: "c", raw: { ad_spend: 300, impressions: 3000, clicks: 10, attributed_revenue: 900 } }, // fully covered
  ];
  const gaps = computeDataGaps(datasets);
  const clicksGap = gaps.find((g) => g.missingField === "clicks");
  assertTrue(!!clicksGap, "a 'missing clicks' gap is reported when campaigns lack clicks");
  assertEqual(clicksGap?.campaignCount, 2, "exactly the 2 campaigns without clicks are counted — never all 3");
  assertEqual(clicksGap?.unlocksMetrics.sort(), ["cpc", "ctr"].sort(), "the clicks gap names exactly the metrics clicks would unlock");
  const revenueGap = gaps.find((g) => g.missingField === "attributed_revenue");
  assertEqual(revenueGap?.campaignCount, 2, "2 campaigns are missing attributed revenue (ROAS/ACOS gap)");
}

// ---------------------------------------------------------------------
// §3: recent-imports grouping — a documented, honest approximation
// (same platform + source + calendar day), never a fabricated batch id.
// ---------------------------------------------------------------------
{
  const rows = [
    { id: "1", platformLabel: "Meta Ads", dataSource: "csv", submittedOnIso: "2026-09-18" },
    { id: "2", platformLabel: "Meta Ads", dataSource: "csv", submittedOnIso: "2026-09-18" },
    { id: "3", platformLabel: "Meta Ads", dataSource: "csv", submittedOnIso: "2026-09-18" },
    { id: "4", platformLabel: "Google Ads", dataSource: "csv", submittedOnIso: "2026-09-17" },
  ];
  const groups = groupRecentImports(rows, 3);
  assertEqual(groups.length, 2, "two distinct import groups from four rows (3 Meta same-day + 1 Google different-day)");
  assertEqual(groups[0].platformLabel, "Meta Ads", "most-recently-seen group appears first (rows are assumed pre-sorted newest-first)");
  assertEqual(groups[0].campaignCount, 3, "all 3 same-platform/source/day rows are grouped into one import");
  assertEqual(groups[1].campaignCount, 1, "the different-platform row is its own group");
}
{
  // maxGroups actually caps the result.
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i), platformLabel: `Platform ${i}`, dataSource: "csv", submittedOnIso: "2026-09-18" }));
  assertEqual(groupRecentImports(rows, 3).length, 3, "groupRecentImports never returns more than maxGroups");
}

// ---------------------------------------------------------------------
// §17: internal data-quality diagnostic — never a user-facing score,
// just honest classification.
// ---------------------------------------------------------------------
{
  const complete: DatasetQualityInput = {
    id: "x", platformKey: "meta_ads", objectiveKey: "traffic", verticalKey: "retail", countryKey: "AR",
    startDate: "2026-01-01", endDate: "2026-01-31", adSpend: 100, raw: { ad_spend: 100, impressions: 1000 },
  };
  assertEqual(assessDatasetQuality(complete), [], "a fully-resolved dataset with an eligible metric has no quality flags");

  const noMetrics: DatasetQualityInput = { ...complete, id: "y", raw: { ad_spend: 100 } };
  assertEqual(assessDatasetQuality(noMetrics), ["no_eligible_metrics"], "spend alone (no impressions/clicks/conversions/etc.) flags 'no_eligible_metrics'");

  const missingContext: DatasetQualityInput = { ...complete, id: "z", platformKey: null, countryKey: null };
  assertEqual(assessDatasetQuality(missingContext).sort(), ["missing_country", "missing_platform"].sort(), "missing taxonomy keys are flagged individually");
}
{
  const a: DatasetQualityInput = { id: "a", platformKey: "meta_ads", objectiveKey: "traffic", verticalKey: "retail", countryKey: "AR", startDate: "2026-01-01", endDate: "2026-01-31", adSpend: 100, raw: {} };
  const b: DatasetQualityInput = { ...a, id: "b" }; // identical composite key
  const c: DatasetQualityInput = { ...a, id: "c", adSpend: 200 }; // different spend -> not a duplicate
  const dupes = flagSuspectedDuplicates([a, b, c]);
  assertTrue(dupes.has("a") && dupes.has("b"), "two datasets sharing platform/objective/country/dates/spend are both flagged");
  assertTrue(!dupes.has("c"), "a dataset with a different spend value is never flagged as a duplicate");
}

// ---------------------------------------------------------------------
// Every metric computeDataCoverage/computeDataGaps can ever reference
// has a real display label — never an undefined leaking into the UI.
// ---------------------------------------------------------------------
{
  const allDerivedKeys = Object.keys(DERIVED_METRIC_LABELS);
  for (const key of ["cpm", "ctr", "cpc", "frequency", "cpv", "cpe", "cpa", "cpl", "roas", "acos", "tacos"]) {
    assertTrue(allDerivedKeys.includes(key), `DERIVED_METRIC_LABELS defines a label for '${key}'`);
  }
}

// ---------------------------------------------------------------------
// §8: cross-links — structural checks (no jsdom in this project).
// ---------------------------------------------------------------------
const contributeLandingSource = readFileSync(new URL("../app/contribute/ContributeLanding.tsx", import.meta.url), "utf8");
assertTrue(
  contributeLandingSource.includes("prefillPlatform=") && contributeLandingSource.includes("ctaCompareThisCampaign"),
  "the import success screen offers a 'Compare this campaign' link pre-filling known dimensions"
);
assertTrue(
  contributeLandingSource.includes('r.status === "valid" && r.platform && r.objective && r.vertical && r.country'),
  "the compare-campaign link is only ever built from a row with every one of its four safe dimensions actually resolved — never inferred"
);

const benchmarkExplorerSource = readFileSync(new URL("../app/benchmark/BenchmarkExplorer.tsx", import.meta.url), "utf8");
assertTrue(
  benchmarkExplorerSource.includes('searchParams.get("prefillPlatform")') && benchmarkExplorerSource.includes('searchParams.get("prefillCountry")'),
  "/benchmark reads the prefill query params an import success screen can link to"
);

// ---------------------------------------------------------------------
// §1/§2/§13/§14: the workspace hub renders nothing for a signed-out
// visitor, an onboarding state for a signed-in user with no data, and
// the full hub otherwise — verified structurally since there's no DOM
// harness in this project.
// ---------------------------------------------------------------------
const workspaceSource = readFileSync(new URL("../components/dashboard/Workspace.tsx", import.meta.url), "utf8");
assertTrue(
  /if \(userLoading \|\| !user \|\| !summary\) return null;/.test(workspaceSource),
  "a signed-out or still-loading visitor sees nothing new — the existing marketing/discovery homepage is untouched"
);
assertTrue(
  workspaceSource.includes("if (!summary.hasAnyData)") && workspaceSource.includes('t("workspace.emptyCta")'),
  "a signed-in user with zero data gets the explicit onboarding state, never an empty dashboard"
);

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
assertTrue(pageSource.includes("<Workspace />") && !pageSource.includes("RecentWork"), "app/page.tsx renders the new Workspace hub and no longer references the superseded RecentWork component");

const heroSource = readFileSync(new URL("../components/dashboard/Hero.tsx", import.meta.url), "utf8");
assertTrue(heroSource.includes("const compact = !!user;"), "Hero compacts itself for a signed-in (returning) session, per §2");

// ---------------------------------------------------------------------
// §10/§11: owner-only contribution detail — RLS-scoped query, never the
// admin client; structural check since this needs a live Supabase
// session to exercise end-to-end.
// ---------------------------------------------------------------------
const contributionDetailPageSource = readFileSync(new URL("../app/account/contributions/[id]/page.tsx", import.meta.url), "utf8");
assertTrue(
  contributionDetailPageSource.includes("createServerSupabaseClient()") && !contributionDetailPageSource.includes("createAdminClient"),
  "the contribution detail page reads through the session-scoped client only — RLS is the real ownership boundary, never a service-role client"
);
assertTrue(
  contributionDetailPageSource.includes('timeWindow: { kind: "last_12_months"') ,
  "§6 benchmark-readiness check reuses the same default time window /benchmark itself opens with — never a narrower window invented just for this check"
);

console.log(`test-phase26-workspace: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
