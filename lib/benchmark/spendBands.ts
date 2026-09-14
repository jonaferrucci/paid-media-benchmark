import type { SpendBand, DurationBand } from "@/lib/types";

// Spend-band thresholds are the conceptual USD-denominated bands from
// 02-DATA-DIMENSIONS-AND-TAXONOMIES.md "Spend Range". Since there is no
// FX normalization (Phase 4.1 explicitly defers it), these thresholds
// are only meaningful for USD-currency datasets — see
// classifySpendBand's currency guard below.
const SPEND_BAND_THRESHOLDS: { band: SpendBand; max: number | null }[] = [
  { band: "under_500", max: 500 },
  { band: "500_2000", max: 2000 },
  { band: "2000_10000", max: 10000 },
  { band: "10000_50000", max: 50000 },
  { band: "50000_100000", max: 100000 },
  { band: "100000_plus", max: null }, // no upper bound
];

const DURATION_BAND_THRESHOLDS: { band: DurationBand; max: number | null }[] = [
  { band: "1_7", max: 7 },
  { band: "8_14", max: 14 },
  { band: "15_30", max: 30 },
  { band: "31_60", max: 60 },
  { band: "61_90", max: 90 },
  { band: "91_180", max: 180 },
  { band: "181_365", max: 365 },
  { band: "365_plus", max: null },
];

/**
 * Normalized Monthly Spend = Advertising Spend / Duration Days × 30.
 * Classification-only — mirrors fn_normalized_monthly_spend() in the
 * database (0004_performance_datasets.sql) exactly. Never used to
 * overwrite or replace the raw submitted spend value anywhere.
 */
export function normalizedMonthlySpend(rawSpend: number, durationDays: number): number | null {
  if (!Number.isFinite(rawSpend) || !Number.isFinite(durationDays) || durationDays <= 0) return null;
  return (rawSpend / durationDays) * 30;
}

/**
 * Classifies a normalized monthly spend value into a band — but ONLY
 * for USD-denominated datasets. The band labels ("USD 2,000–10,000")
 * are only valid for USD amounts; without FX normalization, a
 * 2,000 ARS/month dataset is NOT the same scale as 2,000 USD/month, so
 * pretending otherwise would silently misclassify it. Returns null
 * (unclassifiable) for any other currency — callers must exclude, not
 * guess, when this returns null and a spend-band filter is active.
 */
export function classifySpendBand(normalizedSpend: number, currency: string): SpendBand | null {
  if (currency.toUpperCase() !== "USD") return null;
  for (const { band, max } of SPEND_BAND_THRESHOLDS) {
    if (max === null || normalizedSpend < max) return band;
  }
  return "100000_plus";
}

/** Duration is currency-independent — always classifiable. */
export function classifyDurationBand(durationDays: number): DurationBand {
  for (const { band, max } of DURATION_BAND_THRESHOLDS) {
    if (max === null || durationDays <= max) return band;
  }
  return "365_plus";
}
