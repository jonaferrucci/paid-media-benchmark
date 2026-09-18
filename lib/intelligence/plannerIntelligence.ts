import type { ComparabilityReasonCode } from "../planning/comparability";

// Phase 23 §14/§15: a concise, factual summary of the CURRENT plan
// state, and grouped (never scattered) warnings. Both are pure
// re-descriptions of numbers the planner already computes elsewhere
// (lib/planning/budget.ts's MultiOpportunityTotals, lib/planning/
// comparability.ts's PairwiseComparability) — no new math, no score,
// no winner, exactly per §14's "No score. No winner."

export interface PlanSummaryInput {
  selectedCount: number;
  withRateCardCount: number; // opportunities that DO have a current commercial offer
  budgetValid: boolean;
  overBudget: boolean;
  // Already formatted by the caller's own formatPrice (this module never
  // reimplements currency formatting) — null whenever budgetValid is
  // false, since there is nothing to report yet.
  formattedBudgetDelta: string | null;
}

export function buildPlanSummaryLines(input: PlanSummaryInput, locale: "es" | "en" = "es"): string[] {
  const { selectedCount, withRateCardCount, budgetValid, overBudget, formattedBudgetDelta } = input;
  if (selectedCount === 0) return [];

  const lines: string[] = [];

  lines.push(
    locale === "es"
      ? `Seleccionaste ${selectedCount} ${selectedCount === 1 ? "oportunidad" : "oportunidades"}.`
      : `You selected ${selectedCount} ${selectedCount === 1 ? "opportunity" : "opportunities"}.`
  );

  lines.push(
    locale === "es"
      ? `${withRateCardCount} de ${selectedCount} ${withRateCardCount === 1 ? "tiene" : "tienen"} tarifario vigente.`
      : `${withRateCardCount} of ${selectedCount} ${withRateCardCount === 1 ? "has" : "have"} a current rate card.`
  );

  const withoutRateCard = selectedCount - withRateCardCount;
  if (withoutRateCard > 0) {
    lines.push(
      locale === "es"
        ? `${withoutRateCard} no ${withoutRateCard === 1 ? "puede" : "pueden"} incluirse en el cálculo de presupuesto.`
        : `${withoutRateCard} ${withoutRateCard === 1 ? "cannot" : "cannot"} be included in the budget calculation.`
    );
  }

  if (budgetValid && formattedBudgetDelta !== null) {
    lines.push(
      overBudget
        ? locale === "es"
          ? `Excede el presupuesto por ${formattedBudgetDelta}.`
          : `Exceeds the budget by ${formattedBudgetDelta}.`
        : locale === "es"
        ? `Quedan ${formattedBudgetDelta} disponibles.`
        : `${formattedBudgetDelta} remaining.`
    );
  }

  return lines;
}

// §15: fixed, deterministic grouping order — never scattered ad hoc.
// Only groups with at least one real occurrence are ever returned, so
// the UI renders nothing when the plan has no warnings at all.
export type PlannerWarningId = "currency_mismatch" | "pricing_unit_mismatch" | "missing_rate_card" | "stale_public_data";

export interface PlannerWarningGroup {
  id: PlannerWarningId;
  count: number;
}

const WARNING_ORDER: PlannerWarningId[] = ["currency_mismatch", "pricing_unit_mismatch", "missing_rate_card", "stale_public_data"];

export function groupPlannerWarnings(input: {
  pairwiseReasons: ComparabilityReasonCode[][];
  missingRateCardCount: number;
  staleSignalCount: number;
}): PlannerWarningGroup[] {
  const counts: Record<PlannerWarningId, number> = {
    currency_mismatch: 0,
    pricing_unit_mismatch: 0,
    missing_rate_card: input.missingRateCardCount,
    stale_public_data: input.staleSignalCount,
  };

  for (const reasons of input.pairwiseReasons) {
    if (reasons.includes("currency_mismatch")) counts.currency_mismatch += 1;
    if (reasons.includes("pricing_unit_mismatch")) counts.pricing_unit_mismatch += 1;
  }

  return WARNING_ORDER.filter((id) => counts[id] > 0).map((id) => ({ id, count: counts[id] }));
}

// §12/§15 "Datos públicos desactualizados": a signal is stale past a
// fixed, documented threshold — never an invented per-metric rule, and
// never a claim of a trend, just an age check on the observed_at date
// already shown via freshnessLabel elsewhere.
export function countStaleSignals(signals: { observed_at: string }[], now: Date, thresholdDays = 90): number {
  return signals.filter((s) => {
    const observed = new Date(s.observed_at + "T00:00:00Z");
    const diffDays = Math.floor((now.getTime() - observed.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > thresholdDays;
  }).length;
}
