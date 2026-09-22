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

// Post-audit revision (migration 0019): the REAL enforcement of "a
// contribution may only move OUT of pending, and only to valid or
// excluded" now lives inside fn_review_contribution()'s own atomic
// `UPDATE ... WHERE validation_status = 'pending'` — not in this
// function or in any RLS WITH CHECK. This function is kept as the
// pure, DB-free SPEC of that same rule: it is unit-tested directly
// (no live database needed) so the transition matrix the RPC is
// supposed to implement is independently verifiable, and the
// migration's SQL is checked structurally (see
// scripts/test-phase28-contribution-validation.mts) to confirm the
// RPC's WHERE clause actually matches this same rule. It is
// deliberately NOT called by reviewActions.ts before the RPC anymore
// — pre-checking "is this row still pending?" and then updating it in
// a second, separate call is exactly the check-then-act race the
// atomic RPC exists to remove.
export function isValidContributionReviewTransition(currentStatus: string, decision: ContributionReviewDecision): boolean {
  return currentStatus === "pending" && (decision === "valid" || decision === "excluded");
}

// A cheap, DB-free rejection of a garbage `decision` value before ever
// calling the RPC. TypeScript's ContributionReviewDecision union only
// protects callers that go through the type checker — a server action
// is also reachable as a plain network call, so this guard is real
// input validation, not just a type-narrowing convenience. It is
// intentionally not the security boundary (fn_review_contribution()
// re-validates the exact same thing server-side, since a client-side/
// pure-function check can never be trusted as the only gate).
export function isValidContributionReviewDecision(decision: string): decision is ContributionReviewDecision {
  return decision === "valid" || decision === "excluded";
}
