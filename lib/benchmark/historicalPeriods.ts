// HISTORICAL BENCHMARKS ARCHITECTURE — pure period-boundary generation.
//
// No Supabase/Next.js dependency here on purpose (same convention as
// lib/benchmark/stats.ts) — plain dates in, plain date-range objects
// out, directly unit-testable. This module only decides WHERE period
// boundaries fall; it never touches performance_datasets and never
// decides what a period's benchmark values are (that's
// lib/benchmark/engine.ts's getHistoricalBenchmark, which resolves each
// boundary the exact same way any other query does — a dataset belongs
// to a period when its own start_date falls inside it, matching the
// existing, documented interpretation in lib/benchmark/timeWindow.ts).
//
// "custom" period counts as a real end-to-end supported TimeWindowInput
// case already (lib/benchmark/timeWindow.ts's resolveTimeWindow), so
// generating {kind: "custom", startDate, endDate} pairs here and
// handing them to the existing engine is not a new capability — it's
// the one that was already implemented but never exercised by any UI
// path (see app/benchmark/actions.ts's toTimeWindowInput, which never
// produces "custom" from user input).

export type HistoricalGranularity = "month" | "quarter";

export interface HistoricalPeriodBounds {
  start: string; // ISO date, inclusive
  end: string; // ISO date, inclusive
  // Stable, sortable, locale-free identifier — "2026-09" for a month,
  // "2026-Q3" for a quarter. Display labels are built in the UI layer
  // via i18n/Intl, never baked in here (same separation of concerns as
  // the rest of the engine: this layer returns raw values, the UI
  // formats/labels them).
  periodKey: string;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Generates `count` consecutive, calendar-aligned periods ending with
 * whichever period `now` currently falls in — which may be a partial,
 * still-in-progress period. That partial period is never excluded or
 * silently "completed": it gets its own real, honest sample size and
 * status like any other, exactly per this feature's "no interpolation,
 * no filled gaps" rule. Oldest period first (index 0), matching how a
 * chart or list reads left-to-right / top-to-bottom.
 *
 * `now` is injected (defaults to `new Date()`) so this is deterministic
 * and testable without mocking global time.
 */
export function generateHistoricalPeriods(
  granularity: HistoricalGranularity,
  count: number,
  now: Date = new Date()
): HistoricalPeriodBounds[] {
  if (count <= 0) return [];
  const periods: HistoricalPeriodBounds[] = [];

  if (granularity === "month") {
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
      periods.push({ start: toIsoDate(start), end: toIsoDate(end), periodKey: toIsoDate(start).slice(0, 7) });
    }
    return periods;
  }

  // Quarter: calendar-aligned (Jan-Mar / Apr-Jun / Jul-Sep / Oct-Dec),
  // never a rolling 3-month window from an arbitrary day — a "quarter"
  // that doesn't line up with the calendar quarters everyone already
  // reports against would be confusing to compare, not clarifying.
  const currentQuarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  for (let i = count - 1; i >= 0; i--) {
    const startMonth = currentQuarterStartMonth - i * 3;
    const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
    const quarterNumber = Math.floor(start.getUTCMonth() / 3) + 1;
    periods.push({ start: toIsoDate(start), end: toIsoDate(end), periodKey: `${start.getUTCFullYear()}-Q${quarterNumber}` });
  }
  return periods;
}
