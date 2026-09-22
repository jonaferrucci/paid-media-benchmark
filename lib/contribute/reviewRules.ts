// PHASE 28 — pure, DB-free authorization/transition rules for
// contribution benchmark-eligibility review. Deliberately mirrors
// lib/media/governanceRules.ts's exact shape (Phase 19B item 3): the
// server action below calls these functions FIRST and only ever
// proceeds to the database when they return an "allowed"/valid result.
// RLS (migration 0019's curator-only policy + fn_is_curator) is the
// real, un-bypassable enforcement — this module is what lets that
// decision logic be unit-tested without a live database, and what
// stops a UI bug from ever even attempting an unauthorized write.

export type ContributionReviewAuthResult =
  | { allowed: true }
  | { allowed: false; error: "not_authenticated" | "not_authorized" };

// Never trust a client-side role check alone — the same decision the
// server action makes right before touching the database.
export function authorizeContributionReview(isAuthenticated: boolean, isCurator: boolean): ContributionReviewAuthResult {
  if (!isAuthenticated) return { allowed: false, error: "not_authenticated" };
  if (!isCurator) return { allowed: false, error: "not_authorized" };
  return { allowed: true };
}

// "valid" = approved for benchmark aggregation. "excluded" = rejected
// — the existing, already-documented validation_status value for "must
// never appear in any benchmark" (see supabase/test-fixtures.sql's
// Scenario L and migration 0019's own comment on why no new enum value
// was added).
export type ContributionReviewDecision = "valid" | "excluded";

// A contribution may only move OUT of "pending" — never re-review an
// already-decided row (re-approving/re-rejecting, or silently
// overwriting a prior decision, is not the smallest safe workflow —
// same rule lib/media/governanceRules.ts already applies to rate
// cards/snapshots/platforms), and never a "flagged"/"deleted" row
// either, both of which represent a different, unrelated state.
export function isValidContributionReviewTransition(currentStatus: string, decision: ContributionReviewDecision): boolean {
  return currentStatus === "pending" && (decision === "valid" || decision === "excluded");
}
