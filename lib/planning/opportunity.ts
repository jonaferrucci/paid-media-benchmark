import type { RateCardGroup, RateCardIdentity, RateCardLike } from "../media/rateCardHistory";

// Phase 20 §4: a "planning opportunity" is the conceptual unit the
// brief defines — Media Outlet + Property (where relevant) + Commercial
// Format + Current active Rate Card. This module assembles that unit
// out of the EXISTING Phase 19/19B rate-card grouping (RateCardGroup,
// groupRateCardsByIdentity, resolveCurrentRateCard) — it never
// re-derives current/previous/change/history logic itself. No Supabase
// dependency; directly unit-testable.

export interface OpportunityTaxonomyCombo {
  platformId: string;
  propertyId: string | null;
  mediaFormatId: string;
}

export interface PlanningOpportunity<T extends RateCardLike & RateCardIdentity> {
  platformId: string;
  propertyId: string | null;
  mediaFormatId: string;
  // null = no commercial data has ever been submitted for this exact
  // outlet+property+format identity (any currency/pricing-unit) — the
  // opportunity is still shown for research (§21), just excluded from
  // budget math (see hasCurrentCommercialOffer).
  rateCardGroup: RateCardGroup<T> | null;
}

function comboKey(c: { platformId: string; propertyId: string | null; mediaFormatId: string }): string {
  return [c.platformId, c.propertyId ?? "", c.mediaFormatId].join("|");
}

// Merges a taxonomy-driven set of outlet+format combinations (discovery
// must surface a combo even before any rate card exists at all, so an
// outlet can show "Sin tarifario vigente" rather than disappearing —
// §21) with the ACTUAL rate-card groups already resolved by
// groupRateCardsByIdentity (Phase 19B, reused unmodified). A combo with
// zero matching groups produces exactly one opportunity with
// rateCardGroup: null. A combo with rate cards in more than one
// currency/pricing-unit produces one opportunity PER group — the real
// commercial variants are never collapsed into a single guess. A
// rate-card group whose combo isn't in the taxonomy list (e.g. a format
// no longer marked active/available) is still real commercial data and
// is surfaced rather than silently dropped.
export function buildOpportunities<T extends RateCardLike & RateCardIdentity>(
  combos: OpportunityTaxonomyCombo[],
  rateCardGroups: RateCardGroup<T>[]
): PlanningOpportunity<T>[] {
  const groupsByCombo = new Map<string, RateCardGroup<T>[]>();
  for (const g of rateCardGroups) {
    const key = comboKey(g.identity);
    const list = groupsByCombo.get(key) ?? [];
    list.push(g);
    groupsByCombo.set(key, list);
  }

  const opportunities: PlanningOpportunity<T>[] = [];
  const seenCombos = new Set<string>();

  for (const combo of combos) {
    const key = comboKey(combo);
    seenCombos.add(key);
    const groups = groupsByCombo.get(key);
    if (groups && groups.length > 0) {
      for (const g of groups) {
        opportunities.push({ platformId: combo.platformId, propertyId: combo.propertyId, mediaFormatId: combo.mediaFormatId, rateCardGroup: g });
      }
    } else {
      opportunities.push({ platformId: combo.platformId, propertyId: combo.propertyId, mediaFormatId: combo.mediaFormatId, rateCardGroup: null });
    }
  }

  for (const g of rateCardGroups) {
    const key = comboKey(g.identity);
    if (!seenCombos.has(key)) {
      opportunities.push({ platformId: g.identity.platformId, propertyId: g.identity.propertyId, mediaFormatId: g.identity.mediaFormatId, rateCardGroup: g });
    }
  }

  return opportunities;
}

// §5: an opportunity is includable in budget/price-comparison math only
// when it has a canonical CURRENT rate card — pending/rejected/expired/
// future-dated/absent are all excluded, never fabricated. Reuses the
// group's already-resolved `current` (itself resolved via
// resolveCurrentRateCard: active + within validity window, pending
// never eligible) — never re-derived here.
export function hasCurrentCommercialOffer<T extends RateCardLike & RateCardIdentity>(
  opportunity: PlanningOpportunity<T>
): opportunity is PlanningOpportunity<T> & { rateCardGroup: RateCardGroup<T> & { current: T } } {
  return opportunity.rateCardGroup !== null && opportunity.rateCardGroup.current !== null;
}
