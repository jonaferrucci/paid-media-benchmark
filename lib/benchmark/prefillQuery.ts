import type { CohortFilters } from "@/lib/types";

// CUCURUCHO — CROSS-SITE RELEASE POLISH (Section 3: search suggestion
// chips).
//
// Same behavior as app/page.tsx's own cohortFiltersToPrefillQuery/
// goToBenchmark (PHASE 29/30/39/39.1) — already the ONE real, working
// "apply a cohort-filter suggestion" mechanism in the app (Home's
// SearchOverlay chips already use it correctly, navigating to
// /benchmark?prefillPlatform=...&prefillObjective=...&etc., which
// BenchmarkExplorer.tsx's own prefill-reading useEffect merges into its
// draft without resetting the rest). Every OTHER SearchOverlay instance
// across the app instead passed `onApply={() => {}}`, which is the
// live-confirmed "search chips do nothing" bug.
//
// This module is the shared implementation every one of THOSE other
// call sites reuses, rather than each re-implementing its own copy of
// the same query-building logic. app/page.tsx keeps its own existing,
// independently-tested local copy unchanged (several pre-existing
// scripts/test-phase3*.mts suites assert its exact source-level
// shape) — the two are intentionally identical in behavior, not a
// second/divergent prefill mechanism, just not literally the same
// function body as app/page.tsx's.
export function cohortFiltersToPrefillQuery(filters: Partial<CohortFilters>): string {
  const params = new URLSearchParams();
  if (filters.platform) params.set("prefillPlatform", filters.platform);
  if (filters.objective) params.set("prefillObjective", filters.objective);
  if (filters.verticalId) params.set("prefillVertical", filters.verticalId);
  if (filters.country) params.set("prefillCountry", filters.country);
  if (filters.audienceStrategy) params.set("prefillAudienceStrategy", filters.audienceStrategy);
  if (filters.funnelStage) params.set("prefillFunnelStage", filters.funnelStage);
  if (filters.spendBand) params.set("prefillSpendBand", filters.spendBand);
  if (filters.durationBand) params.set("prefillDurationBand", filters.durationBand);
  if (filters.timeWindow) params.set("prefillTimeWindow", filters.timeWindow);
  return params.toString();
}

// The one consistent behavior every SearchOverlay instance now
// implements (Section 3: "choose ONE correct behavior... do not keep
// dead buttons"): a suggestion chip's filter is a Benchmark cohort
// filter (platform/vertical/audience/objective), so applying one always
// means "go look at that benchmark" — exactly what Home already does,
// and what BenchmarkExplorer.tsx does locally when it's the page
// already open (same destination, same query string, no page
// navigation needed since it's already there).
export function benchmarkHrefForCohortFilters(filters: Partial<CohortFilters>): string {
  const query = cohortFiltersToPrefillQuery(filters);
  return query ? `/benchmark?${query}` : "/benchmark";
}
