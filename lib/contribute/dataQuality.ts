// PHASE 26 (§17): "RELEASE DATA QUALITY CHECK" — an internal,
// deterministic diagnostic over already-persisted contributions. This
// is explicitly NOT a user-facing score: nothing here produces a single
// number a user sees. It only classifies a dataset into honest,
// explainable states, which callers use to phrase real empty/warning
// copy (e.g. a small "revisar" note in the owner's own contributions
// list) — never a gamified rating.

import { calculateDerivedMetrics, type RawMetricInputs } from "@/lib/metrics/derive";

export type DataQualityFlag =
  | "missing_platform"
  | "missing_objective"
  | "missing_vertical"
  | "missing_country"
  | "no_eligible_metrics"
  | "suspected_duplicate";

export interface DatasetQualityInput {
  id: string;
  platformKey: string | null;
  objectiveKey: string | null;
  verticalKey: string | null;
  countryKey: string | null;
  startDate: string;
  endDate: string;
  adSpend: number | null;
  raw: RawMetricInputs;
}

// Per-dataset checks only (never compares across datasets — see
// flagSuspectedDuplicates below for the one cross-dataset check).
// "missing_*" flags are defensive: performance_datasets' own NOT NULL
// constraints on platform_id/objective_id/vertical_id/country_id (see
// 0004_performance_datasets.sql) mean a persisted row should never
// actually be missing these — a flag surfacing here in practice would
// point at a real taxonomy-resolution bug upstream, not a normal data
// gap.
export function assessDatasetQuality(dataset: DatasetQualityInput): DataQualityFlag[] {
  const flags: DataQualityFlag[] = [];
  if (!dataset.platformKey) flags.push("missing_platform");
  if (!dataset.objectiveKey) flags.push("missing_objective");
  if (!dataset.verticalKey) flags.push("missing_vertical");
  if (!dataset.countryKey) flags.push("missing_country");

  // "No eligible metrics" reuses the SAME derive.ts formulas as the
  // Data Coverage section (lib/contribute/coverage.ts) — a dataset with
  // literally nothing calculateDerivedMetrics can compute from (e.g.
  // only ad_spend, no impressions/clicks/conversions/revenue/reach/
  // video_views/engagements at all) is a real product concern worth
  // flagging, never a fabricated one.
  const derived = calculateDerivedMetrics(dataset.raw);
  if (Object.keys(derived).length === 0) flags.push("no_eligible_metrics");

  return flags;
}

// §17 "suspected duplicate": the ONE cross-dataset check, reusing the
// exact same composite-key idea as lib/import/validate.ts's
// detectDuplicates (platform + objective + country + date range + ad
// spend) — generalized here to already-PERSISTED datasets (e.g. the
// same file accidentally uploaded twice in separate sessions) rather
// than rows within one in-progress file. Never a new methodology, never
// auto-deleted or auto-excluded — purely a flag for the owner's own
// contributions list to show a "revisar" note on.
export function flagSuspectedDuplicates(datasets: DatasetQualityInput[]): Set<string> {
  const firstSeenId = new Map<string, string>();
  const suspected = new Set<string>();
  for (const dataset of datasets) {
    const key = [
      dataset.platformKey, dataset.objectiveKey, dataset.countryKey,
      dataset.startDate, dataset.endDate, dataset.adSpend,
    ].join("|");
    const existingId = firstSeenId.get(key);
    if (existingId !== undefined) {
      suspected.add(existingId);
      suspected.add(dataset.id);
    } else {
      firstSeenId.set(key, dataset.id);
    }
  }
  return suspected;
}
