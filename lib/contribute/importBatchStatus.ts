// PHASE 25 (§7/§17): the three factual, formula-derived import-batch
// statuses — never a numeric score. Shared between the compact history
// list (app/account/contributions/ContributionsList.tsx) and the batch
// detail view (app/account/contributions/imports/[id]/ImportBatchDetail.tsx)
// so the two screens can never silently disagree about what "Partial"
// means.

export interface ImportBatchCounts {
  row_count: number;
  success_count: number;
  skipped_count: number;
  review_count: number;
}

export type ImportBatchStatus = "completed" | "partial" | "needsAttention";

// "Needs attention" is deliberately the ONLY branch that fires when
// nothing at all succeeded, so a batch that partially worked always
// reads as "Partial", never as a full failure it wasn't.
export function computeImportBatchStatus(b: ImportBatchCounts): ImportBatchStatus {
  if (b.success_count === 0) return "needsAttention";
  if (b.review_count > 0 || b.success_count < b.row_count - b.skipped_count) return "partial";
  return "completed";
}

export const IMPORT_BATCH_STATUS_STYLE: Record<ImportBatchStatus, string> = {
  completed: "bg-pistachio-soft text-pistachio",
  partial: "bg-vanilla-soft text-vanilla",
  needsAttention: "bg-caution-soft text-caution",
};

// PHASE 27 (§4) discovered that import_batches.success_count could be
// silently stuck at 0 (no owner-scoped UPDATE RLS policy existed on
// that table at all), so three separate call sites each grew their own
// copy of "tally the real linked performance_datasets rows and prefer
// that over the stored count." PHASE 28 fixes the root cause (see
// migration 0019 + app/contribute/bulk-actions.ts's finalize call) —
// this centralizes what's left of that logic in one place (per that
// phase's own §17 instruction not to duplicate it across pages), and
// flips the preference order now that persistence is trustworthy:
// the stored, factual count is primary; the real linked-dataset tally
// is now only a defensive fallback for a batch whose finalize somehow
// still failed (or any batch created before this fix ever shipped).

export function tallyRealCampaignCountByBatch(
  rows: { import_batch_id: string | null; validation_status?: string }[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.import_batch_id) continue;
    if (row.validation_status === "deleted") continue;
    map.set(row.import_batch_id, (map.get(row.import_batch_id) ?? 0) + 1);
  }
  return map;
}

export function resolveBatchDisplayCount(storedSuccessCount: number, realLinkedCount: number | undefined): number {
  if (storedSuccessCount > 0) return storedSuccessCount;
  // storedSuccessCount === 0: either a genuine zero-success import, or
  // a legacy/failed finalize. Prefer the real tally when it says
  // otherwise — never fabricate a number neither source supports.
  return realLinkedCount ?? storedSuccessCount;
}
