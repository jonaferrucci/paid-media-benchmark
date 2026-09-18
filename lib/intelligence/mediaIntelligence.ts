import type { ChangeResult } from "../media/trend";

// Phase 23 §9/§10/§11/§13: media-profile intelligence. Deliberately
// qualitative, never a score — §10 explicitly forbids "70% complete" /
// "8/10" framing. Completeness is a plain presence/absence read of the
// two data categories the profile page already shows (public signals,
// commercial/rate-card data); it is not a ranking of the outlet itself.

export type MediaCompletenessState = "full" | "partial" | "limited";

export function resolveMediaCompleteness(hasPublicMetrics: boolean, hasCurrentRateCard: boolean): MediaCompletenessState {
  if (hasPublicMetrics && hasCurrentRateCard) return "full";
  if (hasPublicMetrics || hasCurrentRateCard) return "partial";
  return "limited";
}

export type MediaSecondaryActionId = "contribute_rate_card" | "contribute_public_data" | null;

// §11: "Planificar con este medio" is always the primary action (the
// outlet is always discoverable/plannable, whether or not commercial
// data exists yet — Phase 22 §D). At most ONE secondary action is ever
// added on top: whichever data category is missing first, rate card
// before public data, matching the order the profile page itself lists
// them ("Qué datos tenemos"). Never both at once, and never a
// secondary action when both categories are already present.
export function resolveMediaNextAction(hasPublicMetrics: boolean, hasCurrentRateCard: boolean): MediaSecondaryActionId {
  if (!hasCurrentRateCard) return "contribute_rate_card";
  if (!hasPublicMetrics) return "contribute_public_data";
  return null;
}

// §13: "Este tarifario es 12% mayor que el anterior comparable." — only
// ever built from a REAL comparable change (already resolved by
// lib/media/rateCardHistory.ts's groupRateCardsByIdentity, which itself
// only compares same outlet+format+currency+pricing_unit rows). This
// function adds no new comparison logic; it only renders the existing
// ChangeResult as the one compact sentence the spec asks for, following
// the exact same pure-function-returns-final-string shape as
// lib/planning/explain.ts.
export function describeRateCardChange(change: ChangeResult | null, locale: "es" | "en" = "es"): string {
  if (change === null) return "";

  if (change.percent !== null) {
    const absPercent = Math.abs(change.percent).toFixed(1).replace(/\.0$/, "");
    const higher = change.percent > 0;
    if (change.percent === 0) {
      return locale === "es" ? "Este tarifario no cambió respecto del anterior comparable." : "This rate card is unchanged from the previous comparable one.";
    }
    return locale === "es"
      ? `Este tarifario es ${absPercent}% ${higher ? "mayor" : "menor"} que el anterior comparable.`
      : `This rate card is ${absPercent}% ${higher ? "higher" : "lower"} than the previous comparable one.`;
  }

  // Previous price was 0 — percent is undefined by design (trend.ts
  // never divides by zero), so fall back to the absolute direction only.
  if (change.absolute === 0) {
    return locale === "es" ? "Este tarifario no cambió respecto del anterior comparable." : "This rate card is unchanged from the previous comparable one.";
  }
  return locale === "es"
    ? `Este tarifario ${change.absolute > 0 ? "aumentó" : "disminuyó"} respecto del anterior comparable.`
    : `This rate card ${change.absolute > 0 ? "increased" : "decreased"} from the previous comparable one.`;
}
