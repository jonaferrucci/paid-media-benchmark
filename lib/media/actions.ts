"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidObservedValue, isValidDateString, isValidRateCardRange, isValidCurrencyCode } from "./validators";

// Phase 17B.3/17B.4: simple authenticated contribution workflows for
// PUBLIC MEDIA DATA and RATE CARDS — structurally and RLS-wise
// completely separate from campaign contribution (Phase 16) and
// benchmark data. Never touches performance_datasets/
// dataset_metric_values. Matches the RLS policies already defined in
// migration 0012 (public read, authenticated+self-attributed insert).

export interface PublicMetricSnapshotInput {
  platformId: string;
  metricDefinitionId: string;
  value: number;
  observedAt: string; // YYYY-MM-DD
  source: string;
  sourceReference?: string;
}

export async function submitPublicMetricSnapshotAction(
  input: PublicMetricSnapshotInput
): Promise<{ ok: true } | { ok: false; error: "not_authenticated" | "invalid_value" | "invalid_date" | "save_failed" }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  if (!isValidObservedValue(input.value)) return { ok: false, error: "invalid_value" };
  if (!isValidDateString(input.observedAt)) return { ok: false, error: "invalid_date" };

  // Phase 19B item 3: explicit status="pending" — public metric
  // snapshots now go through the same curator review gate rate cards
  // already had, rather than relying implicitly on the column default.
  const { error } = await supabase.from("public_media_metric_snapshots").insert({
    platform_id: input.platformId,
    metric_definition_id: input.metricDefinitionId,
    value: input.value,
    observed_at: input.observedAt,
    source: input.source,
    source_reference: input.sourceReference || null,
    submitted_by: user.id,
    status: "pending",
  });

  if (error) {
    console.error("[public_media_metric_snapshots] insert failed:", error);
    return { ok: false, error: "save_failed" };
  }
  return { ok: true };
}

export interface BulkSnapshotImportResult {
  ok: boolean;
  imported: number;
  failed: number;
  error?: "not_authenticated" | "no_valid_rows" | "lookup_failed";
}

// Phase 18B: accepts platform/metric internal_key strings (exactly
// what validateSnapshotRow resolves from an uploaded file) rather than
// raw database ids — the server resolves real ids itself, the same
// pattern already established by Phase 16's bulkSubmitContributionsAction,
// so client code never needs to (and never gets to) supply a raw id
// directly.
export async function bulkSubmitSnapshotsAction(
  rows: { platformKey: string; metricKey: string; value: number; observedAt: string; source: string; sourceReference: string | null }[]
): Promise<BulkSnapshotImportResult> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, imported: 0, failed: 0, error: "not_authenticated" };
  if (rows.length === 0) return { ok: false, imported: 0, failed: 0, error: "no_valid_rows" };

  const [platformsRes, metricsRes] = await Promise.all([
    supabase.from("platforms").select("id, internal_key"),
    supabase.from("public_media_metric_definitions").select("id, internal_key"),
  ]);
  if (platformsRes.error || metricsRes.error) {
    console.error("[public_media_metric_snapshots] lookup failed:", platformsRes.error, metricsRes.error);
    return { ok: false, imported: 0, failed: 0, error: "lookup_failed" };
  }
  const platformIds = new Map((platformsRes.data ?? []).map((p) => [p.internal_key, p.id]));
  const metricIds = new Map((metricsRes.data ?? []).map((m) => [m.internal_key, m.id]));

  const insertRows: { platform_id: string; metric_definition_id: string; value: number; observed_at: string; source: string; source_reference: string | null; submitted_by: string; status: "pending" }[] = [];
  let failed = 0;
  for (const r of rows) {
    const platformId = platformIds.get(r.platformKey);
    const metricDefinitionId = metricIds.get(r.metricKey);
    if (!platformId || !metricDefinitionId) { failed++; continue; }
    insertRows.push({
      platform_id: platformId, metric_definition_id: metricDefinitionId, value: r.value,
      observed_at: r.observedAt, source: r.source, source_reference: r.sourceReference, submitted_by: user.id,
      status: "pending",
    });
  }
  if (insertRows.length === 0) return { ok: false, imported: 0, failed, error: "no_valid_rows" };

  const { error, count } = await supabase.from("public_media_metric_snapshots").insert(insertRows);
  if (error) {
    console.error("[public_media_metric_snapshots] bulk insert failed:", error);
    return { ok: false, imported: 0, failed: rows.length };
  }
  return { ok: true, imported: count ?? insertRows.length, failed };
}

export interface BulkRateCardImportResult {
  ok: boolean;
  imported: number;
  failed: number;
  error?: "not_authenticated" | "no_valid_rows" | "lookup_failed";
}

