"use server";

// CUCURUCHO CONTRIBUTION RELIABILITY PASS B — §3/§9/§10: a single
// batched query against the already-persisted
// public_media_metric_snapshots rows — never a per-row query, the same
// shape as lib/import/duplicateActions.ts's campaign check. Unlike
// that check, this one needs no owner scoping at all: these rows are
// public reference data about a media outlet, not a private
// advertiser's campaign — RLS already grants "select using (true)" on
// this table (migration 0012) — so there's nothing to protect by
// filtering to the caller's own rows. The query only ever selects the
// columns needed to classify a collision (platform/property/metric/
// value/observed_at/id) — never submitted_by, so no owner identity
// ever reaches the browser (§10) — and this never uses an admin/
// service-role client, only createServerSupabaseClient, exactly like
// every other read in this flow.

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  classifySnapshotAgainstExisting,
  type ExistingSnapshotSignature,
  type SnapshotDuplicateMatch,
} from "@/lib/media/snapshotDuplicates";

export interface SnapshotDuplicateCheckCandidate {
  rowNumber: number;
  platformKey: string;
  metricKey: string;
  observedAt: string;
  value: number;
}

export interface SnapshotDuplicateCheckResultEntry {
  rowNumber: number;
  match: SnapshotDuplicateMatch;
}

const NO_MATCH: SnapshotDuplicateMatch = { verdict: "none", matchedExistingIds: [] };

export async function checkSnapshotDuplicatesAction(
  candidates: SnapshotDuplicateCheckCandidate[]
): Promise<SnapshotDuplicateCheckResultEntry[]> {
  if (candidates.length === 0) return [];

  const supabase = createServerSupabaseClient();

  const platformKeys = Array.from(new Set(candidates.map((c) => c.platformKey)));
  const metricKeys = Array.from(new Set(candidates.map((c) => c.metricKey)));
  const observedDates = candidates.map((c) => c.observedAt).sort();
  const minDate = observedDates[0];
  const maxDate = observedDates[observedDates.length - 1];

  // Two small, batched lookups (never per-row) to resolve the
  // client-side internal_key strings to real ids — the same
  // resolve-before-query step bulkSubmitSnapshotsAction (lib/media/
  // actions.ts) already does right before insert.
  const [platformsRes, metricsRes] = await Promise.all([
    supabase.from("platforms").select("id, internal_key").in("internal_key", platformKeys),
    supabase.from("public_media_metric_definitions").select("id, internal_key").in("internal_key", metricKeys),
  ]);

  if (platformsRes.error || !platformsRes.data?.length || metricsRes.error || !metricsRes.data?.length) {
    // No resolvable platform/metric match at all — nothing to compare
    // against, so every candidate is honestly "none" rather than a
    // false collision claim built on no evidence.
    return candidates.map((c) => ({ rowNumber: c.rowNumber, match: NO_MATCH }));
  }

  const platformIdByKey = new Map(platformsRes.data.map((p) => [p.internal_key as string, p.id as string]));
  const metricIdByKey = new Map(metricsRes.data.map((m) => [m.internal_key as string, m.id as string]));
  const platformIds = platformsRes.data.map((p) => p.id as string);

  // Single batched read: every existing snapshot for the relevant
  // platform(s) overlapping the incoming file's date span, excluding
  // already-rejected rows (dead history, not a live collision to warn
  // about) — never one query per candidate row.
  const { data: existingRows, error: existingError } = await supabase
    .from("public_media_metric_snapshots")
    .select("id, platform_id, media_property_id, metric_definition_id, value, observed_at")
    .in("platform_id", platformIds)
    .gte("observed_at", minDate)
    .lte("observed_at", maxDate)
    .neq("status", "rejected");

  const existingSignatures: ExistingSnapshotSignature[] =
    existingError || !existingRows
      ? []
      : existingRows.map((row) => ({
          id: row.id as string,
          platformId: row.platform_id as string,
          propertyId: row.media_property_id as string | null,
          metricDefinitionId: row.metric_definition_id as string,
          observedAt: row.observed_at as string,
          value: row.value as number,
        }));

  return candidates.map((c) => {
    const platformId = platformIdByKey.get(c.platformKey);
    const metricDefinitionId = metricIdByKey.get(c.metricKey);
    if (!platformId || !metricDefinitionId) return { rowNumber: c.rowNumber, match: NO_MATCH };
    return {
      rowNumber: c.rowNumber,
      match: classifySnapshotAgainstExisting(
        { platformId, propertyId: null, metricDefinitionId, observedAt: c.observedAt, value: c.value },
        existingSignatures
      ),
    };
  });
}
