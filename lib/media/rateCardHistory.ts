import { computeChange, type ChangeResult } from "./trend";

// Phase 19: pure rate-card history helpers. No Supabase dependency,
// directly testable. Reuses the existing media_rate_cards schema from
// migration 0012 (status/currency/pricing_unit/valid_from/valid_to) —
// no new migration needed.

export interface RateCardLike {
  id: string;
  price: number;
  currency: string;
  pricingUnit: string;
  status: "active" | "superseded" | "pending";
  validFrom: string; // YYYY-MM-DD
  validTo: string | null;
}

// Item 2: "current" means status=active AND valid_from <= today AND
// (valid_to is null OR valid_to >= today). Pending rows are NEVER
// treated as current, no matter how recent — canonical pricing stays
// curator-controlled (matches platforms.status governance pattern).
export function resolveCurrentRateCard<T extends RateCardLike>(rateCards: T[], today: Date): T | null {
  const todayIso = today.toISOString().slice(0, 10);
  const eligible = rateCards.filter(
    (rc) => rc.status === "active" && rc.validFrom <= todayIso && (rc.validTo === null || rc.validTo >= todayIso)
  );
  if (eligible.length === 0) return null;
  // If multiple eligible rows exist (shouldn't normally happen), the
  // most recently-started one wins — deterministic, not arbitrary.
  return eligible.reduce((latest, rc) => (rc.validFrom > latest.validFrom ? rc : latest));
}

// Item 3: two rate cards are only "compatible" for comparison when
// outlet + property + format + currency + pricing_unit all match.
// Comparing ARS vs USD, or per_integration vs per_month, is explicitly
// forbidden by the brief — this function is the single enforcement
// point for that rule.
export interface RateCardIdentity {
  platformId: string;
  propertyId: string | null;
  mediaFormatId: string;
  currency: string;
  pricingUnit: string;
}

export function areRateCardsCompatible(a: RateCardIdentity, b: RateCardIdentity): boolean {
  return (
    a.platformId === b.platformId &&
    a.propertyId === b.propertyId &&
    a.mediaFormatId === b.mediaFormatId &&
    a.currency === b.currency &&
    a.pricingUnit === b.pricingUnit
  );
}

// Item 3/4: resolves the previous COMPATIBLE rate card (by valid_from,
// strictly before the current one) and computes the change — reusing
// computeChange from trend.ts (same zero-denominator safety), never
// duplicating that arithmetic.
export function resolvePreviousRateCardAndChange<T extends RateCardLike & RateCardIdentity>(
  current: T,
  allRateCardsForOutlet: T[]
): { previous: T | null; change: ChangeResult | null } {
  const compatible = allRateCardsForOutlet
    .filter((rc) => rc.id !== current.id && areRateCardsCompatible(rc, current) && rc.validFrom < current.validFrom)
    .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1)); // desc by validFrom

  const previous = compatible[0] ?? null;
  if (!previous) return { previous: null, change: null };
  return { previous, change: computeChange(previous.price, current.price) };
}

// Item 24: whether the outlet has ONLY pending records (no canonical
// current price yet) — the UI must never present a pending price as
// authoritative.
export function hasOnlyPendingRateCards<T extends RateCardLike>(rateCards: T[]): boolean {
  return rateCards.length > 0 && rateCards.every((rc) => rc.status === "pending");
}

// Chronological history for a given compatible identity, most recent
// first — used by the "Ver historial" expandable list.
export function chronologicalHistory<T extends RateCardLike>(rateCards: T[]): T[] {
  return [...rateCards].sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
}