// Phase 19: bulk rate-card persistence. Resolves platform/format
// internal_key strings to real ids server-side (same pattern as
// bulkSubmitSnapshotsAction). Every imported row is inserted as
// status="pending" — bulk-imported prices never bypass the same
// governance gate as manually-contributed ones (item 5/29).
export async function bulkSubmitRateCardsAction(
  rows: { platformKey: string; mediaFormatKey: string; price: number; currency: string; pricingUnit: "per_integration" | "per_spot" | "per_mention" | "per_day" | "per_week" | "per_month" | "per_thousand" | "package" | "custom"; validFrom: string; validTo: string | null; source: string; sourceReference: string | null; notes: string | null }[]
): Promise<BulkRateCardImportResult> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, imported: 0, failed: 0, error: "not_authenticated" };
  if (rows.length === 0) return { ok: false, imported: 0, failed: 0, error: "no_valid_rows" };

  const [platformsRes, formatsRes] = await Promise.all([
    supabase.from("platforms").select("id, internal_key"),
    supabase.from("media_formats").select("id, internal_key"),
  ]);
  if (platformsRes.error || formatsRes.error) {
    console.error("[media_rate_cards] lookup failed:", platformsRes.error, formatsRes.error);
    return { ok: false, imported: 0, failed: 0, error: "lookup_failed" };
  }
  const platformIds = new Map((platformsRes.data ?? []).map((p) => [p.internal_key, p.id]));
  const formatIds = new Map((formatsRes.data ?? []).map((f) => [f.internal_key, f.id]));

  const insertRows: {
    platform_id: string; media_format_id: string; price: number; currency: string;
    pricing_unit: "per_integration" | "per_spot" | "per_mention" | "per_day" | "per_week" | "per_month" | "per_thousand" | "package" | "custom";
    valid_from: string; valid_to: string | null; source: string; source_reference: string | null;
    notes: string | null; status: "pending"; submitted_by: string;
  }[] = [];
  let failed = 0;
  for (const r of rows) {
    const platformId = platformIds.get(r.platformKey);
    const mediaFormatId = formatIds.get(r.mediaFormatKey);
    if (!platformId || !mediaFormatId) { failed++; continue; }
    insertRows.push({
      platform_id: platformId, media_format_id: mediaFormatId, price: r.price, currency: r.currency,
      pricing_unit: r.pricingUnit, valid_from: r.validFrom, valid_to: r.validTo, source: r.source,
      source_reference: r.sourceReference, notes: r.notes, status: "pending", submitted_by: user.id,
    });
  }
  if (insertRows.length === 0) return { ok: false, imported: 0, failed, error: "no_valid_rows" };

  const { error, count } = await supabase.from("media_rate_cards").insert(insertRows);
  if (error) {
    console.error("[media_rate_cards] bulk insert failed:", error);
    return { ok: false, imported: 0, failed: rows.length };
  }
  return { ok: true, imported: count ?? insertRows.length, failed };
}

export interface RateCardInput {
  platformId: string;
  mediaFormatId: string;
  price: number;
  currency: string;
  pricingUnit: "per_integration" | "per_spot" | "per_mention" | "per_day" | "per_week" | "per_month" | "per_thousand" | "package" | "custom";
  validFrom: string; // YYYY-MM-DD
  validTo?: string;
  source: string;
  notes?: string;
}

export async function submitRateCardAction(
  input: RateCardInput
): Promise<{ ok: true } | { ok: false; error: "not_authenticated" | "invalid_price" | "invalid_currency" | "invalid_date" | "save_failed" }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  if (!isValidObservedValue(input.price)) return { ok: false, error: "invalid_price" };
  if (!isValidCurrencyCode(input.currency)) return { ok: false, error: "invalid_currency" };
  if (!isValidDateString(input.validFrom)) return { ok: false, error: "invalid_date" };
  if (!isValidRateCardRange(input.validFrom, input.validTo)) return { ok: false, error: "invalid_date" };

  // New submissions default to "pending" — canonical/"active" status
  // remains curator-controlled (item 11/17B.4's "list price" trust
  // requirement), never automatically trusted from arbitrary
  // contributor input, consistent with the platforms.status pattern
  // established in migration 0012.
  const { error } = await supabase.from("media_rate_cards").insert({
    platform_id: input.platformId,
    media_format_id: input.mediaFormatId,
    price: input.price,
    currency: input.currency.toUpperCase(),
    pricing_unit: input.pricingUnit,
    valid_from: input.validFrom,
    valid_to: input.validTo || null,
    source: input.source,
    notes: input.notes || null,
    status: "pending",
    submitted_by: user.id,
  });

  if (error) {
    console.error("[media_rate_cards] insert failed:", error);
    return { ok: false, error: "save_failed" };
  }
  return { ok: true };
}
