"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateComparisonName, MAX_NAME_LENGTH } from "./pure";

// -----------------------------------------------------------------------
// Phase 14: persistence for the user's benchmark comparison WORKFLOW
// only (which cohort/metric/input they were looking at) — never
// benchmark results. All reads/writes go through the session-aware
// client (createServerSupabaseClient), never the admin client, so Row
// Level Security enforces ownership the same way it already does for
// performance_datasets — no manual ownership checks needed here beyond
// what RLS already guarantees, and no SUPABASE_SERVICE_ROLE_KEY is
// ever touched in this file.
// -----------------------------------------------------------------------

export interface CampaignRowInput {
  metric: string;
  value: string;
}

export interface SavedComparisonInput {
  name: string;
  comparisonType: "single_metric" | "campaign";
  platform: string;
  objective: string;
  vertical: string;
  country: string;
  audienceStrategy?: string | null;
  funnelStage?: string | null;
  businessModel?: string | null;
  spendBand?: string | null;
  durationBand?: string | null;
  timeWindow?: string | null;
  metric?: string | null;
  userValue?: number | null;
  campaignRows?: CampaignRowInput[] | null;
}

export interface SavedComparison {
  id: string;
  name: string;
  comparisonType: "single_metric" | "campaign";
  platform: string;
  objective: string;
  vertical: string;
  country: string;
  audienceStrategy: string | null;
  funnelStage: string | null;
  businessModel: string | null;
  spendBand: string | null;
  durationBand: string | null;
  timeWindow: string | null;
  metric: string | null;
  userValue: number | null;
  campaignRows: CampaignRowInput[] | null;
  createdAt: string;
  updatedAt: string;
}

function rowToSavedComparison(row: {
  id: string; name: string; comparison_type: string; platform: string; objective: string; vertical: string; country: string;
  audience_strategy: string | null; funnel_stage: string | null; business_model: string | null; spend_band: string | null;
  duration_band: string | null; time_window: string | null; metric: string | null; user_value: number | null;
  campaign_rows: CampaignRowInput[] | null; created_at: string; updated_at: string;
}): SavedComparison {
  return {
    id: row.id,
    name: row.name,
    comparisonType: row.comparison_type as "single_metric" | "campaign",
    platform: row.platform,
    objective: row.objective,
    vertical: row.vertical,
    country: row.country,
    audienceStrategy: row.audience_strategy,
    funnelStage: row.funnel_stage,
    businessModel: row.business_model,
    spendBand: row.spend_band,
    durationBand: row.duration_band,
    timeWindow: row.time_window,
    metric: row.metric,
    userValue: row.user_value,
    campaignRows: row.campaign_rows,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveComparisonAction(
  input: SavedComparisonInput
): Promise<{ ok: true; comparison: SavedComparison } | { ok: false; error: "not_authenticated" | "invalid_name" | "save_failed" }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const nameCheck = validateComparisonName(input.name);
  if (!nameCheck.ok) return { ok: false, error: "invalid_name" };

  const { data, error } = await supabase
    .from("saved_comparisons")
    .insert({
      owner_user_id: user.id,
      name: nameCheck.name,
      comparison_type: input.comparisonType,
      platform: input.platform,
      objective: input.objective,
      vertical: input.vertical,
      country: input.country,
      audience_strategy: input.audienceStrategy ?? null,
      funnel_stage: input.funnelStage ?? null,
      business_model: input.businessModel ?? null,
      spend_band: input.spendBand ?? null,
      duration_band: input.durationBand ?? null,
      time_window: input.timeWindow ?? null,
      metric: input.metric ?? null,
      user_value: input.userValue ?? null,
      campaign_rows: input.campaignRows ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[saved_comparisons] insert failed:", error);
    return { ok: false, error: "save_failed" };
  }
  return { ok: true, comparison: rowToSavedComparison(data) };
}

export async function listSavedComparisonsAction(limit?: number): Promise<SavedComparison[]> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from("saved_comparisons")
    .select()
    .order("updated_at", { ascending: false });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    console.error("[saved_comparisons] list failed:", error);
    return [];
  }
  return (data ?? []).map(rowToSavedComparison);
}

export async function getSavedComparisonAction(id: string): Promise<SavedComparison | null> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("saved_comparisons").select().eq("id", id).maybeSingle();
  if (error || !data) return null;
  return rowToSavedComparison(data);
}

export async function renameComparisonAction(
  id: string,
  newName: string
): Promise<{ ok: true } | { ok: false; error: "not_authenticated" | "invalid_name" | "rename_failed" }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const nameCheck = validateComparisonName(newName);
  if (!nameCheck.ok) return { ok: false, error: "invalid_name" };

  const { error } = await supabase
    .from("saved_comparisons")
    .update({ name: nameCheck.name })
    .eq("id", id);
  if (error) {
    console.error("[saved_comparisons] rename failed:", error);
    return { ok: false, error: "rename_failed" };
  }
  return { ok: true };
}

export async function duplicateComparisonAction(
  id: string,
  copySuffix: string
): Promise<{ ok: true; comparison: SavedComparison } | { ok: false; error: "not_authenticated" | "not_found" | "duplicate_failed" }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const { data: original, error: fetchError } = await supabase.from("saved_comparisons").select().eq("id", id).maybeSingle();
  if (fetchError || !original) return { ok: false, error: "not_found" };

  const proposedName = `${original.name} ${copySuffix}`.slice(0, MAX_NAME_LENGTH);

  const { data, error } = await supabase
    .from("saved_comparisons")
    .insert({
      owner_user_id: user.id,
      name: proposedName,
      comparison_type: original.comparison_type,
      platform: original.platform,
      objective: original.objective,
      vertical: original.vertical,
      country: original.country,
      audience_strategy: original.audience_strategy,
      funnel_stage: original.funnel_stage,
      business_model: original.business_model,
      spend_band: original.spend_band,
      duration_band: original.duration_band,
      time_window: original.time_window,
      metric: original.metric,
      user_value: original.user_value,
      campaign_rows: original.campaign_rows,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[saved_comparisons] duplicate failed:", error);
    return { ok: false, error: "duplicate_failed" };
  }
  return { ok: true, comparison: rowToSavedComparison(data) };
}

export async function deleteComparisonAction(id: string): Promise<{ ok: true } | { ok: false; error: "not_authenticated" | "delete_failed" }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const { error } = await supabase.from("saved_comparisons").delete().eq("id", id);
  if (error) {
    console.error("[saved_comparisons] delete failed:", error);
    return { ok: false, error: "delete_failed" };
  }
  return { ok: true };
}
