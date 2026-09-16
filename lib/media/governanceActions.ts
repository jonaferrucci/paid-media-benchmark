"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  authorizeGovernanceAction,
  isValidRateCardTransition,
  isValidSnapshotTransition,
  isValidPlatformStatusTransition,
  type RateCardReviewDecision,
  type SnapshotReviewDecision,
  type PlatformReviewDecision,
} from "./governanceRules";

// Phase 19B item 3 — the write side of the minimal curator workflow.
// Every action follows the same three-layer shape: (1) resolve the
// caller's real session + is_curator flag server-side (never a
// client-supplied flag), (2) run it through the pure authorization/
// transition rules in governanceRules.ts, (3) only then touch the
// database — and even then, RLS (migration 0014's fn_is_curator
// policies) is the actual, un-bypassable boundary if any of the above
// were ever wrong. This mirrors the exact "never trust a client-side
// check alone" instruction from the brief.

export interface GovernanceActionResult {
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

export async function reviewRateCardAction(
  id: string,
  decision: RateCardReviewDecision
): Promise<GovernanceActionResult> {
  const { supabase, user, isCurator } = await resolveCaller();
  const auth = authorizeGovernanceAction(!!user, isCurator);
  if (!auth.allowed) return { ok: false, error: auth.error };

  const { data: current } = await supabase.from("media_rate_cards").select("status").eq("id", id).maybeSingle();
  if (!current || !isValidRateCardTransition(current.status, decision)) {
    return { ok: false, error: "invalid_transition" };
  }

  const { error } = await supabase
    .from("media_rate_cards")
    .update({ status: decision, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");

  if (error) {
    console.error("[governance] rate card review failed:", error);
    return { ok: false, error: "save_failed" };
  }
  revalidatePath("/curation");
  return { ok: true };
}

export async function reviewSnapshotAction(
  id: string,
  decision: SnapshotReviewDecision
): Promise<GovernanceActionResult> {
  const { supabase, user, isCurator } = await resolveCaller();
  const auth = authorizeGovernanceAction(!!user, isCurator);
  if (!auth.allowed) return { ok: false, error: auth.error };

  const { data: current } = await supabase.from("public_media_metric_snapshots").select("status").eq("id", id).maybeSingle();
  if (!current || !isValidSnapshotTransition(current.status, decision)) {
    return { ok: false, error: "invalid_transition" };
  }

  const { error } = await supabase
    .from("public_media_metric_snapshots")
    .update({ status: decision, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");

  if (error) {
    console.error("[governance] snapshot review failed:", error);
    return { ok: false, error: "save_failed" };
  }
  revalidatePath("/curation");
  return { ok: true };
}

export async function reviewPlatformAction(
  id: string,
  decision: PlatformReviewDecision
): Promise<GovernanceActionResult> {
  const { supabase, user, isCurator } = await resolveCaller();
  const auth = authorizeGovernanceAction(!!user, isCurator);
  if (!auth.allowed) return { ok: false, error: auth.error };

  const { data: current } = await supabase.from("platforms").select("status").eq("id", id).maybeSingle();
  if (!current || !isValidPlatformStatusTransition(current.status, decision)) {
    return { ok: false, error: "invalid_transition" };
  }

  const { error } = await supabase
    .from("platforms")
    .update({ status: decision })
    .eq("id", id)
    .eq("status", "pending");

  if (error) {
    console.error("[governance] platform review failed:", error);
    return { ok: false, error: "save_failed" };
  }
  revalidatePath("/curation");
  revalidatePath("/platforms");
  return { ok: true };
}
