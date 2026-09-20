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
