"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  authorizeGovernanceAction,
  isValidRateCardTransition,
  isValidSnapshotTransition,
  isValidPlatformStatusTransition,
  validatePlatformCompleteness,
  type RateCardReviewDecision,
  type SnapshotReviewDecision,
  type PlatformReviewDecision,
  type PlatformCompletenessReason,
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
  error?: "not_authenticated" | "not_authorized" | "invalid_transition" | "save_failed" | "incomplete_entity";
  // Only ever populated alongside error === "incomplete_entity" — the
  // specific structural gaps validatePlatformCompleteness found, so the
  // curator sees exactly what's missing instead of a generic failure.
  reasons?: PlatformCompletenessReason[];
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

  const { data: current } = await supabase
    .from("platforms")
    .select("status, display_label, internal_key, media_category_id, is_global")
    .eq("id", id)
    .maybeSingle();
  if (!current || !isValidPlatformStatusTransition(current.status, decision)) {
    return { ok: false, error: "invalid_transition" };
  }

  // Media Experience & Governance phase, item C: structural completeness
  // is only enforced on the approval ("active") path — deactivating a
  // pending suggestion never needs it, it's always safe. Enforced here,
  // server-side, before the write — never only via a disabled button.
  if (decision === "active") {
    const [categoryRes, countryRowsRes] = await Promise.all([
      current.media_category_id
        ? supabase.from("media_categories").select("internal_key").eq("id", current.media_category_id).maybeSingle()
        : Promise.resolve({ data: null as { internal_key: string } | null }),
      supabase.from("platform_countries").select("country_id").eq("platform_id", id),
    ]);

    const completeness = validatePlatformCompleteness({
      displayLabel: current.display_label,
      internalKey: current.internal_key,
      mediaCategoryInternalKey: categoryRes.data?.internal_key ?? null,
      isGlobal: current.is_global,
      countryCount: (countryRowsRes.data ?? []).length,
    });

    if (!completeness.ok) {
      return { ok: false, error: "incomplete_entity", reasons: completeness.reasons };
    }
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
