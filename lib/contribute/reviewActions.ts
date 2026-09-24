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
  error?:
    | "not_authenticated"
    | "not_authorized"
    | "invalid_decision"
    | "invalid_transition"
    | "save_failed"
    // CUCURUCHO DATA INTEGRITY 1 (§17): a normal approval attempted on a
    // pending row whose observation_fingerprint already matches a valid
    // one is rejected by the new partial unique index (migration 0020,
    // idx_datasets_owner_fingerprint_valid) — verified locally: it
    // surfaces as a raw Postgres unique_violation (23505), not one of
    // fn_review_contribution's own named exceptions. Mapped here to a
    // distinct, actionable error so the UI can say "use supersede"
    // instead of a generic save failure.
    | "supersede_required";
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
function mapRpcError(message: string | undefined, code: string | undefined): ContributionReviewResult["error"] {
  // CUCURUCHO DATA INTEGRITY 1 (§17): checked before the message-text
  // checks below, since a unique_violation's message text is Postgres's
  // own constraint-error wording, not one of fn_review_contribution's
  // named exceptions.
  if (code === "23505") return "supersede_required";
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
    return { ok: false, error: mapRpcError(error.message, error.code) };
  }
  // The curator's own queue always needs a refresh (the reviewed row
  // must disappear from "pending"); the owner's own contributions list
  // is a different user's page, revalidated the next time they load it
  // naturally, same as every other cross-user write in this codebase.
  revalidatePath("/curation");
  return { ok: true };
}

// CUCURUCHO DATA INTEGRITY 1 (§9/§16) — the write side of a
// curator-approved supersede. Same defense-in-depth posture as
// reviewContributionAction above: this action resolves the caller and
// rejects a garbage pair (identical ids) before spending a round trip,
// but fn_approve_superseding_contribution() (migration 0020) re-checks
// authorization and every guard (pending/valid status, same owner, same
// non-null fingerprint, not self) itself, inside one atomic transaction
// — never a check-then-act race.
export async function approveSupersedingContributionAction(
  newDatasetId: string,
  oldDatasetId: string
): Promise<ContributionReviewResult> {
  const { supabase, user, isCurator } = await resolveCaller();
  const auth = authorizeContributionReview(!!user, isCurator);
  if (!auth.allowed) return { ok: false, error: auth.error };

  if (newDatasetId === oldDatasetId) {
    return { ok: false, error: "invalid_transition" };
  }

  const { error } = await supabase.rpc("fn_approve_superseding_contribution", {
    p_new_dataset_id: newDatasetId,
    p_old_dataset_id: oldDatasetId,
  });

  if (error) {
    console.error("[contribution-review] supersede approval failed:", error);
    // fn_approve_superseding_contribution raises 'self_supersede' /
    // 'owner_mismatch' / 'fingerprint_mismatch' in addition to
    // fn_review_contribution's own vocabulary — all four unrecognized-
    // by-mapRpcError cases correctly fall through to "save_failed" (a
    // generic, safe default), since none of them describe an action the
    // review UI can silently retry differently.
    return { ok: false, error: mapRpcError(error.message, error.code) };
  }
  revalidatePath("/curation");
  return { ok: true };
}
