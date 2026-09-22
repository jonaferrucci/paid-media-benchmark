// PHASE 32 (§5): the single-metric comparison surface (/benchmark's
// "single" mode metric dropdown, app/benchmark/BenchmarkExplorer.tsx)
// only ever accepts these metric keys. Extracted here — rather than
// kept as a local const in that client component — so any other caller
// that needs to check whether a metric is something /benchmark can
// actually accept has ONE real source of truth to import, never a
// second, independently-maintained copy of the same list that could
// silently drift out of sync.
//
// Used by app/account/contributions/[id]/page.tsx to decide which of a
// campaign's own derivable/base metrics are eligible for the "Comparar
// con benchmark" activation — a metric this campaign supports but that
// /benchmark itself has no dropdown option for (e.g. CPA, ROAS, CPE,
// CPL, ACOS, TACOS) is never offered there, exactly per §5's "es
// compatible con /benchmark" requirement.
export const SINGLE_METRIC_OPTIONS = ["cpm", "ctr", "cpc", "reach", "frequency", "cpv"] as const;
export type SingleMetricOption = (typeof SINGLE_METRIC_OPTIONS)[number];
