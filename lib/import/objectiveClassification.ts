// CUCURUCHO — CAMPAIGN IMPORT INTELLIGENCE, PHASE 1.
//
// Pure, deterministic per-ROW objective classifier. No LLM, no
// probabilistic model, no numeric confidence score — exactly the
// "DETECTED / SUGGESTED / UNKNOWN" categorical model the approved
// discovery/implementation briefs require.
//
// This module does NOT touch Supabase, NOT touch the DOM, and NEVER
// mutates a NormalizedRow itself — callers (app/contribute/
// ContributeLanding.tsx) gather the evidence this module needs from
// the raw/mapped row and decide what to do with the result.
//
// EVIDENCE PRECEDENCE (approved, deterministic, never reordered):
//   1. structured platform signal        (none verified for objective
//                                          today — see the Pass C
//                                          discovery report's §4/§5;
//                                          Google's own campaign_type
//                                          is deliberately NEVER used
//                                          here, see the note below)
//   2. structured result/conversion signal (Meta's "Indicador de
//                                          resultado", resolved
//                                          per-row)
//   3. metric/result presence            (Google video-view metric
//                                          presence; Google generic
//                                          Conversions presence, which
//                                          is explicitly ambiguous)
//   4. campaign-name keyword             (reuses lib/import/
//                                          suggestions.ts's rules,
//                                          evaluated per row)
//   5. manual/report-level fallback      (handled OUTSIDE this
//                                          module — see
//                                          ContributeLanding.tsx's
//                                          merge-if-missing logic)
// A concrete answer at a higher tier always short-circuits every
// lower tier — a campaign name can never override a contradictory
// structured signal (brief's own "Ventas"-named-campaign-with-
// landing-page-view-evidence example).
//
// WHY GOOGLE'S "Tipo de campaña" IS NEVER USED HERE: lib/import/
// suggestions.ts's own header comment already states the brief's
// rule this module must also honor — "campaign type does NOT by
// itself define business objective". A Search or Performance Max
// campaign could be optimizing for traffic, leads, or sales; using
// campaign_type as objective evidence would be exactly the kind of
// unsafe inference the brief forbids. Google's ONLY real objective
// evidence today is metric presence (tier 3), per the approved Pass
// C discovery report's §5/§18.
//
// WHY META's generic "conversions"/"conversiones" INDICATOR VALUE IS
// NEVER MAPPED TO AN OBJECTIVE HERE: lib/import/platformExports.ts's
// SAFE_RESULT_INDICATORS deliberately collapses leads/purchases/sales
// into one canonical METRIC field ("conversions") — that collapse is
// about the stored benchmark metric, not objective classification,
// and this module must not undo or duplicate it (per the approved
// brief: "Do NOT change canonical stored benchmark metrics merely to
// accomplish this"). For OBJECTIVE purposes, only the specific
// lead/purchase/sale keyword forms are mapped below; the bare generic
// "conversions"/"conversiones" indicator value carries no more
// objective evidence than Google's own generic Conversions metric
// does, and is treated identically: it falls through to the lower
// tiers rather than being guessed.

import { KEYWORD_RULES, type ObjectiveTaxonomyItem } from "./suggestions";

export type ObjectiveConfidence = "detected" | "suggested" | "unknown";

export type ObjectiveEvidenceTier =
  | "meta_result_indicator"
  | "google_metric_presence"
  | "campaign_name"
  | "none";

export interface ObjectiveClassificationEvidence {
  // Tier 2: Meta's structured result/conversion signal. Pass the
  // ALREADY-NORMALIZED indicator string exactly as
  // resolveMetaResultForRow (lib/import/platformExports.ts) returns it
  // in RowResultResolution.indicatorSample — this module never
  // re-normalizes a raw indicator string itself, so there is exactly
  // one place that normalization logic lives. null/undefined when the
  // row has no Resultados/Indicador evidence at all, OR when the
  // caller has determined this file isn't actually a Meta export
  // (never trust a coincidentally-named column on an unrelated
  // platform's file).
  metaIndicatorNormalized?: string | null;
  // Tier 3: Google metric-presence evidence. Deliberately minimal —
  // only the two cases the approved brief authorizes. Both should be
  // computed by the caller ONLY when the row is confidently resolved
  // to the google_ads platform.
  googleHasVideoViewEvidence?: boolean;
  googleConversionsPresent?: boolean;
  // Tier 4: campaign name, reused (never duplicated) from
  // lib/import/suggestions.ts's own keyword rules.
  campaignName?: string | null;
}

export interface ObjectiveClassificationResult {
  // A real objectives.internal_key, or null when genuinely unknown.
  objectiveKey: string | null;
  confidence: ObjectiveConfidence;
  // i18n key (never a hardcoded message) + interpolation vars, same
  // discipline lib/import/validate.ts's RowIssue already follows.
  reasonKey: string;
  reasonVars?: Record<string, string>;
  evidenceTier: ObjectiveEvidenceTier;
}

