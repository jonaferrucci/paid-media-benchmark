import type { TimeWindowInput } from "./types";

export interface ResolvedTimeWindow {
  startDate: string; // ISO date, inclusive
  endDate: string; // ISO date, inclusive
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolves a Time Window into concrete date bounds. A dataset is
 * considered "inside" the window when its start_date falls within
 * [startDate, endDate] — chosen over an overlap-based rule (where a
 * long-running campaign that merely touches the window would count)
 * because it gives an unambiguous, conservative reading of "Observations
 * outside the selected Time Window must never be silently included"
 * (07-BENCHMARK-ENGINE-AND-STATISTICAL-RULES.md). Documented here as a
 * deliberate interpretation, not an accidental one — flagged in the
 * Phase 4 report as open to revision if the product docs are made more
 * explicit later.
 */
export function resolveTimeWindow(input: TimeWindowInput, now: Date = new Date()): ResolvedTimeWindow {
  switch (input.kind) {
    case "current_year": {
      const year = now.getUTCFullYear();
      return { startDate: `${year}-01-01`, endDate: toIsoDate(now) };
    }
    case "last_3_months":
      return { startDate: toIsoDate(monthsAgo(now, 3)), endDate: toIsoDate(now) };
    case "last_6_months":
      return { startDate: toIsoDate(monthsAgo(now, 6)), endDate: toIsoDate(now) };
    case "last_12_months":
      return { startDate: toIsoDate(monthsAgo(now, 12)), endDate: toIsoDate(now) };
    case "custom":
      return { startDate: input.startDate, endDate: input.endDate };
  }
}

function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}
