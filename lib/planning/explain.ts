import type { ComparabilityResult } from "./comparability";

// Phase 20 §27: deterministic, factual explanation sentences. No LLM
// call, no fuzzy language — every sentence is a fixed template chosen
// by an already-computed state. Mirrors the exact pattern
// lib/media/trend.ts's freshnessLabel already established (a pure
// function taking a locale and returning a final ES/EN string, not a
// t()-dictionary lookup) — planning explanations are the same kind of
// "small factual sentence describing a computed state" as freshness.

type Locale = "es" | "en";

export function explainPriceComparability(
  result: ComparabilityResult,
  a: { currency: string; pricingUnit: string } | null,
  b: { currency: string; pricingUnit: string } | null,
  locale: Locale = "es"
): string {
  if (result.state === "insufficient_data") {
    return locale === "es"
      ? "No hay tarifario vigente para al menos una de las opciones seleccionadas, por lo que no se puede comparar el precio."
      : "At least one of the selected options has no current rate card, so price cannot be compared.";
  }
  if (result.state === "not_comparable") {
    return locale === "es"
      ? "No se comparan directamente porque están expresados en monedas diferentes."
      : "These are not directly comparable because they are expressed in different currencies.";
  }
  if (result.state === "partially_comparable") {
    return locale === "es"
      ? "Los precios no son directamente comparables porque usan unidades de venta distintas."
      : "These prices are not directly comparable because they use different pricing units.";
  }
  return locale === "es" && a
    ? `Ambos tarifarios están expresados en ${a.currency} por ${a.pricingUnit}, por lo que el precio de lista es directamente comparable.`
    : a
    ? `Both rate cards are expressed in ${a.currency} per ${a.pricingUnit}, so the list price is directly comparable.`
    : "";
}

export function explainMissingEfficiencyEstimate(locale: Locale = "es"): string {
  return locale === "es"
    ? "No hay una estimación de entrega compatible para calcular eficiencia."
    : "There is no compatible delivery estimate to calculate efficiency.";
}

export function explainAudienceSignalOnly(locale: Locale = "es"): string {
  return locale === "es"
    ? "Este medio tiene datos públicos de audiencia, pero no una estimación comercial de entrega."
    : "This outlet has public audience data, but no commercial delivery estimate.";
}

export function explainMissingRateCard(locale: Locale = "es"): string {
  return locale === "es" ? "Sin tarifario vigente." : "No current rate card.";
}

export function explainRequiresCommercialReview(locale: Locale = "es"): string {
  return locale === "es"
    ? "Requiere revisión comercial: este tarifario no admite un cálculo automático de unidades."
    : "Requires commercial review: this rate card doesn't support automatic unit calculation.";
}

export function explainOverBudget(differenceAbs: number, currency: string, locale: Locale = "es"): string {
  return locale === "es"
    ? `Excede presupuesto por ${currency} ${differenceAbs.toLocaleString("es-AR")}.`
    : `Exceeds budget by ${currency} ${differenceAbs.toLocaleString("en-US")}.`;
}
