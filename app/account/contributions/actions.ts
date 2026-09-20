"use server";

// PHASE 25 — §16: owner-safe delete for one's own imported campaign.
// performance_datasets already has an owner-scoped DELETE RLS policy
// ("owners delete own datasets", migration 0007) — this action reuses
// it exactly rather than introducing any new permission. RLS is the
// real boundary (the .eq("owner_user_id", ...) below is defense in
// depth, not a substitute for it); no admin/service-role client is
// ever used here.
//
// This is a hard delete of the row (and, via ON DELETE CASCADE on
// dataset_metric_values.dataset_id — see migration 0005 — its metric
// values), not a status flip to "deleted": the validation_status enum
// does have a "deleted" value, but nothing in this codebase currently
// filters it out of any read path, so soft-deleting would leave the
// campaign fully visible everywhere except a status label. A real
// hide-not-delete flow is a bigger, deliberately out-of-scope change
// (see this phase's unresolved-issues note) — for now, delete means
// delete, exactly as the button will say.

import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface DeleteContributionResult {
  ok: boolean;
  error?: "not_authenticated" | "delete_failed";
}

export async function deleteContributionAction(datasetId: string): Promise<DeleteContributionResult> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const { error } = await supabase
    .from("performance_datasets")
    .delete()
    .eq("id", datasetId)
    .eq("owner_user_id", user.id);

  if (error) return { ok: false, error: "delete_failed" };
  return { ok: true };
}
