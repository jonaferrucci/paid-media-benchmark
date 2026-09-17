"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPlanningOpportunities, getOpportunitiesByIdentities, type PlanningFilters, type PlanningResult } from "@/lib/planning/queries";
import {
  validateScenarioName,
  validateScenarioOwnership,
  serializeScenario,
  type PlanningScenarioInput,
  type ScenarioOpportunityInput,
} from "@/lib/planning/scenario";

// Phase 20: server actions for the media planner. Reads go through the
// session-aware client (createServerSupabaseClient) only — no
// SUPABASE_SERVICE_ROLE_KEY / admin client is ever used here, matching
// every other contribution/comparison action in the app. RLS on
// media_planning_scenarios (migration 0015, not yet applied to hosted
// Supabase) is the real, unbypassable ownership boundary;
// validateScenarioOwnership is defense-in-depth on top of it, never a
// substitute (§35 — "never trust a client-side role check alone",
// applied here to ownership).

export async function fetchPlanningOpportunitiesAction(filters: PlanningFilters): Promise<PlanningResult> {
  return getPlanningOpportunities(filters);
}

export interface SavedPlanningScenario {
  id: string;
  name: string;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  opportunities: ScenarioOpportunityInput[];
  createdAt: string;
  updatedAt: string;
}

interface ScenarioRow {
  id: string;
  owner_user_id: string;
  name: string;
  budget_amount: number | null;
  budget_currency: string | null;
  opportunities: ScenarioOpportunityInput[];
  created_at: string;
  updated_at: string;
}

function rowToScenario(row: ScenarioRow): SavedPlanningScenario {
  return {
    id: row.id,
    name: row.name,
    budgetAmount: row.budget_amount,
    budgetCurrency: row.budget_currency,
    opportunities: row.opportunities ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveScenarioAction(
  input: PlanningScenarioInput
): Promise<{ ok: true; scenario: SavedPlanningScenario } | { ok: false; error: "not_authenticated" | "invalid_name" | "save_failed" }> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const nameCheck = validateScenarioName(input.name);
  if (!nameCheck.ok) return { ok: false, error: "invalid_name" };

  const serialized = serializeScenario({ ...input, name: nameCheck.name });

  const { data, error } = await supabase
    .from("media_planning_scenarios")
    .insert({
      owner_user_id: user.id,
      name: serialized.name,
      budget_amount: serialized.budgetAmount,
      budget_currency: serialized.budgetCurrency,
      opportunities: serialized.opportunities,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[media_planning_scenarios] insert failed:", error);
    return { ok: false, error: "save_failed" };
  }
  return { ok: true, scenario: rowToScenario(data as ScenarioRow) };
}

export async function listScenariosAction(): Promise<SavedPlanningScenario[]> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.from("media_planning_scenarios").select().order("updated_at", { ascending: false });
  if (error) {
    console.error("[media_planning_scenarios] list failed:", error);
    return [];
  }
  return ((data ?? []) as ScenarioRow[]).map(rowToScenario);
}

export interface RecalculatedScenario {
  scenario: SavedPlanningScenario;
  opportunities: PlanningResult["opportunities"];
}

// §28/§29: reopening a scenario NEVER trusts a stored derived value —
// it re-fetches current rate cards/public signals for the stored
// identities and recalculates from scratch, exactly like reopening a
// Phase 14 saved comparison re-runs the live benchmark engine. Per-
// opportunity "this rate card changed since you saved it" staleness
// messaging (§29) was deliberately NOT implemented: doing so honestly
// would require storing a price snapshot at save time, which would
// itself be exactly the "stored derived value treated as truth" §28
// prohibits. Since the stored scenario intentionally carries no price
// at all, there is nothing safe to diff against — §29 explicitly says
// to implement staleness detection "only if the stored workflow
// definition safely allows" it, and here it does not. This is called
// out as a genuine, deliberate product decision, not an oversight.
export async function getScenarioAction(id: string): Promise<RecalculatedScenario | null> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("media_planning_scenarios").select().eq("id", id).maybeSingle();
  if (error || !data) return null;

  const row = data as ScenarioRow;
  // Defense-in-depth: RLS already prevents a non-owner's row from ever
  // being returned by the query above — this re-check never trusts
  // that alone (§35).
  if (!validateScenarioOwnership(row.owner_user_id, user.id)) return null;

  const scenario = rowToScenario(row);
  const combos = scenario.opportunities.map((o) => ({ platformId: o.platformId, propertyId: o.propertyId, mediaFormatId: o.mediaFormatId }));
  const opportunities = await getOpportunitiesByIdentities(combos);

  return { scenario, opportunities };
}

export async function deleteScenarioAction(id: string): Promise<{ ok: true } | { ok: false; error: "not_authenticated" | "delete_failed" }> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const { error } = await supabase.from("media_planning_scenarios").delete().eq("id", id);
  if (error) {
    console.error("[media_planning_scenarios] delete failed:", error);
    return { ok: false, error: "delete_failed" };
  }
  return { ok: true };
}
