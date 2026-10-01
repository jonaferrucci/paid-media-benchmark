// CUCURUCHO CONTRIBUTION RELIABILITY PASS B — §4-6/§9/§10: rate-card
// duplicate/conflict classification.
//
// Reuses the EXISTING canonical identity (RateCardIdentity) and
// compatibility check (areRateCardsCompatible) from
// lib/media/rateCardHistory.ts — the exact same definition the media
// profile page already uses to compute current/previous/change/
// history — rather than inventing a second, parallel notion of "same
// rate card" for import purposes. validFrom is the temporal axis on
// top of that identity, per the approved product decision:
//   - same identity + same validFrom + same price -> EXACT_DUPLICATE
//   - same identity + same validFrom + different price ->
//     CONFLICTING_VERSION (today silently passed through with no
//     information at all — this is the within-file gap this pass
//     closes; markRateCardDuplicates's old key included price itself,
//     so two different prices never even matched as "the same row")
//   - same identity + a DIFFERENT validFrom -> a legitimate new
//     history point, exactly what resolvePreviousRateCardAndChange
//     already treats as a normal price change over time. Never
//     classified as anything by this module.
//
// WITHIN-FILE classification (classifyRateCardFileDuplicates) operates
// on the plain internal_key strings the import flow has client-side —
// no real database ids exist before the file reaches the server (see
// app/contribute/rate-cards/page.tsx, which only ever selects
// internal_key/display_label). It still calls areRateCardsCompatible
// directly, feeding it those key strings in place of real ids: the
// function only ever does straight equality comparison, so this is
// exactly as correct as comparing resolved ids would be, as long as
// every row in the SAME file consistently uses the same representation
// — which it always does.
//
// CROSS-DB classification (classifyRateCardAgainstExisting) instead
// compares candidates already resolved to real ids by the caller (the
// "use server" action in app/contribute/rate-cards/duplicateActions.ts
// — never here) against existing rows, which naturally carry real ids
// — the original, intended use of RateCardIdentity.
//
// Never decides a winner, never sets superseded, never touches
// valid_to, never overwrites a price. An EXACT_DUPLICATE is advisory
// and skippable; a CONFLICTING_VERSION is only ever reported — it may
// still be submitted for curator review. Database-level uniqueness
// enforcement is explicitly deferred to Pass C.

import { areRateCardsCompatible, type RateCardIdentity } from "./rateCardHistory";

export type RateCardDuplicateVerdict = "exact_duplicate" | "conflicting_version" | "none";

export interface RateCardFileCandidate extends RateCardIdentity {
  validFrom: string;
  price: number;
}

function sameFileIdentityAndDate(a: RateCardFileCandidate, b: RateCardFileCandidate): boolean {
  return areRateCardsCompatible(a, b) && a.validFrom === b.validFrom;
}

export function classifyRateCardFileDuplicates(rows: RateCardFileCandidate[]): Map<number, RateCardDuplicateVerdict> {
  // areRateCardsCompatible compares two full records rather than a
  // flat string key, so this is pairwise rather than a direct Map
  // lookup — bounded by IMPORT_LIMITS.maxRows (5000) and run once,
  // right after validation, the same complexity class every other
  // full-row-set pass in this import flow already accepts.
  const seen: RateCardFileCandidate[] = [];
  const result = new Map<number, RateCardDuplicateVerdict>();
  rows.forEach((row, index) => {
    const match = seen.find((s) => sameFileIdentityAndDate(s, row));
    if (match) {
      result.set(index, match.price === row.price ? "exact_duplicate" : "conflicting_version");
    } else {
      seen.push(row);
    }
  });
  return result;
}

export interface ExistingRateCardSignature extends RateCardIdentity {
  id: string;
  validFrom: string;
  price: number;
}

export interface RateCardDuplicateMatch {
  verdict: RateCardDuplicateVerdict;
  matchedExistingIds: string[];
}

const NO_RATE_CARD_MATCH: RateCardDuplicateMatch = { verdict: "none", matchedExistingIds: [] };

/**
 * Classifies one incoming (about-to-be-imported) rate card against the
 * already-persisted rate cards the caller supplies (a single batched
 * query — this function does no I/O itself). Never decides a winner,
 * never sets superseded, never touches valid_to or price.
 */
export function classifyRateCardAgainstExisting(
  candidate: RateCardIdentity & { validFrom: string; price: number },
  existing: ExistingRateCardSignature[]
): RateCardDuplicateMatch {
  const matches = existing.filter((e) => areRateCardsCompatible(candidate, e) && e.validFrom === candidate.validFrom);
  if (matches.length === 0) return NO_RATE_CARD_MATCH;

  const exact = matches.filter((m) => m.price === candidate.price);
  if (exact.length > 0) return { verdict: "exact_duplicate", matchedExistingIds: exact.map((m) => m.id) };

  return { verdict: "conflicting_version", matchedExistingIds: matches.map((m) => m.id) };
}
