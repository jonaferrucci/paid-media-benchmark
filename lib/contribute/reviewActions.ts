"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  authorizeContributionReview,
  isValidContributionReviewTransition,
  type ContributionReviewDecision,
} from "./reviewRules";

// PHASE 28 — the write side of contribution benchmark-eligibility
// review. Mirrors lib/media/governanceActions.ts's exact three-layer
// shape (Phase 19B item 3): (1) resolve the caller's real session +
// is_curator flag server-side (never a client-supplied flag), (2) run
// it through the pure authorization/transition rules in
// reviewRules.ts, (3) only then touch the database — and even then,
// RLS (migration 0019's "curators review contribution validation"
// policy + fn_is_curator) is the actual, un-bypassable boundary if any
// of the above were ever wrong.

export interface ContributionReviewResult {
  ok: boolean;
  error?: "not_authenticated" | "not_authorized" | "invalid_transition" | "save_failed";
}

async function resolveCaller() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isCurator: false };

  const { data: profile } = await supabase.from("profiles").select("is_curator").eq("id", user.id).maybeSingle();
  return { supabase, user, isCurator: profile?.is_curator === true };
}

export async function reviewContributionAction(
  datasetId: string,
  decision: ContributionReviewDecision
): Promise<ContributionReviewResult> {
  const { supabase, user, isCurator } = await resolveCaller();
  const auth = authorizeContributionReview(!!user, isCurator);
  if (!auth.allowed) return { ok: false, error: auth.error };

  const { data: current } = await supabase.from("performance_datasets").select("validation_status").eq("id", datasetId).maybeSingle();
  if (!current || !isValidContributionReviewTransition(current.validation_status, decision)) {
    return { ok: false, error: "invalid_transition" };
  }

  const { error } = await supabase
    .from("performance_datasets")
    .update({ validation_status: decision, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
    .eq("id", datasetId)
    .eq("validation_status", "pending");

  if (error) {
    console.error("[contribution-review] review failed:", error);
    return { ok: false, error: "save_failed" };
  }
  // The curator's own queue always needs a refresh (the reviewed row
  // must disappear from "pending"); the owner's own contributions list
  // is a different user's page, revalidated the next time they load it
  // naturally, same as every other cross-user write in this codebase.
  revalidatePath("/curation");
  return { ok: true };
}
