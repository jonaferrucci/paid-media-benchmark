// Phase 20 tests — real imports of the shipped pure modules under
// lib/planning/*, same convention as scripts/test-rate-cards.mts and
// scripts/test-phase19b.mts (no mocks/reimplementation of the logic
// under test).

import { buildOpportunities, hasCurrentCommercialOffer, type OpportunityTaxonomyCombo } from "../lib/planning/opportunity";
import { groupRateCardsByIdentity, type RateCardLike, type RateCardIdentity } from "../lib/media/rateCardHistory";
import { assessPriceComparability, assessSetComparability } from "../lib/planning/comparability";
import { computeEstimatedMetric, isProhibitedEfficiencyDenominator } from "../lib/planning/efficiency";
import { computeWholeUnitFit, computeMultiOpportunityTotals, isWholeUnitPricingUnit, requiresCommercialReview, type PlannedLineItem } from "../lib/planning/budget";
import {
  explainPriceComparability,
  explainMissingEfficiencyEstimate,
  explainMissingRateCard,
  explainRequiresCommercialReview,
} from "../lib/planning/explain";
import { validateScenarioName, serializeScenario, validateScenarioOwnership, hasStoredPriceChanged } from "../lib/planning/scenario";

let passed = 0;
let failed = 0;
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`); }
}
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const today = new Date("2026-09-17T12:00:00Z");

type RC = RateCardLike & RateCardIdentity & { id: string };

// --- 1. Opportunity identity -------------------------------------------
const identityOlga: RateCardIdentity = { platformId: "p-olga", propertyId: null, mediaFormatId: "f-integration", currency: "ARS", pricingUnit: "per_integration" };
const identityLuzu: RateCardIdentity = { platformId: "p-luzu", propertyId: null, mediaFormatId: "f-integration", currency: "ARS", pricingUnit: "per_integration" };

const combos: OpportunityTaxonomyCombo[] = [
  { platformId: "p-olga", propertyId: null, mediaFormatId: "f-integration" },
  { platformId: "p-luzu", propertyId: null, mediaFormatId: "f-integration" },
  { platformId: "p-blender", propertyId: null, mediaFormatId: "f-integration" }, // no rate card at all
];

const rateCards: RC[] = [
  { id: "olga-active", ...identityOlga, price: 2000000, status: "active", validFrom: "2026-09-01", validTo: null },
  { id: "olga-superseded", ...identityOlga, price: 1600000, status: "superseded", validFrom: "2026-06-01", validTo: "2026-08-31" },
  { id: "luzu-active", ...identityLuzu, price: 3000000, status: "active", validFrom: "2026-08-01", validTo: null },
];

const groups = groupRateCardsByIdentity(rateCards, today);
const opportunities = buildOpportunities(combos, groups);

assertEqual(opportunities.length, 3, "1. opportunity identity — one opportunity per taxonomy combo, including a zero-rate-card outlet");

const olgaOpp = opportunities.find((o) => o.platformId === "p-olga")!;
const luzuOpp = opportunities.find((o) => o.platformId === "p-luzu")!;
const blenderOpp = opportunities.find((o) => o.platformId === "p-blender")!;

// --- 2. Current active rate-card selection ------------------------------
assertEqual(olgaOpp.rateCardGroup?.current?.id, "olga-active", "2. current active rate-card selection resolves the active row");

// --- 3. Expired exclusion -----------------------------------------------
// An ACTIVE-status row whose valid_to has already passed must never be
// treated as current, even though its status alone would otherwise
// qualify — resolveCurrentRateCard (reused inside groupRateCardsByIdentity)
// enforces the date window independently of status.
const expiredIdentity: RateCardIdentity = { platformId: "p-expired", propertyId: null, mediaFormatId: "f-integration", currency: "ARS", pricingUnit: "per_integration" };
const expiredOnlyCards: RC[] = [{ id: "expired-1", ...expiredIdentity, price: 900000, status: "active", validFrom: "2025-01-01", validTo: "2025-06-30" }];
const expiredGroups = groupRateCardsByIdentity(expiredOnlyCards, today);
assertEqual(expiredGroups[0].current, null, "3. expired exclusion — an active row whose valid_to has passed is never treated as current");

// --- 4. Future exclusion -------------------------------------------------
const futureIdentity: RateCardIdentity = { platformId: "p-future", propertyId: null, mediaFormatId: "f-integration", currency: "ARS", pricingUnit: "per_integration" };
const futureCards: RC[] = [{ id: "future-1", ...futureIdentity, price: 500, status: "active", validFrom: "2099-01-01", validTo: null }];
const futureGroups = groupRateCardsByIdentity(futureCards, today);
assertEqual(futureGroups[0].current, null, "4. future exclusion — a future-dated row is never treated as current");

// --- 5. Pending exclusion -------------------------------------------------
const pendingIdentity: RateCardIdentity = { platformId: "p-pending", propertyId: null, mediaFormatId: "f-integration", currency: "ARS", pricingUnit: "per_integration" };
const pendingCards = [{ id: "pending-1", ...pendingIdentity, price: 999, status: "pending" as const, validFrom: "2026-01-01", validTo: null }];
const pendingGroups = groupRateCardsByIdentity(pendingCards, today);
assertEqual(pendingGroups[0].current, null, "5. pending exclusion — a pending row is never treated as current");
assertTrue(!hasCurrentCommercialOffer(buildOpportunities([{ platformId: "p-pending", propertyId: null, mediaFormatId: "f-integration" }], pendingGroups)[0]), "5. an outlet with only a pending submission has no usable commercial offer");

assertTrue(hasCurrentCommercialOffer(olgaOpp), "hasCurrentCommercialOffer is true for an outlet with a real current rate card");
assertTrue(!hasCurrentCommercialOffer(blenderOpp), "21. an outlet with zero rate cards is still a visible opportunity, but excluded from budget math");

// --- 6/7. Same-currency comparability -------------------------------------
const olgaOffer = olgaOpp.rateCardGroup!.current!;
const luzuOffer = luzuOpp.rateCardGroup!.current!;
assertEqual(assessPriceComparability(olgaOffer, luzuOffer).state, "comparable", "6. same currency + same pricing unit -> comparable");

// --- 8. Different-currency incompatibility --------------------------------
assertEqual(assessPriceComparability({ currency: "ARS", pricingUnit: "per_integration" }, { currency: "USD", pricingUnit: "per_integration" }).state, "not_comparable", "8. different currency -> not_comparable, never partially");

// --- 9/10. Same pricing-unit comparability / different pricing-unit incompatibility ---
assertEqual(assessPriceComparability({ currency: "ARS", pricingUnit: "per_integration" }, { currency: "ARS", pricingUnit: "per_integration" }).state, "comparable", "9. same pricing unit -> comparable");
assertEqual(assessPriceComparability({ currency: "ARS", pricingUnit: "per_integration" }, { currency: "ARS", pricingUnit: "per_month" }).state, "partially_comparable", "10. different pricing unit, same currency -> partially_comparable (never treated as equivalent)");

// --- 11. insufficient-data state -------------------------------------------
assertEqual(assessPriceComparability(null, luzuOffer).state, "insufficient_data", "11. a missing current offer on either side -> insufficient_data");
assertEqual(assessSetComparability([olgaOffer, null, luzuOffer]).length, 3, "assessSetComparability produces one result per distinct pair for a 3-item set");

// --- 12. public signal contextual behavior (no dedicated pure module — ----
// verified structurally: a public signal value is never itself treated
// as a DeliveryEstimate/EstimatedMetricResult; see items 12/13 below for
// the actual enforcement).
assertTrue(isProhibitedEfficiencyDenominator("recent_average_views"), "12. recent/median public view counts are never an authorized efficiency denominator either — only an explicit modeled delivery figure is");

// --- 13. prohibited subscriber-denominator behavior -------------------------
assertTrue(isProhibitedEfficiencyDenominator("subscribers"), "13a. subscriber count is a prohibited efficiency denominator");

// --- 14. prohibited lifetime-view denominator behavior ----------------------
assertTrue(isProhibitedEfficiencyDenominator("lifetime_views"), "14. lifetime channel views is a prohibited efficiency denominator");
assertTrue(!isProhibitedEfficiencyDenominator("explicit_delivery"), "an explicit, modeled delivery figure is the only authorized denominator source");

// --- 15. valid estimated CPM -------------------------------------------------
const cpmResult = computeEstimatedMetric(2000000, "ARS", { kind: "impressions", quantity: 500000 });
assertEqual(cpmResult, { state: "estimated", metric: "cpm", value: 4000, currency: "ARS" }, "15. valid estimated CPM = price / impressions * 1000");

// --- 16. valid estimated CPV -------------------------------------------------
const cpvResult = computeEstimatedMetric(100000, "ARS", { kind: "views", quantity: 20000 });
assertEqual(cpvResult, { state: "estimated", metric: "cpv", value: 5, currency: "ARS" }, "16. valid estimated CPV = price / views");

// --- 17. zero denominator -----------------------------------------------------
assertEqual(computeEstimatedMetric(1000, "ARS", { kind: "views", quantity: 0 }).state, "zero_denominator", "17. a zero delivery quantity never divides — explicit zero_denominator state instead");
assertEqual(computeEstimatedMetric(1000, "ARS", null).state, "no_estimate", "13b. no delivery estimate at all -> honest no_estimate state, never a fabricated fallback");

// --- 18. budget fit ------------------------------------------------------------
const fitResult = computeWholeUnitFit({ price: 2000000, currency: "ARS", pricingUnit: "per_integration" }, 10000000, "ARS");
assertEqual(fitResult, { state: "fit", maxUnits: 5, remaining: 0 }, "18. budget fit — ARS 10M / ARS 2M per integration = 5 units, 0 remaining");

// --- 19. whole-unit calculation --------------------------------------------
const fitResult2 = computeWholeUnitFit({ price: 3000000, currency: "ARS", pricingUnit: "per_integration" }, 10000000, "ARS");
assertEqual(fitResult2, { state: "fit", maxUnits: 3, remaining: 1000000 }, "19. whole-unit calculation — floors to 3 units, never a fractional 3.33");

// --- 20. remaining budget -------------------------------------------------
assertEqual((fitResult2 as { remaining: number }).remaining, 1000000, "20. remaining budget after whole-unit purchase is exact, not approximated");

// --- 21. over-budget calculation --------------------------------------------
const overBudgetItems: PlannedLineItem[] = [
  { offer: { price: 6000000, currency: "ARS", pricingUnit: "per_integration" }, quantity: 2, hasCurrentOffer: true },
];
const overBudgetTotals = computeMultiOpportunityTotals(overBudgetItems, 10000000, "ARS");
assertTrue(overBudgetTotals.overBudget, "21. over-budget calculation correctly flags totalPlanned > budget");
assertEqual(overBudgetTotals.difference, -2000000, "21. over-budget difference is the exact negative gap, not just a boolean");

// --- 22. package/custom no-auto-math -----------------------------------------
assertTrue(requiresCommercialReview("package"), "22a. package pricing unit requires commercial review");
assertTrue(requiresCommercialReview("custom"), "22b. custom pricing unit requires commercial review");
assertTrue(isWholeUnitPricingUnit("per_month"), "per_month is a normal whole-unit pricing unit");
assertEqual(computeWholeUnitFit({ price: 1000, currency: "ARS", pricingUnit: "package" }, 5000, "ARS").state, "requires_review", "22c. package pricing unit never gets an automatic unit count");

// --- 23. manual quantity subtotal --------------------------------------------
const manualItems: PlannedLineItem[] = [
  { offer: { price: 2000000, currency: "ARS", pricingUnit: "per_integration" }, quantity: 2, hasCurrentOffer: true },
  { offer: { price: 3000000, currency: "ARS", pricingUnit: "per_integration" }, quantity: 1, hasCurrentOffer: true },
];
const manualTotals = computeMultiOpportunityTotals(manualItems, 10000000, "ARS");
assertEqual(manualTotals.subtotals, [4000000, 3000000], "23. manual quantity subtotal is price * planner-entered quantity per item");

// --- 24. multi-opportunity total -----------------------------------------------
assertEqual(manualTotals.totalPlanned, 7000000, "24. multi-opportunity total is the sum of eligible subtotals");
assertEqual(manualTotals.difference, 3000000, "multi-opportunity remaining budget is exact");

// --- 25. missing rate-card exclusion from budget math --------------------------
const missingOfferItems: PlannedLineItem[] = [
  { offer: { price: 0, currency: "", pricingUnit: "" }, quantity: 3, hasCurrentOffer: false },
];
const missingOfferTotals = computeMultiOpportunityTotals(missingOfferItems, 10000000, "ARS");
assertEqual(missingOfferTotals.totalPlanned, 0, "25. an opportunity with no current rate card contributes exactly 0, never a guessed price");
assertEqual(missingOfferTotals.excludedCount, 1, "25. missing rate-card items are counted as excluded, never silently folded into the total");

// --- 26. explanation state --------------------------------------------------------
assertEqual(
  explainPriceComparability({ state: "not_comparable", reasons: ["currency_mismatch"] }, null, null, "es"),
  "No se comparan directamente porque están expresados en monedas diferentes.",
  "26a. explanation state — currency mismatch sentence (ES)"
);
assertEqual(
  explainPriceComparability({ state: "partially_comparable", reasons: ["pricing_unit_mismatch"] }, null, null, "en"),
  "These prices are not directly comparable because they use different pricing units.",
  "26b. explanation state — pricing-unit mismatch sentence (EN)"
);
assertTrue(explainMissingEfficiencyEstimate("es").length > 0 && explainMissingRateCard("es").length > 0 && explainRequiresCommercialReview("es").length > 0, "26c. every explanation function returns a non-empty factual sentence");

// --- 27. saved scenario serialization -----------------------------------------
const serialized = serializeScenario({
  name: "  Plan Q4  ",
  budgetAmount: 10000000,
  budgetCurrency: "ARS",
  opportunities: [
    { platformId: "p-olga", propertyId: null, mediaFormatId: "f-integration", quantity: 2.7 },
  ],
});
assertEqual(serialized.name, "Plan Q4", "27a. saved scenario serialization trims the name");
assertEqual(serialized.opportunities[0].quantity, 2, "27b. saved scenario serialization truncates a fractional quantity to a whole unit, never rounds up");
assertTrue(!("price" in (serialized.opportunities[0] as unknown as Record<string, unknown>)), "27c. saved scenario serialization never carries a price or any other derived value — only identity + quantity");

// --- 28. saved scenario recalculation behavior --------------------------------
// The stored shape has nowhere to put a price (see 27c) — recalculation
// is therefore structurally forced to re-fetch current data every time
// a scenario reopens (app/planner/actions.ts's getScenarioAction), never
// trusting a stored number. This is verified here at the type/contract
// level: PlanningScenarioInput's own shape enforces it.
assertEqual(Object.keys(serialized).sort(), ["budgetAmount", "budgetCurrency", "name", "opportunities"], "28. the serialized scenario shape carries only workflow inputs, nothing recalculation could instead trust as a cached result");

// --- 29. ownership validation helper --------------------------------------------
assertTrue(validateScenarioOwnership("user-a", "user-a"), "29a. matching owner id is a valid ownership check");
assertTrue(!validateScenarioOwnership("user-a", "user-b"), "29b. mismatched owner id is rejected — this is the 'unauthorized moderation rejection' equivalent for scenarios");
assertTrue(!validateScenarioOwnership("user-a", null), "29c. an unauthenticated requester is never treated as the owner");
assertEqual(hasStoredPriceChanged(100, 100), false, "hasStoredPriceChanged is false when prices match");
assertEqual(hasStoredPriceChanged(100, 150), true, "hasStoredPriceChanged is true when prices differ");

// --- 30. no fake fallback / ES-EN formatting -------------------------------------
assertEqual(validateScenarioName("").ok, false, "30a. an empty scenario name is rejected, never silently accepted as ''");
assertEqual(validateScenarioName("   ").ok, false, "30b. a whitespace-only scenario name is rejected");
assertTrue(validateScenarioName("A".repeat(121)).ok === false, "30c. a too-long scenario name is rejected rather than silently truncated on save");
assertEqual(explainMissingRateCard("es"), "Sin tarifario vigente.", "30d. ES formatting for the missing-rate-card explanation");
assertEqual(explainMissingRateCard("en"), "No current rate card.", "30e. EN formatting for the same explanation — no data is fabricated in either language");

console.log(`\n${failed === 0 ? "ALL" : failed} PHASE 20 TESTS ${failed === 0 ? "PASSED" : "FAILED"} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exit(1);
