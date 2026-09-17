// Phase 20 §12/§13/§14: estimated efficiency (CPM/CPV) is computed
// ONLY against an explicit, compatible delivery denominator — never
// against subscriber counts or lifetime/recent view counts (both are
// explicitly prohibited denominators, §12/§13). The canonical schema
// shipped through Phase 19B has no "estimated/guaranteed delivery"
// field on media_rate_cards, so in production this will currently
// always resolve to `no_estimate` for every real opportunity — that is
// an intentionally valid, honest product result (§13 explicitly says
// so), never a bug and never worked around with a fabricated fallback.
// This module exists so that WHEN a legitimate denominator is modeled
// in a future phase, the math is already correct, isolated, and tested.

export type DeliveryKind = "impressions" | "views";

export interface DeliveryEstimate {
  kind: DeliveryKind;
  quantity: number;
}

export type EstimatedMetricResult =
  | { state: "no_estimate" }
  | { state: "zero_denominator" }
  | { state: "estimated"; metric: "cpm" | "cpv"; value: number; currency: string };

// `price` must already be denominated the same way as `delivery` — this
// function performs the arithmetic only; it is the caller's
// responsibility to never pass a delivery estimate that isn't
// genuinely compatible with the price it's being divided into (Data
// Visualization doc: "never visually imply... without normalization").
export function computeEstimatedMetric(price: number, currency: string, delivery: DeliveryEstimate | null): EstimatedMetricResult {
  if (!delivery) return { state: "no_estimate" };
  if (!Number.isFinite(delivery.quantity) || delivery.quantity <= 0) return { state: "zero_denominator" };
  if (!Number.isFinite(price) || price < 0) return { state: "no_estimate" };

  if (delivery.kind === "impressions") {
    // CPM = cost per one thousand impressions.
    return { state: "estimated", metric: "cpm", value: (price / delivery.quantity) * 1000, currency };
  }
  return { state: "estimated", metric: "cpv", value: price / delivery.quantity, currency };
}

// §12/§13: named, explicit guard documenting which audience-signal
// sources may NEVER be used as an efficiency denominator. Only a
// modeled, explicit, guaranteed delivery figure is a legitimate
// denominator — subscriber counts, lifetime channel views, and recent/
// median view counts are all audience CONTEXT (§12), never a delivery
// guarantee for a specific commercial offer, so none of them may be
// used here even though they are directly relevant, honest numbers to
// show elsewhere on the same screen. There is no code path in
// computeEstimatedMetric that accepts a bare "audience size" — a
// caller must construct an explicit DeliveryEstimate. This function
// exists so the prohibition itself is testable rather than only "true
// by omission".
export function isProhibitedEfficiencyDenominator(
  source: "subscribers" | "lifetime_views" | "recent_average_views" | "median_recent_views" | "explicit_delivery"
): boolean {
  return source !== "explicit_delivery";
}
