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
import { computeDataCoverage, computeDataGaps, type MetricCoverageEntry, type DataGapEntry, type RecentImportGroup, type DatasetRawSummary } from "./coverage";
import { flagSuspectedDuplicates } from "./dataQuality";
import { tallyRealCampaignCountByBatch, resolveBatchDisplayCount } from "./importBatchStatus";
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
  // PHASE 27 (§4): used only to tally each batch's REAL linked-campaign
  // count below — never rendered directly.
  import_batch_id: string | null;
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

  // PHASE 25 (§16/§24): "Recent imports" now reads the REAL
  // import_batches table (migration 0018) instead of Phase 26's
  // documented same-day/same-platform approximation over individual
  // performance_datasets rows (lib/contribute/coverage.ts's
  // groupRecentImports — left in place, unused here now, since
  // scripts/test-phase26-workspace.mts still exercises it directly and
  // it remains an honest fallback shape for anything that DOES need to
  // group raw rows). Four independent reads, still batched — never
  // sequential (§18).
  const [datasetsRes, batchesRes, comparisons, plans] = await Promise.all([
    supabase
      .from("performance_datasets")
      .select(
        `id, created_at, start_date, end_date, data_source, validation_status, import_batch_id,
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
    supabase
      .from("import_batches")
      .select("id, success_count, created_at, data_source, platforms(display_label)")
      .order("created_at", { ascending: false })
      .limit(RECENT_IMPORT_GROUPS),
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

  // PHASE 25 (§16): one real batch = one recent-imports card — no more
  // guessing that same-platform/same-day rows came from the same
  // upload. A manual single-entry contribution never creates a batch
  // (migration 0018's own comment), so an account with only manual
  // entries simply shows no "Recent imports" cards — an honest empty
  // state, never a fabricated one built from unrelated rows.
  type BatchJoinRow = { id: string; success_count: number; created_at: string; data_source: string; platforms: { display_label: string } | null };
  const batchRows = ((batchesRes.data as unknown as BatchJoinRow[] | null) ?? []);
  // PHASE 28: success_count is now finalized for real (migration 0019
  // + app/contribute/bulk-actions.ts's error-checked update) — the
  // stored count is primary, and `rows` above (already carrying
  // import_batch_id, no new query) only backs the defensive fallback
  // centralized in lib/contribute/importBatchStatus.ts, reused
  // identically by app/account/contributions/ContributionsList.tsx and
  // ImportBatchDetail.tsx (Phase 27 §17 follow-up: one counting
  // helper, not three copies of it).
  const realCampaignCountByBatch = tallyRealCampaignCountByBatch(rows);
  const recentImports: RecentImportGroup[] = batchRows.map((b) => ({
    platformLabel: b.platforms?.display_label ?? "—",
    dataSource: b.data_source,
    submittedOnIso: b.created_at.slice(0, 10),
    campaignCount: resolveBatchDisplayCount(b.success_count, realCampaignCountByBatch.get(b.id)),
  }));

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
