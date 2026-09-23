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

// PHASE 35 (§2): "what needs my attention" — real, unbounded counts.
// Deliberately NOT derived from the RECENT_DATASET_LIMIT-capped `rows`
// below (that cap is an intentional working-set size for coverage/gaps
// — see this file's own top comment — but would silently UNDERCOUNT a
// user with more than 20 campaigns, which is exactly the kind of
// invented/misleading count §2 forbids). comparisons/plans counts are
// the real total, not the RECENT_LIST_LIMIT-capped "continue working"
// slice shown elsewhere in the same summary.
export interface WorkspaceStatusCounts {
  pending: number;
  valid: number;
  comparisons: number;
  plans: number;
}

export interface WorkspaceSummary {
  signedIn: boolean;
  hasAnyData: boolean;
  statusCounts: WorkspaceStatusCounts;
  // The most recently created "valid" campaign among the same bounded,
  // recency-ordered working set already fetched below — a best-effort
  // deep link for "review an approved campaign" (§3), not a claim about
  // which valid campaign is most important. Never a second query: this
  // is simply the first match found in `rows`, which is already
  // ordered created_at desc.
  mostRecentValidId: string | null;
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
  statusCounts: { pending: 0, valid: 0, comparisons: 0, plans: 0 },
  mostRecentValidId: null,
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
  // group raw rows). Five independent reads (PHASE 35 added the status-
  // counts query below), still batched — never sequential (§18).
  const [datasetsRes, statusRes, batchesRes, comparisons, plans] = await Promise.all([
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
    // PHASE 35 (§2): one extra, simple, owner-scoped (RLS-enforced,
    // same session-aware client) query — a single skinny column across
    // EVERY non-deleted campaign, never capped like `rows` above, so
    // the "N en revisión / N aprobadas" counts are real totals, not an
    // artifact of the working-set limit.
    supabase.from("performance_datasets").select("validation_status").neq("validation_status", "deleted"),
    supabase
      .from("import_batches")
      .select("id, success_count, created_at, data_source, source_filename, platforms(display_label)")
      .order("created_at", { ascending: false })
      .limit(RECENT_IMPORT_GROUPS),
    // PHASE 35: no `limit` arg — fetch every one of the owner's saved
    // comparisons (a per-user list, never large) so `comparisons.length`
    // below is the real total for the attention counts; the existing
    // RECENT_LIST_LIMIT slice for "continue working" is applied after,
    // in-memory, on the same already-fetched array — never a second
    // query. listScenariosAction() already had no limit of its own.
    listSavedComparisonsAction(),
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
  type BatchJoinRow = {
    id: string; success_count: number; created_at: string; data_source: string;
    source_filename: string | null; platforms: { display_label: string } | null;
  };
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
    // PHASE 35 (§13): a real, already-stored filename when the batch
    // has one — never invented for a manual/legacy batch that doesn't.
    sourceFilename: b.source_filename ?? null,
  }));

  // PHASE 35 (§2): real, unbounded status counts from the dedicated
  // statusRes query above — never the RECENT_DATASET_LIMIT-capped `rows`.
  type StatusRow = { validation_status: string };
  const statusRows = ((statusRes.data as unknown as StatusRow[] | null) ?? []);
  const statusCounts: WorkspaceStatusCounts = {
    pending: statusRows.filter((r) => r.validation_status === "pending").length,
    valid: statusRows.filter((r) => r.validation_status === "valid").length,
    comparisons: comparisons.length,
    plans: plans.length,
  };
  // §3 "revisar campaña aprobada": a best-effort deep link into one
  // real, recent valid campaign — `rows` is already ordered created_at
  // desc, so the first match is genuinely the most recent one within
  // the working set (never a claim about the single "best" one).
  const mostRecentValidId = rows.find((r) => r.validation_status === "valid")?.id ?? null;

  return {
    signedIn: true,
    hasAnyData: rows.length > 0 || comparisons.length > 0 || plans.length > 0,
    statusCounts,
    mostRecentValidId,
    recentImports,
    coverage: computeDataCoverage(rawSummaries),
    gaps: computeDataGaps(rawSummaries),
    suspectedDuplicateCount: suspectedDuplicates.size,
    comparisons: comparisons.slice(0, RECENT_LIST_LIMIT),
    plans: plans.slice(0, RECENT_LIST_LIMIT),
  };
}
