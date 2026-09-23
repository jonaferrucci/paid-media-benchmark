// HISTORICAL BENCHMARKS ARCHITECTURE — pure, locale-aware period label
// formatting. No Supabase/React dependency, directly unit-testable.
// Mirrors the exact existing Intl.DateTimeFormat(locale === "es" ?
// "es-AR" : "en-US", ...) convention already used by
// app/comparisons/SavedComparisonsList.tsx and
// components/dashboard/Workspace.tsx for date labels — never a new
// date-formatting convention.

/**
 * Formats a periodKey produced by lib/benchmark/historicalPeriods.ts
 * ("2026-Q3" or "2026-09") into a short, localized display label.
 * Falls back to the raw key unchanged if it doesn't match either shape
 * — never throws, never fabricates a label for an unrecognized value.
 */
export function formatHistoricalPeriodLabel(periodKey: string, locale: "es" | "en"): string {
  const quarterMatch = periodKey.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) {
    const [, year, quarter] = quarterMatch;
    return locale === "es" ? `T${quarter} ${year}` : `Q${quarter} ${year}`;
  }

  const monthMatch = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const [, year, month] = monthMatch;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    // timeZone: "UTC" is required here (unlike the SavedComparisonsList/
    // Workspace convention this otherwise mirrors, which format real
    // timestamps where the viewer's local time is the right thing to
    // show): a periodKey has no time-of-day, it's a calendar month, and
    // `date` above is midnight UTC on the 1st. Without pinning the
    // formatter to UTC, any viewer west of UTC (e.g. Argentina, this
    // project's primary market) would see the PREVIOUS month's name for
    // that same instant — caught by scripts/test-historical-benchmarks.mts.
    return new Intl.DateTimeFormat(locale === "es" ? "es-AR" : "en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  }

  return periodKey;
}
