// Phase 20 §28/§29/§35: pure types + helpers for saved planning
// scenarios. Mirrors the Phase 14 saved-comparison philosophy exactly
// (app/comparisons/pure.ts + actions.ts): a scenario stores the
// WORKFLOW inputs only — name, budget, which opportunities, manual
// quantities — and NEVER a derived value (price, subtotal, CPM,
// comparability state). Reopening always re-fetches current rate
// cards/public signals and recalculates from scratch (see
// app/planner/actions.ts's getScenarioAction) — the same "re-run the
// current engine, never trust a stored result" principle Phase 14
// already established for saved_comparisons.

export const MAX_SCENARIO_NAME_LENGTH = 120;

export function validateScenarioName(raw: string): { ok: true; name: string } | { ok: false; reason: "empty" | "too_long" } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_SCENARIO_NAME_LENGTH) return { ok: false, reason: "too_long" };
  return { ok: true, name: trimmed };
}

export interface ScenarioOpportunityInput {
  platformId: string;
  propertyId: string | null;
  mediaFormatId: string;
  quantity: number;
}

export interface PlanningScenarioInput {
  name: string;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  opportunities: ScenarioOpportunityInput[];
}

// §28: never store derived values — this type intentionally has no
// field for price, subtotal, CPM, or comparability state. Quantities
// are normalized to non-negative whole numbers here (§17) so a
// malformed client value can never be persisted as a fractional unit.
export function serializeScenario(input: PlanningScenarioInput): PlanningScenarioInput {
  return {
    name: input.name.trim(),
    budgetAmount: input.budgetAmount,
    budgetCurrency: input.budgetCurrency,
    opportunities: input.opportunities.map((o) => ({
      platformId: o.platformId,
      propertyId: o.propertyId,
      mediaFormatId: o.mediaFormatId,
      quantity: Math.max(0, Math.trunc(o.quantity)),
    })),
  };
}

// §29: whether a freshly re-fetched current price differs from what
// was true when the scenario was last saved — used ONLY to decide
// whether to show a "this rate card changed since you saved it" notice.
// Never used to silently mutate the stored scenario or to block reopen.
export function hasStoredPriceChanged(storedPrice: number | null, currentPrice: number | null): boolean {
  return storedPrice !== currentPrice;
}

// §35: defense-in-depth ownership check ON TOP OF RLS — never a
// substitute for it (RLS on media_planning_scenarios is the real,
// unbypassable boundary; this is the same "never trust a client check
// alone" three-layer pattern already established for curator
// governance in lib/media/governanceRules.ts's authorizeGovernanceAction,
// applied here to scenario ownership). A pure, directly-testable
// decision function the server action re-verifies against a freshly
// read owner_user_id before ever returning or mutating a scenario.
export function validateScenarioOwnership(scenarioOwnerUserId: string, requestingUserId: string | null): boolean {
  if (!requestingUserId) return false;
  return scenarioOwnerUserId === requestingUserId;
}
