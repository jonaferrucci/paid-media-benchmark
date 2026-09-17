// Phase 20 §9/§10/§11: a deterministic, pure comparability engine.
// Compares two opportunities' CURRENT commercial offers only — never
// relies on a UI condition alone (§9 explicit instruction). No FX
// conversion exists or is introduced here (Phase 19B/20 scope): a
// currency mismatch is always `not_comparable`, never partially so,
// because there is no valid converted number to fall back to.

export type ComparabilityState = "comparable" | "partially_comparable" | "not_comparable" | "insufficient_data";

export type ComparabilityReasonCode = "missing_offer" | "currency_mismatch" | "pricing_unit_mismatch";

export interface ComparabilityResult {
  state: ComparabilityState;
  reasons: ComparabilityReasonCode[];
}

export interface PriceOfferLike {
  currency: string;
  pricingUnit: string;
}

// §10: currency mismatch -> not_comparable (no FX, ever).
// §11: matching currency but different pricing_unit -> partially_comparable
// (both raw values are legitimate to show side by side, they are just
// not mathematically equivalent — e.g. ARS/integration vs ARS/month).
// Both dimensions match -> comparable. Either offer missing (no current
// rate card) -> insufficient_data, checked first since there is nothing
// else to assess.
export function assessPriceComparability(a: PriceOfferLike | null, b: PriceOfferLike | null): ComparabilityResult {
  if (!a || !b) return { state: "insufficient_data", reasons: ["missing_offer"] };

  const reasons: ComparabilityReasonCode[] = [];
  if (a.currency !== b.currency) reasons.push("currency_mismatch");
  if (a.pricingUnit !== b.pricingUnit) reasons.push("pricing_unit_mismatch");

  if (reasons.includes("currency_mismatch")) return { state: "not_comparable", reasons };
  if (reasons.includes("pricing_unit_mismatch")) return { state: "partially_comparable", reasons };
  return { state: "comparable", reasons: [] };
}

export interface PairwiseComparability {
  indexA: number;
  indexB: number;
  result: ComparabilityResult;
}

// §6/§9: for a full selected set (2-4 opportunities), every distinct
// pair gets its OWN result — never collapsed into a single verdict for
// the whole set, so the UI can point at exactly which pair is
// incompatible and why.
export function assessSetComparability(offers: (PriceOfferLike | null)[]): PairwiseComparability[] {
  const results: PairwiseComparability[] = [];
  for (let i = 0; i < offers.length; i++) {
    for (let j = i + 1; j < offers.length; j++) {
      results.push({ indexA: i, indexB: j, result: assessPriceComparability(offers[i], offers[j]) });
    }
  }
  return results;
}