// Meta "Indicador de resultado" → objective, for CLASSIFICATION only
// (never for the "conversions" canonical metric field — see the
// module header comment). Confirmed against the approved brief's own
// "Meta Result Semantics" section — never invented beyond it.
const META_OBJECTIVE_INDICATORS: Record<string, { objective: string; confidence: ObjectiveConfidence }> = {
  leads: { objective: "leads", confidence: "detected" },
  lead: { objective: "leads", confidence: "detected" },
  "clientes potenciales": { objective: "leads", confidence: "detected" },
  purchases: { objective: "sales", confidence: "detected" },
  purchase: { objective: "sales", confidence: "detected" },
  compras: { objective: "sales", confidence: "detected" },
  sales: { objective: "sales", confidence: "detected" },
  ventas: { objective: "sales", confidence: "detected" },
  "landing page view": { objective: "traffic", confidence: "detected" },
  "landing page views": { objective: "traffic", confidence: "detected" },
  "link click": { objective: "traffic", confidence: "suggested" },
  "link clicks": { objective: "traffic", confidence: "suggested" },
};

// Reach/alcance is real structured evidence but always the weakest
// Meta-tier signal — per the brief, "Reach, SUGGESTED unless stronger
// structured objective evidence exists" (there is no stronger
// structured evidence within a single Resultados/Indicador pair, so
// this is always SUGGESTED, never promoted to DETECTED).
const META_REACH_INDICATORS = new Set(["reach", "alcance"]);

function classifyFromCampaignName(
  campaignName: string | null | undefined,
  available: Set<string>
): { objectiveKey: string; keyword: string } | null {
  if (!campaignName) return null;
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(campaignName) && available.has(rule.internalKey)) {
      return { objectiveKey: rule.internalKey, keyword: rule.keyword };
    }
  }
  return null;
}

export function classifyRowObjective(
  evidence: ObjectiveClassificationEvidence,
  availableObjectives: ObjectiveTaxonomyItem[]
): ObjectiveClassificationResult {
  const available = new Set(availableObjectives.map((o) => o.internal_key));

  // Tier 2: Meta's structured result/conversion signal.
  const indicator = evidence.metaIndicatorNormalized ?? null;
  if (indicator) {
    const mapped = META_OBJECTIVE_INDICATORS[indicator];
    if (mapped && available.has(mapped.objective)) {
      return {
        objectiveKey: mapped.objective,
        confidence: mapped.confidence,
        reasonKey: "contribute.import.objectiveReason.metaIndicator",
        reasonVars: { indicator },
        evidenceTier: "meta_result_indicator",
      };
    }
    if (META_REACH_INDICATORS.has(indicator) && available.has("reach")) {
      return {
        objectiveKey: "reach",
        confidence: "suggested",
        reasonKey: "contribute.import.objectiveReason.metaIndicator",
        reasonVars: { indicator },
        evidenceTier: "meta_result_indicator",
      };
    }
    // An indicator value exists but isn't one of the safe, specific
    // keyword forms above (e.g. the generic "conversions"/"conversiones",
    // or something entirely unrecognized like "total_profile_visits")
    // — deliberately falls through to the lower tiers rather than
    // guessing which objective a generic/unknown indicator implies.
  }

  // Tier 3: Google metric-presence evidence. Video-view presence gives
  // a concrete (if weak) answer and short-circuits exactly like a
  // Meta structured signal would. Conversions presence is explicitly
  // ambiguous (Leads vs Sales) and never picks either — it is held as
  // a fallback reason (not returned yet) so campaign-name evidence
  // still gets a chance to resolve it, per the precedence rule that
  // only a CONCRETE higher-tier answer should block a lower tier.
  if (evidence.googleHasVideoViewEvidence && available.has("video_views")) {
    return {
      objectiveKey: "video_views",
      confidence: "suggested",
      reasonKey: "contribute.import.objectiveReason.googleVideoEvidence",
      evidenceTier: "google_metric_presence",
    };
  }

  let ambiguousFallback: ObjectiveClassificationResult | null = null;
  if (evidence.googleConversionsPresent) {
    ambiguousFallback = {
      objectiveKey: null,
      confidence: "unknown",
      reasonKey: "contribute.import.objectiveReason.googleConversionsAmbiguous",
      evidenceTier: "google_metric_presence",
    };
  }

  // Tier 4: campaign-name keyword, reusing suggestions.ts's rules.
  const nameMatch = classifyFromCampaignName(evidence.campaignName, available);
  if (nameMatch) {
    return {
      objectiveKey: nameMatch.objectiveKey,
      confidence: "suggested",
      reasonKey: "contribute.import.objectiveReason.campaignName",
      reasonVars: { keyword: nameMatch.keyword },
      evidenceTier: "campaign_name",
    };
  }

  // Tier 5 (manual/report fallback) is applied by the caller, never
  // inside this pure module. If Google's conversions-presence signal
  // was ambiguous and nothing else resolved it, that more informative
  // reason is returned instead of a bare "no evidence" — still never
  // a guess, just a better explanation for the UI.
  if (ambiguousFallback) return ambiguousFallback;

  return {
    objectiveKey: null,
    confidence: "unknown",
    reasonKey: "contribute.import.objectiveReason.noEvidence",
    evidenceTier: "none",
  };
}
