"use server";

// PHASE 26: the signed-in home workspace's ONE data-fetching entry
// point. §18 "no N+1 requests": every read below is either a single
// query (with taxonomy/metric context embedded via Postgres joins, not
// per-row follow-up queries) or one of the two existing, already-batched
// saved-comparisons/saved-plans actions — all three run in parallel via
// Promise.all, never sequentially. §19 security: uses the SAME
// session-aware client every other owner-scoped page in this app uses
// (createServerSupabaseClient) — never the admin client — so RLS
// ("owners read own datasets") is the actual, unbypassable boundary,
// exactly like app/account/contributions/page.tsx already relies on.
//
// Bounded, not historical: RECENT_DATASET_LIMIT caps how many of the
// user's own datasets are read for coverage/gaps/recent-imports — this
// is a working-set size, never "load everything the user has ever
// submitted" (§18).

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listSavedComparisonsAction, type SavedComparison } from "@/app/comparisons/actions";
import { listScenariosAction, type SavedPlanningScenario } from "@/app/planner/actions";
import { computeDataCoverage, computeDataGaps, groupRecentImports, type MetricCoverageEntry, type DataGapEntry, type RecentImportGroup, type DatasetRawSummary } from "./coverage";
import { flagSuspectedDuplicates } from "./dataQuality";
import type { RawMetricInputs } from "@/lib/metrics/derive";

const RECENT_DATASET_LIMIT = 20;
const RECENT_IMPORT_GROUPS = 3;
const RECENT_LIST_LIMIT = 3;

// The raw (never derived) base metrics — the only ones coverage.ts's
// calculateDerivedMetrics call actually consumes. dataset_metric_values
// also holds already-computed derived rows (cpm, ctr, ...) inserted
// alongside the raw ones at import time (see app/contribute/
// bulk-actions.ts) — those are deliberately ignored here rather than
// trusted directly, so coverage always reflects the one canonical
// formula file, never a possibly-stale persisted copy.
const RAW_METRIC_KEYS = new Set<keyof RawMetricInputs>([
  "ad_spend", "impressions", "reach", "clicks", "video_views", "engagements", "conversions", "attributed_revenue", "total_revenue",
]);

interface DatasetJoinRow {
  id: string;
  created_at: string;
  start_date: string;
  end_date: string;
  data_source: string;
  validation_status: string;
  platforms: { internal_key: string; display_label: string } | null;
  objectives: { internal_key: string } | null;
  verticals: { internal_key: string } | null;
  countries: { iso_code: string } | null;
  dataset_metric_values: { raw_numeric_value: number; metrics: { internal_key: string } | null }[] | null;
}

export interface WorkspaceSummary {
  signedIn: boolean;
  hasAnyData: boolean;
  recentImports: RecentImportGroup[];
  coverage: MetricCoverageEntry[];
  gaps: DataGapEntry[];
  suspectedDuplicateCount: number;
  comparisons: SavedComparison[];
  plans: SavedPlanningScenario[];
}

const EMPTY_SUMMARY: WorkspaceSummary = {
  signedIn: false,
  hasAnyData: false,
  recentImports: [],
  coverage: [],
  gaps: [],
  suspectedDuplicateCount: 0,
  comparisons: [],
  plans: [],
};

export async function getWorkspaceSummaryAction(): Promise<WorkspaceSummary> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return EMPTY_SUMMARY;

  // Three independent reads, batched — never sequential (§18).
  const [datasetsRes, comparisons, plans] = await Promise.all([
    supabase
      .from("performance_datasets")
      .select(
        `id, created_at, start_date, end_date, data_source, validation_status,
         platforms(internal_key, display_label),
         objectives(internal_key),
         verticals(internal_key),
         countries(iso_code),
         dataset_metric_values(raw_numeric_value, metrics(internal_key))`
      )
      // §17/§5: excluded rows a curator has already ruled out, or the
      // user's own deleted rows, carry no signal for coverage/gaps —
      // every other status (pending/valid/flagged) is still the user's
      // real submitted work and stays visible, exactly like their
      // existing /account/contributions list already shows it.
      .neq("validation_status", "deleted")
      .order("created_at", { ascending: false })
      .limit(RECENT_DATASET_LIMIT),
    listSavedComparisonsAction(RECENT_LIST_LIMIT),
    listScenariosAction(),
  ]);

  const rows = ((datasetsRes.data as unknown as DatasetJoinRow[] | null) ?? []);

  const rawSummaries: DatasetRawSummary[] = rows.map((row) => {
    const raw: RawMetricInputs = {};
    for (const value of row.dataset_metric_values ?? []) {
      const key = value.metrics?.internal_key;
      if (key && RAW_METRIC_KEYS.has(key as keyof RawMetricInputs)) {
        (raw as Record<string, number>)[key] = value.raw_numeric_value;
      }
    }
    return { id: row.id, raw };
  });

  const qualityInputs = rows.map((row) => ({
    id: row.id,
    platformKey: row.platforms?.internal_key ?? null,
    objectiveKey: row.objectives?.internal_key ?? null,
    verticalKey: row.verticals?.internal_key ?? null,
    countryKey: row.countries?.iso_code ?? null,
    startDate: row.start_date,
    endDate: row.end_date,
    adSpend: rawSummaries.find((r) => r.id === row.id)?.raw.ad_spend ?? null,
    raw: rawSummaries.find((r) => r.id === row.id)?.raw ?? {},
  }));
  const suspectedDuplicates = flagSuspectedDuplicates(qualityInputs);
  // §17 is an internal diagnostic, never a user-facing score — only its
  // aggregate count (not which rows, not a per-row reason) reaches the
  // workspace summary here; a per-row "revisar" note belongs on the
  // contributions list itself (app/account/contributions/page.tsx),
  // which calls assessDatasetQuality/flagSuspectedDuplicates directly
  // against its own already-fetched rows rather than through this
  // summary.

  const recentImports = groupRecentImports(
    rows.map((row) => ({
      id: row.id,
      platformLabel: row.platforms?.display_label ?? "—",
      dataSource: row.data_source,
      submittedOnIso: row.created_at.slice(0, 10),
    })),
    RECENT_IMPORT_GROUPS
  );

  return {
    signedIn: true,
    hasAnyData: rows.length > 0 || comparisons.length > 0 || plans.length > 0,
    recentImports,
    coverage: computeDataCoverage(rawSummaries),
    gaps: computeDataGaps(rawSummaries),
    suspectedDuplicateCount: suspectedDuplicates.size,
    comparisons: comparisons.slice(0, RECENT_LIST_LIMIT),
    plans: plans.slice(0, RECENT_LIST_LIMIT),
  };
}
