// POST-MVP IMPORT FIX 3 (§B): objective auto-SUGGESTION — never silent
// guessing. Where a campaign's own name gives a strong, unambiguous
// clue (a real advertiser naming convention, not a platform's own
// campaign-type label — see the "campaign type does NOT by itself
// define business objective" rule in the task brief), Cucurucho may
// SUGGEST an objective for the file-level context picker. The caller
// is responsible for labeling this "Sugerido" and requiring an
// explicit user action to apply it — this module only ever proposes,
// it never writes anything or resolves a row by itself.
//
// Deliberately generic and small: only the handful of keyword/objective
// pairs the brief itself calls out as safe (Awareness/Alcance/Reach,
// Tráfico/Traffic) — never invented beyond that, and every suggestion
// is checked against the REAL taxonomy passed in before being returned,
// so a suggestion can never reference an objective that doesn't
// actually exist (e.g. if a future seed ever renamed/removed one).

export interface ObjectiveSuggestion {
  internalKey: string;
  // Which campaign name(s) triggered the suggestion — shown by the UI
  // so the suggestion is explainable, never a black box.
  matchedCampaignName: string;
  matchedKeyword: string;
}

interface ObjectiveTaxonomyItem {
  internal_key: string;
  display_label: string;
}

// Order matters only in that the FIRST matching rule for a given
// campaign name wins — Awareness and Reach are deliberately separate
// objectives (Architecture Freeze V1), so a name can't match both.
const KEYWORD_RULES: { pattern: RegExp; internalKey: string; keyword: string }[] = [
  { pattern: /awareness/i, internalKey: "awareness", keyword: "Awareness" },
  { pattern: /alcance|reach/i, internalKey: "reach", keyword: "Alcance/Reach" },
  { pattern: /tr[aá]fico|traffic/i, internalKey: "traffic", keyword: "Tráfico/Traffic" },
];

// Scans a set of campaign names (typically the mapped campaign_name
// column of a file about to get its file-level context) for the FIRST
// name that matches a known-safe keyword rule. Returns null — never a
// guess — when nothing matches, or when the matched rule's objective
// isn't actually present in the real taxonomy passed in.
export function suggestObjectiveFromCampaignNames(
  campaignNames: string[],
  objectives: ObjectiveTaxonomyItem[]
): ObjectiveSuggestion | null {
  const available = new Set(objectives.map((o) => o.internal_key));
  for (const name of campaignNames) {
    if (!name) continue;
    for (const rule of KEYWORD_RULES) {
      if (rule.pattern.test(name) && available.has(rule.internalKey)) {
        return { internalKey: rule.internalKey, matchedCampaignName: name, matchedKeyword: rule.keyword };
      }
    }
  }
  return null;
}
