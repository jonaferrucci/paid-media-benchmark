// Phase 19B item 3 — pure, DB-free governance/authorization rules.
// Deliberately separated from lib/media/governanceActions.ts (the
// Supabase-touching server actions) so the decision logic itself is
// directly unit-testable without a live database: the actions below
// call these functions FIRST and only ever proceed to the database
// when they return an "allowed"/valid result — RLS (migration 0014)
// is the real, un-bypassable enforcement, but failing fast here means
// a bug in the UI can never even attempt an unauthorized write.

export type GovernanceAuthResult =
  | { allowed: true }
  | { allowed: false; error: "not_authenticated" | "not_authorized" };

// Never trust a client-side role check alone: this is the same
// decision the server action makes right before touching the
// database, and it's the one this module's tests exercise directly.
export function authorizeGovernanceAction(isAuthenticated: boolean, isCurator: boolean): GovernanceAuthResult {
  if (!isAuthenticated) return { allowed: false, error: "not_authenticated" };
  if (!isCurator) return { allowed: false, error: "not_authorized" };
  return { allowed: true };
}

export type RateCardReviewDecision = "active" | "rejected";
export type SnapshotReviewDecision = "active" | "rejected";
export type PlatformReviewDecision = "active" | "inactive";

// A rate card / snapshot may only move OUT of "pending" — never
// re-review an already-active/superseded/rejected row through this
// path (re-activating a rejected submission, or silently overwriting
// an already-decided one, is not "the smallest safe workflow";
// resubmission is the correct path for a rejected contribution).
export function isValidRateCardTransition(currentStatus: string, decision: RateCardReviewDecision): boolean {
  return currentStatus === "pending" && (decision === "active" || decision === "rejected");
}

export function isValidSnapshotTransition(currentStatus: string, decision: SnapshotReviewDecision): boolean {
  return currentStatus === "pending" && (decision === "active" || decision === "rejected");
}

// Platforms use "inactive" rather than "rejected" (matching the
// existing status enum from migration 0012 — active/inactive/pending,
// no "rejected" value for this table) — a pending outlet suggestion is
// either accepted into the catalog or kept out of it, never framed as
// a rejected submission the way a specific price/metric value is.
export function isValidPlatformStatusTransition(currentStatus: string, decision: PlatformReviewDecision): boolean {
  return currentStatus === "pending" && (decision === "active" || decision === "inactive");
}
