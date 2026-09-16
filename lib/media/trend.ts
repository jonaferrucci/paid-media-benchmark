// Phase 18: pure historical-intelligence helpers. No Supabase
// dependency, directly testable. Reuses the existing snapshot shape
// from lib/media/catalog.ts / migration 0012 — no schema change
// needed (unit_type already distinguishes count/rate/duration).

export interface SnapshotLike {
  value: number;
  observed_at: string; // YYYY-MM-DD
  source: string;
}

// Snapshots MUST already be sorted desc by observed_at (the same
// convention used throughout lib/media/catalog.ts's queries).
export function resolveLatestAndPrevious<T extends SnapshotLike>(
  snapshotsDescByDate: T[]
): { latest: T | null; previous: T | null } {
  return {
    latest: snapshotsDescByDate[0] ?? null,
    previous: snapshotsDescByDate[1] ?? null,
  };
}

export interface ChangeResult {
  absolute: number;
  percent: number | null; // null when the denominator is zero — never divide by zero
}

// Only ever called with two observations of the SAME metric for the
// SAME entity (item 12) — the caller is responsible for that
// invariant; this function only handles the arithmetic safety.
export function computeChange(previousValue: number, latestValue: number): ChangeResult {
  const absolute = latestValue - previousValue;
  const percent = previousValue === 0 ? null : (absolute / previousValue) * 100;
  return { absolute, percent };
}

// Item 10: deterministic trend-eligibility rule. 1 point is a value
// only, 2 points support latest+previous+change, 3+ supports a trend
// visualization — never pretend fewer points establish a real trend.
export type TrendEligibility = "value_only" | "change_only" | "trend";

export function trendEligibility(snapshotCount: number): TrendEligibility {
  if (snapshotCount >= 3) return "trend";
  if (snapshotCount === 2) return "change_only";
  return "value_only";
}

// Item 11: whether "change" is meaningful to show for this metric's
// unit_type. Cumulative/count values (subscribers, total views) and
// rate values (videos_per_month) can both sensibly show a delta;
// "duration" (e.g. channel_age) generally should not be framed as a
// growth percentage. Reuses the EXISTING unit_type field from
// migration 0012 rather than adding new metadata.
export function isChangeMeaningful(unitType: string): boolean {
  return unitType === "count" || unitType === "rate";
}

// Item 14: neutral, non-judgmental freshness label. `now` is injected
// for testability (never Date.now() directly inside the pure function).
export function freshnessLabel(observedAt: string, now: Date, locale: "es" | "en" = "es"): string {
  const observed = new Date(observedAt + "T00:00:00Z");
  const diffDays = Math.floor((now.getTime() - observed.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return locale === "es" ? "Actualizado hoy" : "Updated today";
  if (diffDays === 1) return locale === "es" ? "Hace 1 día" : "1 day ago";
  if (diffDays < 30) return locale === "es" ? `Hace ${diffDays} días` : `${diffDays} days ago`;
  const months = Math.floor(diffDays / 30);
  if (months < 12) return locale === "es" ? `Hace ${months} ${months === 1 ? "mes" : "meses"}` : `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(months / 12);
  return locale === "es" ? `Hace ${years} ${years === 1 ? "año" : "años"}` : `${years} ${years === 1 ? "year" : "years"} ago`;
}

// Item 21: within-import duplicate detection for snapshot rows —
// same identity concept as lib/import/validate.ts's detectDuplicates,
// but scoped to the snapshot shape (outlet+property+metric+observed_at).
export interface SnapshotDuplicateCandidate {
  platformKey: string;
  propertyKey: string | null;
  metricKey: string;
  observedAt: string;
}

export function findDuplicateSnapshotIndices(rows: SnapshotDuplicateCandidate[]): Set<number> {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();
  rows.forEach((row, index) => {
    const key = `${row.platformKey}|${row.propertyKey ?? ""}|${row.metricKey}|${row.observedAt}`;
    if (seen.has(key)) duplicates.add(index);
    else seen.set(key, index);
  });
  return duplicates;
}
