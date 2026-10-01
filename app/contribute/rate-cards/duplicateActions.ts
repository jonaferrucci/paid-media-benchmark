"use server";

// CUCURUCHO CONTRIBUTION RELIABILITY PASS B — §6/§9/§10: a single
// batched query against the already-persisted media_rate_cards rows —
// never a per-row query, the same shape as
// lib/import/duplicateActions.ts's campaign check and this flow's own
// public-metrics sibling (app/contribute/public-metrics/
// duplicateActions.ts). No owner scoping needed: media_rate_cards is
// public reference data (RLS "select using (true)", migration 0012).
// Only the columns needed to classify a collision are ever selected —
// never submitted_by, so no owner identity reaches the browser (§10) —
// and this never uses an admin/service-role client.

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { RateCardIdentity } from "@/lib/media/rateCardHistory";
import {
  classifyRateCardAgainstExisting,
  type ExistingRateCardSignature,
  type RateCardDuplicateMatch,
} from "@/lib/media/rateCardDuplicates";

export interface RateCardDuplicateCheckCandidate {
  rowNumber: number;
  platformKey: string;
  mediaFormatKey: string;
  currency: string;
  pricingUnit: string;
  validFrom: string;
  price: number;
}

export interface RateCardDuplicateCheckResultEntry {
  rowNumber: number;
  match: RateCardDuplicateMatch;
}

const NO_MATCH: RateCardDuplicateMatch = { verdict: "none", matchedExistingIds: [] };

export async function checkRateCardDuplicatesAction(
  candidates: RateCardDuplicateCheckCandidate[]
): Promise<RateCardDuplicateCheckResultEntry[]> {
  if (candidates.length === 0) return [];

  const supabase = createServerSupabaseClient();

  const platformKeys = Array.from(new Set(candidates.map((c) => c.platformKey)));
  const formatKeys = Array.from(new Set(candidates.map((c) => c.mediaFormatKey)));
  const validFroms = candidates.map((c) => c.validFrom).sort();
  const minDate = validFroms[0];
  const maxDate = validFroms[validFroms.length - 1];

  // Two small, batched lookups (never per-row) to resolve the
  // client-side internal_key strings to real ids — the same
  // resolve-before-query step bulkSubmitRateCardsAction (lib/media/
  // actions.ts) already does right before insert.
  const [platformsRes, formatsRes] = await Promise.all([
    supabase.from("platforms").select("id, internal_key").in("internal_key", platformKeys),
    supabase.from("media_formats").select("id, internal_key").in("internal_key", formatKeys),
  ]);

  if (platformsRes.error || !platformsRes.data?.length || formatsRes.error || !formatsRes.data?.length) {
    return candidates.map((c) => ({ rowNumber: c.rowNumber, match: NO_MATCH }));
  }

  const platformIdByKey = new Map(platformsRes.data.map((p) => [p.internal_key as string, p.id as string]));
  const formatIdByKey = new Map(formatsRes.data.map((f) => [f.internal_key as string, f.id as string]));
  const platformIds = platformsRes.data.map((p) => p.id as string);

  // Single batched read: every existing rate card for the relevant
  // platform(s) overlapping the incoming file's valid_from span,
  // excluding already-rejected rows — never one query per candidate
  // row.
  const { data: existingRows, error: existingError } = await supabase
    .from("media_rate_cards")
    .select("id, platform_id, media_property_id, media_format_id, currency, pricing_unit, valid_from, price")
    .in("platform_id", platformIds)
    .gte("valid_from", minDate)
    .lte("valid_from", maxDate)
    .neq("status", "rejected");

  const existingSignatures: ExistingRateCardSignature[] =
    existingError || !existingRows
      ? []
      : existingRows.map((row) => ({
          id: row.id as string,
          platformId: row.platform_id as string,
          propertyId: row.media_property_id as string | null,
          mediaFormatId: row.media_format_id as string,
          currency: row.currency as string,
          pricingUnit: row.pricing_unit as string,
          validFrom: row.valid_from as string,
          price: row.price as number,
        }));

  return candidates.map((c) => {
    const platformId = platformIdByKey.get(c.platformKey);
    const mediaFormatId = formatIdByKey.get(c.mediaFormatKey);
    if (!platformId || !mediaFormatId) return { rowNumber: c.rowNumber, match: NO_MATCH };
    const candidateIdentity: RateCardIdentity & { validFrom: string; price: number } = {
      platformId,
      propertyId: null,
      mediaFormatId,
      currency: c.currency,
      pricingUnit: c.pricingUnit,
      validFrom: c.validFrom,
      price: c.price,
    };
    return { rowNumber: c.rowNumber, match: classifyRateCardAgainstExisting(candidateIdentity, existingSignatures) };
  });
}
