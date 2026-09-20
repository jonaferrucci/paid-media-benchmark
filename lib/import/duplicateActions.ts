"use server";

// PHASE 25 — §9/§10: cross-import duplicate check. Runs once per
// upload, right after review rows are computed, as a single batched
// query against the owner's OWN performance_datasets — never a
// per-row query (would be an N+1 exactly like the pattern Phase 26's
// workspaceActions.ts already avoided). RLS (owner_user_id = auth.uid())
// is the real boundary here, same as every other owner-scoped read in
// this codebase — this action never uses an admin/service-role client.

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { classifyDuplicate, buildRawSignature, type DuplicateCandidate, type DuplicateMatch, type ExistingCampaignSignature } from "./duplicates";

export interface DuplicateCheckCandidate extends DuplicateCandidate {
  // Echoes NormalizedRow.rowNumber so the caller can map verdicts back
  // to the exact review row without relying on array order surviving
  // a round trip.
  rowNumber: number;
}

export interface DuplicateCheckResultEntry {
  rowNumber: number;
  match: DuplicateMatch;
}

export async function checkImportDuplicatesAction(
  candidates: DuplicateCheckCandidate[]
): Promise<DuplicateCheckResultEntry[]> {
  if (candidates.length === 0) return [];

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return candidates.map((c) => ({ rowNumber: c.rowNumber, match: { verdict: "new", matchedExistingIds: [] } }));

  const platformKeys = Array.from(new Set(candidates.map((c) => c.platformKey)));
  const startDates = candidates.map((c) => c.startDate).sort();
  const endDates = candidates.map((c) => c.endDate).sort();
  const minStart = startDates[0];
  const maxEnd = endDates[endDates.length - 1];

  const { data: platformRows, error: platformError } = await supabase
    .from("platforms")
    .select("id, internal_key")
    .in("internal_key", platformKeys);

  if (platformError || !platformRows || platformRows.length === 0) {
    // No resolvable platform match at all — nothing to compare
    // against, so every candidate is honestly "new" rather than a
    // false duplicate claim built on no evidence.
    return candidates.map((c) => ({ rowNumber: c.rowNumber, match: { verdict: "new", matchedExistingIds: [] } }));
  }

  const platformIdToKey = new Map(platformRows.map((p) => [p.id as string, p.internal_key as string]));
  const platformIds = platformRows.map((p) => p.id as string);

  // Single batched read: the owner's own campaigns for the relevant
  // platform(s), overlapping the incoming file's overall date span —
  // never a full-table scan, and never one query per row. Backed by
  // idx_datasets_owner_platform_dates (migration 0018).
  const { data: existingRows, error: existingError } = await supabase
    .from("performance_datasets")
    .select("id, platform_id, campaign_name, start_date, end_date, dataset_metric_values(raw_numeric_value, metrics(internal_key))")
    .in("platform_id", platformIds)
    .lte("start_date", maxEnd)
    .gte("end_date", minStart)
    .neq("validation_status", "deleted");

  if (existingError || !existingRows) {
    return candidates.map((c) => ({ rowNumber: c.rowNumber, match: { verdict: "new", matchedExistingIds: [] } }));
  }

  const existingSignatures: ExistingCampaignSignature[] = existingRows.map((row) => {
    type MetricValueRow = { raw_numeric_value: number; metrics: { internal_key: string } | { internal_key: string }[] | null };
    const values = (row.dataset_metric_values ?? []) as unknown as MetricValueRow[];
    const raw: Partial<Record<string, number>> = {};
    let adSpend = 0;
    for (const v of values) {
      const metricRef = Array.isArray(v.metrics) ? v.metrics[0] : v.metrics;
      const key = metricRef?.internal_key;
      if (!key) continue;
      if (key === "ad_spend") {
        adSpend = v.raw_numeric_value;
      } else {
        raw[key] = v.raw_numeric_value;
      }
    }
    return {
      id: row.id as string,
      platformKey: platformIdToKey.get(row.platform_id as string) ?? "",
      campaignName: (row.campaign_name as string | null) ?? null,
      startDate: row.start_date as string,
      endDate: row.end_date as string,
      adSpend,
      rawSignature: buildRawSignature(raw),
    };
  });

  return candidates.map((c) => ({
    rowNumber: c.rowNumber,
    match: classifyDuplicate(c, existingSignatures),
  }));
}
