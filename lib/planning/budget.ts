// Phase 20 §16-§21: deterministic budget-fit math. No FX — every
// calculation requires the opportunity's currency to match the
// budget's currency exactly (§10 applied to budget scenarios too).
// Whole units only by default (§17) — commercial units are never
// assumed to be fractionally purchasable. `package`/`custom` pricing
// units never get automatic quantity math (§18) — the planner must
// contact the outlet, Cucurucho never invents a unit count.

const WHOLE_UNIT_PRICING_UNITS = new Set([
  "per_integration",
  "per_spot",
  "per_mention",
  "per_day",
  "per_week",
  "per_month",
  "per_thousand",
]);
const NON_COMPUTABLE_PRICING_UNITS = new Set(["package", "custom"]);

export function isWholeUnitPricingUnit(pricingUnit: string): boolean {
  return WHOLE_UNIT_PRICING_UNITS.has(pricingUnit);
}

// §18: package/custom pricing requires manual commercial review — no
// automatic unit-count math is ever attempted for these.
export function requiresCommercialReview(pricingUnit: string): boolean {
  return NON_COMPUTABLE_PRICING_UNITS.has(pricingUnit);
}

export interface BudgetFitOffer {
  price: number;
  currency: string;
  pricingUnit: string;
}

export type BudgetFitResult =
  | { state: "requires_review" }
  | { state: "currency_mismatch" }
  | { state: "fit"; maxUnits: number; remaining: number };

// §16/§17: the whole-unit maximum quantity a budget affords for ONE
// opportunity, expressed in the budget's own currency. Never rounds up,
// never assumes a fractional unit is purchasable.
export function computeWholeUnitFit(offer: BudgetFitOffer, budgetAmount: number, budgetCurrency: string): BudgetFitResult {
  if (requiresCommercialReview(offer.pricingUnit)) return { state: "requires_review" };
  if (offer.currency !== budgetCurrency) return { state: "currency_mismatch" };
  if (!Number.isFinite(offer.price) || offer.price <= 0 || !Number.isFinite(budgetAmount) || budgetAmount <= 0) {
    return { state: "fit", maxUnits: 0, remaining: Math.max(0, budgetAmount) };
  }
  const maxUnits = Math.floor(budgetAmount / offer.price);
  const remaining = Math.round((budgetAmount - maxUnits * offer.price) * 100) / 100;
  return { state: "fit", maxUnits, remaining };
}

export interface PlannedLineItem {
  offer: BudgetFitOffer;
  quantity: number; // planner-controlled, whole units only (§19) — never auto-optimized
  // false when the opportunity has no current canonical rate card at
  // all (§21) — set by the caller from hasCurrentCommercialOffer, this
  // module never re-derives that.
  hasCurrentOffer: boolean;
}

export interface MultiOpportunityTotals {
  // Per line item, same order/length as the input array. An excluded
  // item's subtotal is exactly 0 — never a fabricated placeholder.
  subtotals: number[];
  totalPlanned: number;
  overBudget: boolean;
  difference: number; // budgetAmount - totalPlanned; negative when over budget
  // Count of items skipped from the math entirely: missing rate card
  // (§21), non-computable pricing unit (§18), or currency mismatch
  // (§10) — never silently folded into the total as if compatible.
  excludedCount: number;
}

// §19/§20/§21: manual per-opportunity quantities, multi-opportunity
// subtotal/total, and over-budget detection. The planner controls every
// quantity; this function never allocates or optimizes on its own.
export function computeMultiOpportunityTotals(
  items: PlannedLineItem[],
  budgetAmount: number,
  budgetCurrency: string
): MultiOpportunityTotals {
  const subtotals: number[] = [];
  let totalPlanned = 0;
  let excludedCount = 0;

  for (const item of items) {
    const excluded =
      !item.hasCurrentOffer ||
      requiresCommercialReview(item.offer.pricingUnit) ||
      item.offer.currency !== budgetCurrency ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 0;

    if (excluded) {
      subtotals.push(0);
      if (!item.hasCurrentOffer || requiresCommercialReview(item.offer.pricingUnit) || item.offer.currency !== budgetCurrency) {
        excludedCount += 1;
      }
      continue;
    }

    const subtotal = Math.round(item.offer.price * item.quantity * 100) / 100;
    subtotals.push(subtotal);
    totalPlanned += subtotal;
  }

  totalPlanned = Math.round(totalPlanned * 100) / 100;
  const difference = Math.round((budgetAmount - totalPlanned) * 100) / 100;
  return { subtotals, totalPlanned, overBudget: totalPlanned > budgetAmount, difference, excludedCount };
}
