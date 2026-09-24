// CUCURUCHO DATA INTEGRITY 1 — OBSERVATION FINGERPRINT.
//
// A deterministic, owner-scoped identity key for one real-world
// performance observation, computed here in TypeScript (never in SQL —
// see migration 0020's own comment on why) and persisted on
// performance_datasets.observation_fingerprint.
//
// Approved design:
//   - Only ever computed when campaign_name is present and non-empty.
//     100% of manual contributions (app/contribute/actions.ts never
//     collects a campaign name) and any bulk-import row with no
//     campaign-name column resolve to fingerprint = null — never a
//     weak placeholder token ("unnamed"/"manual"/etc.), because two
//     nameless observations for the same owner/platform/dates/currency/
//     type could easily be genuinely different campaigns; a fabricated
//     shared identity would be worse than no identity at all.
//   - Inputs, in this exact order: owner_user_id, platform_id,
//     normalized campaign_name, start_date, end_date, original_currency,
//     campaign_type_id.
//   - Deliberately EXCLUDES every raw/derived metric value and ad_spend —
//     those are exactly what legitimately changes between an original
//     export and a corrected re-export of the SAME observation (a
//     finalized-conversions re-export, a billing correction, etc.).
//     Including them would defeat the fingerprint's own purpose.
//   - Deliberately EXCLUDES import_batch_id/source_filename/created_at —
//     those identify the IMPORT, not the OBSERVATION; two imports of
//     the same real campaign in two different files/batches must
//     resolve to the SAME fingerprint precisely because these differ.
//   - V1 is intentionally owner-scoped only (owner_user_id is part of
//     the hash input) — no cross-user/cross-organization deduplication.
//
// A version prefix ("v1") is folded into the canonical string so a
// future change to the fingerprint's own definition can never silently
// collide with today's values — it would simply produce a different
// hash space, never confused with this one.

import { createHash } from "node:crypto";

export interface ObservationFingerprintInput {
  ownerId: string | null | undefined;
  platformId: string;
  campaignName: string | null | undefined;
  startDate: string;
  endDate: string;
  currency: string;
  campaignTypeId: string | null | undefined;
}

const FINGERPRINT_VERSION = "v1";

// trim + lowercase + collapse internal whitespace. Deliberately NOT
// fuzzy/typo-tolerant (no Levenshtein, no stemming) — see the design
// note: a normalization strong enough to also catch typos is strong
// enough to also merge two genuinely different campaign names, which
// would silently conflate independent observations. " Black   Friday "
// and "black friday" must fingerprint identically; "Black Friday" and
// "Black Friday 2" must not.
export function normalizeCampaignNameForFingerprint(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Returns null whenever campaignName is missing/empty — this is the
// ONLY condition under which this function returns null. A null
// ownerId (a deleted profile, ON DELETE SET NULL on
// performance_datasets.owner_user_id) still produces a real fingerprint
// string (with an explicit empty-owner marker), since the fingerprint
// is a pure function of its inputs — the ABSENCE of owner-scoped
// uniqueness protection for such a row is enforced separately, by the
// database's own partial unique index (which excludes rows with a null
// owner_user_id, since Postgres treats NULL as distinct in a unique
// index) — never by this function inventing a shared identity for
// owner-less rows.
export function buildObservationFingerprint(input: ObservationFingerprintInput): string | null {
  const trimmedName = input.campaignName?.trim();
  if (!trimmedName) return null;

  const canonical = [
    FINGERPRINT_VERSION,
    input.ownerId ?? "",
    input.platformId,
    normalizeCampaignNameForFingerprint(trimmedName),
    input.startDate,
    input.endDate,
    input.currency.trim().toUpperCase(),
    input.campaignTypeId ?? "",
  ].join("|");

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
