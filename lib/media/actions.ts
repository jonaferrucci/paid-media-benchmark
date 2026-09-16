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

  const { error } = await supabase.from("public_media_metric_snapshots").insert({
    platform_id: input.platformId,
    metric_definition_id: input.metricDefinitionId,
    value: input.value,
    observed_at: input.observedAt,
    source: input.source,
    source_reference: input.sourceReference || null,
    submitted_by: user.id,
  });

  if (error) {
    console.error("[public_media_metric_snapshots] insert failed:", error);
    return { ok: false, error: "save_failed" };
  }
  return { ok: true };
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
