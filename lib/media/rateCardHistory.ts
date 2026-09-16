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

// Phase 19B item 1: groups a platform's rate cards by exact compatible
// identity (outlet + property + format + currency + pricing_unit —
// the SAME identity areRateCardsCompatible already enforces) and
// resolves current/previous/change/history for each group. This is
// the single function the media profile page wires up — never a
// second, page-level reimplementation of the Phase 19 comparison
// rules. A group with no currently-eligible row (hasOnlyPendingRateCards,
// or every row expired/future-dated) still comes back so the UI can
// show an honest "sin precio vigente" state instead of silently
// dropping the identity.
export interface RateCardGroup<T extends RateCardLike & RateCardIdentity> {
  identity: RateCardIdentity;
  current: T | null;
  previous: T | null;
  change: ChangeResult | null;
  // Compact historical list: active/superseded rows only (chronological,
  // most recent first). Pending rows are deliberately EXCLUDED here too
  // — a pending submission has never been a real effective price, so it
  // must never appear inside "price history" any more than it may be
  // shown as the current price (item 1's "never treat pending as
  // canonical", same rule migration 0012's RLS comment already states).
  history: T[];
  isPendingOnly: boolean;
  // Count only — never the pending row's price/date, so the UI can say
  // "N submissions awaiting review" without presenting an unverified
  // number as fact.
  pendingCount: number;
}

function identityKey(identity: RateCardIdentity): string {
  return [identity.platformId, identity.propertyId ?? "", identity.mediaFormatId, identity.currency, identity.pricingUnit].join("|");
}

export function groupRateCardsByIdentity<T extends RateCardLike & RateCardIdentity>(
  rateCards: T[],
  today: Date
): RateCardGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const rc of rateCards) {
    const key = identityKey(rc);
    const list = groups.get(key) ?? [];
    list.push(rc);
    groups.set(key, list);
  }

  return Array.from(groups.values()).map((group) => {
    // Item 1: current/previous/change and the visible history are
    // resolved from active+superseded rows ONLY — a pending row must
    // never be eligible as "previous" for a change calculation any
    // more than it may be shown as "current" (resolveCurrentRateCard
    // already excludes it; this excludes it from the comparison pool
    // resolvePreviousRateCardAndChange searches too).
    const verified = group.filter((rc) => rc.status !== "pending");
    const current = resolveCurrentRateCard(verified, today);
    const { previous, change } = current
      ? resolvePreviousRateCardAndChange(current, verified)
      : { previous: null, change: null };
    return {
      identity: { platformId: group[0].platformId, propertyId: group[0].propertyId, mediaFormatId: group[0].mediaFormatId, currency: group[0].currency, pricingUnit: group[0].pricingUnit },
      current,
      previous,
      change,
      history: chronologicalHistory(verified),
      isPendingOnly: hasOnlyPendingRateCards(group),
      pendingCount: group.filter((rc) => rc.status === "pending").length,
    };
  });
}
