// PHASE 25 — §9: cross-import duplicate detection.
//
// A SEPARATE, new concern from lib/import/validate.ts's existing
// detectDuplicates: that function only catches two rows repeated
// WITHIN the same file being uploaded right now (a pure, in-memory,
// single-batch check, unchanged by this phase). This module answers a
// different question — "did I already import this campaign in a
// PREVIOUS upload?" — which needs the owner's already-persisted
// performance_datasets rows as the comparison set. The two checks
// compose: a row can be flagged by either, or both, independently.
//
// Conservative and deterministic per §9: never relies on filename
// alone (filename isn't even a signal here — a source file's name
// says nothing about what's inside a DIFFERENT file), combines
// several identity inputs (platform, campaign name, date range, ad
// spend, and a normalized raw-metric signature), and only ever
// returns a verdict for the caller to show the user — it never
// merges, deletes, or overwrites anything itself.

export type DuplicateVerdict = "new" | "possible_duplicate" | "likely_duplicate";

// What an incoming (about-to-be-imported) row looks like once resolved
// enough to compare — a small, deliberately narrow projection of
// NormalizedRow, not the whole row shape (this module never imports
// from lib/import/types.ts, keeping it a standalone, pure, testable
// unit exactly like lib/contribute/dataQuality.ts's own composite-key
// approach).
export interface DuplicateCandidate {
  platformKey: string;
  campaignName: string | null;
  startDate: string;
  endDate: string;
  adSpend: number;
  // A small, order-independent fingerprint of the raw metrics this row
  // carries (impressions/clicks/conversions/etc.) — see
  // buildRawSignature below. Two rows with an identical signature
  // reported identical numbers, which real re-exports of the exact
  // same campaign/period do; a coincidence across genuinely different
  // campaigns is possible but rare enough that, combined with matching
  // platform + dates, it's treated as supporting evidence only, never
  // decisive on its own.
  rawSignature: string;
}

// The comparison set: the owner's own existing campaigns, projected to
// the same shape. Built by the caller (a server action) from a single
// batched query — this module has no database access itself.
export interface ExistingCampaignSignature extends DuplicateCandidate {
  id: string;
}

export interface DuplicateMatch {
  verdict: DuplicateVerdict;
  // The specific existing campaign(s) that produced this verdict, so
  // the UI can show "Campaign X, imported on ..." rather than a bare
  // "this might be a duplicate."
  matchedExistingIds: string[];
}

const NEW_MATCH: DuplicateMatch = { verdict: "new", matchedExistingIds: [] };

// Builds the normalized raw-metric signature used above. Rounds to
// avoid floating-point noise between re-exports of the same report,
// and sorts keys so the caller doesn't need to worry about object key
// order. Never includes ad_spend itself (that's already compared
// separately) — this is specifically the OTHER numbers.
export function buildRawSignature(raw: Partial<Record<string, number>>): string {
  const keys = Object.keys(raw)
    .filter((k) => k !== "ad_spend" && raw[k] !== undefined && raw[k] !== null)
    .sort();
  return keys.map((k) => `${k}:${Math.round((raw[k] as number) * 100) / 100}`).join("|");
}

function sameDateRange(a: DuplicateCandidate, b: DuplicateCandidate): boolean {
  return a.startDate === b.startDate && a.endDate === b.endDate;
}

function sameSpend(a: DuplicateCandidate, b: DuplicateCandidate): boolean {
  // A small epsilon — currency-rounding noise between two exports of
  // the same underlying report, never a meaningfully different spend.
  return Math.abs(a.adSpend - b.adSpend) < 0.01;
}

function sameCampaignName(a: DuplicateCandidate, b: DuplicateCandidate): boolean {
  if (!a.campaignName || !b.campaignName) return false;
  return a.campaignName.trim().toLowerCase() === b.campaignName.trim().toLowerCase();
}

/**
 * Classifies one incoming candidate row against the owner's existing
 * campaigns for the SAME platform. The caller is expected to have
 * already filtered `existing` to the candidate's platform (and a
 * reasonable date window) via its own query — this function does the
 * fine-grained per-row comparison only.
 */
export function classifyDuplicate(candidate: DuplicateCandidate, existing: ExistingCampaignSignature[]): DuplicateMatch {
  const sameplatform = existing.filter((e) => e.platformKey === candidate.platformKey);

  const likely: string[] = [];
  const possible: string[] = [];

  for (const e of sameplatform) {
    if (!sameDateRange(candidate, e)) continue;

    const nameMatch = sameCampaignName(candidate, e);
    const spendMatch = sameSpend(candidate, e);
    const signatureMatch = candidate.rawSignature !== "" && candidate.rawSignature === e.rawSignature;

    if ((nameMatch && spendMatch) || (signatureMatch && spendMatch)) {
      // Same platform, same period, same spend, and either the same
      // campaign name or an identical metric fingerprint — the
      // strongest evidence this is a re-upload of the same report.
      likely.push(e.id);
    } else if (spendMatch || nameMatch || signatureMatch) {
      // Same platform and period plus at least one other matching
      // signal, but not enough to call it certain — e.g. same name but
      // a corrected spend figure, or same spend but a different name.
      possible.push(e.id);
    }
  }

  if (likely.length > 0) return { verdict: "likely_duplicate", matchedExistingIds: likely };
  if (possible.length > 0) return { verdict: "possible_duplicate", matchedExistingIds: possible };
  return NEW_MATCH;
}
