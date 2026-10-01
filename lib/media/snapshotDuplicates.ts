// CUCURUCHO CONTRIBUTION RELIABILITY PASS B — §1-3/§9/§10: public
// metric duplicate/conflict classification. Two independent, pure
// layers — mirroring the existing campaign architecture
// (lib/import/duplicates.ts holds the pure logic, a sibling "use
// server" action does the one batched DB read) — composed by the
// caller, never merged into one function:
//
//   - WITHIN-FILE (classifySnapshotFileDuplicates): two rows in the
//     SAME upload. Only internal_key strings are available this early
//     — the import flow never has real database ids client-side (see
//     app/contribute/public-metrics/page.tsx, which only ever selects
//     internal_key/display_label) — so this operates on those keys
//     directly. That's self-consistent: every row in one file
//     references a platform/metric by the same key representation, so
//     comparing keys to keys here is exactly as correct as comparing
//     resolved ids to resolved ids would be.
//   - CROSS-DB (classifySnapshotAgainstExisting): the same identity,
//     resolved to real database ids by the caller (the "use server"
//     action in app/contribute/public-metrics/duplicateActions.ts —
//     never here; this module has no database access at all, exactly
//     like every other pure duplicate-classification module in this
//     codebase, e.g. lib/import/duplicates.ts).
//
// Canonical logical identity (approved product decision): platform +
// media_property_id (when present) + metric + observed_at.
//   - "source" is explicitly PROVENANCE, never identity — two
//     submissions citing different sources for the same platform/
//     metric/day are still the same logical observation.
//   - "value" is also not part of identity, but it IS exactly what
//     separates an EXACT_DUPLICATE (same identity, same value) from a
//     CONFLICTING_VERSION (same identity, a different value).
//   - A different observed_at is simply a different identity — a
//     legitimate new observation, never classified as anything by
//     this module at all.
//
// Never decides a winner. An EXACT_DUPLICATE is advisory and
// skippable; a CONFLICTING_VERSION is only ever reported — it may
// still be submitted for curator review, exactly as written. No value
// is ever overwritten, no "latest wins" logic exists anywhere here.
// Database-level uniqueness enforcement (a fingerprint/unique index,
// mirroring campaigns' observation_fingerprint) is explicitly deferred
// to Pass C — this module only ever warns.

export type SnapshotDuplicateVerdict = "exact_duplicate" | "conflicting_version" | "none";

// -----------------------------------------------------------------------
// Within-file: identity expressed as the internal_key strings the
// import flow actually has access to before anything reaches the
// server. propertyKey is always null today — see
// lib/media/importSnapshots.ts's ValidatedSnapshotRow, which (like
// RawRateCardRow's own `property` field) never carries a resolved
// property through validation; this pass does not change that
// (CONTRIBUTION RELIABILITY PASS B §12: "Do NOT change
// media_property_id behavior in this pass").
// -----------------------------------------------------------------------
export interface SnapshotFileCandidate {
  platformKey: string;
  propertyKey: string | null;
  metricKey: string;
  observedAt: string;
  value: number;
}

export function classifySnapshotFileDuplicates(rows: SnapshotFileCandidate[]): Map<number, SnapshotDuplicateVerdict> {
  // One Map keyed by the identity string — O(n), the same technique
  // every other within-file check in this codebase already uses
  // (lib/import/validate.ts's detectDuplicates, the pre-existing
  // findDuplicateSnapshotIndices in lib/media/trend.ts) — never O(n²)
  // pairwise comparison.
  const firstValueByKey = new Map<string, number>();
  const result = new Map<number, SnapshotDuplicateVerdict>();
  rows.forEach((row, index) => {
    const key = `${row.platformKey}|${row.propertyKey ?? ""}|${row.metricKey}|${row.observedAt}`;
    if (firstValueByKey.has(key)) {
      result.set(index, firstValueByKey.get(key) === row.value ? "exact_duplicate" : "conflicting_version");
    } else {
      firstValueByKey.set(key, row.value);
    }
  });
  return result;
}

// -----------------------------------------------------------------------
// Cross-DB: identity resolved to real database ids by the caller.
// Deliberately a SEPARATE, differently-named type from
// SnapshotFileCandidate above — a client-side key string is never
// mixed into a field meant to hold a real id, or vice versa.
// -----------------------------------------------------------------------
export interface ResolvedSnapshotIdentity {
  platformId: string;
  propertyId: string | null;
  metricDefinitionId: string;
  observedAt: string;
}

export interface ExistingSnapshotSignature extends ResolvedSnapshotIdentity {
  id: string;
  value: number;
}

export interface SnapshotDuplicateMatch {
  verdict: SnapshotDuplicateVerdict;
  // The specific existing snapshot(s) that produced this verdict —
  // never exposed as full rows to the browser, only ids (see the
  // "use server" action, which selects no owner/submitted_by column at
  // all).
  matchedExistingIds: string[];
}

const NO_SNAPSHOT_MATCH: SnapshotDuplicateMatch = { verdict: "none", matchedExistingIds: [] };

function sameResolvedIdentity(a: ResolvedSnapshotIdentity, b: ResolvedSnapshotIdentity): boolean {
  return (
    a.platformId === b.platformId &&
    (a.propertyId ?? "") === (b.propertyId ?? "") &&
    a.metricDefinitionId === b.metricDefinitionId &&
    a.observedAt === b.observedAt
  );
}

/**
 * Classifies one incoming (about-to-be-imported) snapshot against the
 * already-persisted snapshots the caller supplies (a single batched
 * query — this function does no I/O itself). Never decides a winner:
 * a match with a different value is reported as a conflicting version,
 * never merged, overwritten, or silently resolved.
 */
export function classifySnapshotAgainstExisting(
  candidate: ResolvedSnapshotIdentity & { value: number },
  existing: ExistingSnapshotSignature[]
): SnapshotDuplicateMatch {
  const matches = existing.filter((e) => sameResolvedIdentity(candidate, e));
  if (matches.length === 0) return NO_SNAPSHOT_MATCH;

  const exact = matches.filter((m) => m.value === candidate.value);
  if (exact.length > 0) return { verdict: "exact_duplicate", matchedExistingIds: exact.map((m) => m.id) };

  return { verdict: "conflicting_version", matchedExistingIds: matches.map((m) => m.id) };
}
