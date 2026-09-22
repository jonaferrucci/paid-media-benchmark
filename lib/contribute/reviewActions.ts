"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  authorizeContributionReview,
  isValidContributionReviewDecision,
  type ContributionReviewDecision,
} from "./reviewRules";

// PHASE 28 (post-audit revision) — the write side of contribution
// benchmark-eligibility review. This action is a thin, defense-in-
// depth wrapper around fn_review_contribution() (migration 0019), a
// SECURITY DEFINER RPC that is the ONLY place validation_status/
// reviewed_by/reviewed_at on performance_datasets can ever change:
// there is no UPDATE grant on that table for `authenticated` at all,
// column-scoped or otherwise. This action still (1) resolves the
// caller's real session + is_curator flag server-side and (2) rejects
// an obviously-bad `decision` value before spending a round trip — but
// neither of those is the real security boundary. The RPC re-checks
// fn_is_curator(auth.uid()) and the decision whitelist itself, and its
// own atomic `UPDATE ... WHERE validation_status = 'pending'` is what
// actually enforces the transition — this action never pre-fetches the
// row's current status to check-then-act, since that would just
// reintroduce the race the atomic RPC exists to remove.

export interface ContributionReviewResult {
  ok: boolean;
  error?: "not_authenticated" | "not_authorized" | "invalid_decision" | "invalid_transition" | "save_failed";
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

// fn_review_contribution() raises a bare exception message (see
// migration 0019 — 'not_authenticated' / 'not_authorized' /
// 'invalid_decision' / 'invalid_transition') for every failure mode it
// distinguishes; PostgREST surfaces that text as error.message. This
// maps it back to the same discriminated result shape the rest of this
// codebase's actions already use, defaulting to "save_failed" for
// anything unrecognized (a real DB/connection error, say) rather than
// guessing.
function mapRpcError(message: string | undefined): ContributionReviewResult["error"] {
  if (!message) return "save_failed";
  if (message.includes("not_authenticated")) return "not_authenticated";
  if (message.includes("not_authorized")) return "not_authorized";
  if (message.includes("invalid_decision")) return "invalid_decision";
  if (message.includes("invalid_transition")) return "invalid_transition";
  return "save_failed";
}

export async function reviewContributionAction(
  datasetId: string,
  decision: ContributionReviewDecision
): Promise<ContributionReviewResult> {
  const { supabase, user, isCurator } = await resolveCaller();
  const auth = authorizeContributionReview(!!user, isCurator);
  if (!auth.allowed) return { ok: false, error: auth.error };

  if (!isValidContributionReviewDecision(decision)) {
    return { ok: false, error: "invalid_decision" };
  }

  const { error } = await supabase.rpc("fn_review_contribution", {
    p_dataset_id: datasetId,
    p_decision: decision,
  });

  if (error) {
    console.error("[contribution-review] review failed:", error);
    return { ok: false, error: mapRpcError(error.message) };
  }
  // The curator's own queue always needs a refresh (the reviewed row
  // must disappear from "pending"); the owner's own contributions list
  // is a different user's page, revalidated the next time they load it
  // naturally, same as every other cross-user write in this codebase.
  revalidatePath("/curation");
  return { ok: true };
}
