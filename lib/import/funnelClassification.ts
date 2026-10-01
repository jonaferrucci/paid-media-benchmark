// CUCURUCHO — CAMPAIGN IMPORT INTELLIGENCE, PHASE 1.
//
// Pure, DERIVED/PRESENTATIONAL-ONLY funnel classification. Neither
// function here writes to, nor is intended to ever write to,
// performance_datasets.funnel_stage_id — that column's existing
// taxonomy (prospecting/consideration/remarketing/retention/mixed/
// other/unknown, migration 0002) has different, audience-targeting-
// shaped semantics (an approved finding of the Pass C discovery
// report's §12) and is never redefined or overwritten by this module.
// This is computed fresh every time it's needed (never persisted),
// exactly as the approved brief requires: "Do not persist this new
// derived funnel."
//
// Two separate representations, both derived from the ALREADY-
// CLASSIFIED canonical objective (never re-deriving objective itself):
//   - a standard 3-stage funnel (Awareness / Consideration /
//     Conversion), useful for any vertical;
//   - an optional 5-stage ecommerce/lifecycle representation
//     (Conocimiento / Consideración / Compra / Recompra /
//     Fidelización), which deliberately requires MORE evidence than
//     "objective = Sales" before ever reaching Recompra or
//     Fidelización — purchase alone never implies either.

export type FunnelStage3 = "awareness" | "consideration" | "conversion" | "unknown";

export interface FunnelStage3Result {
  stage: FunnelStage3;
  reasonKey: string;
}

// §8 of the approved brief. "Video Views → Awareness by safe default"
// — a short bumper-style view and a long-form explainer view are
// genuinely different funnel positions, but with no further evidence
// this module always picks the safer, more common default rather than
// guessing "Consideration." "Store Visits: Conversion ONLY when actual
// structured evidence supports the store-visit objective" — since
// nothing in Phase 1's classifier (lib/import/objectiveClassification.ts)
// ever actually DETECTS store_visits from structured evidence today
// (there is no verified signal for it — see the Pass C discovery
// report), the caller must explicitly say so via
// `hasStructuredObjectiveEvidence`; a store_visits objective that only
// came from a manual/report-level pick is NOT "structured evidence"
// for this purpose and stays unknown. "App: UNKNOWN for now. Other:
// UNKNOWN." — both explicit, never inferred.
export function derive3StageFunnel(
  objectiveKey: string | null,
  options?: { hasStructuredObjectiveEvidence?: boolean }
): FunnelStage3Result {
  switch (objectiveKey) {
    case "awareness":
      return { stage: "awareness", reasonKey: "contribute.import.funnel3Reason.awareness" };
    case "reach":
      return { stage: "awareness", reasonKey: "contribute.import.funnel3Reason.reach" };
    case "video_views":
      return { stage: "awareness", reasonKey: "contribute.import.funnel3Reason.videoViewsDefault" };
    case "engagement":
      return { stage: "consideration", reasonKey: "contribute.import.funnel3Reason.engagement" };
    case "traffic":
      return { stage: "consideration", reasonKey: "contribute.import.funnel3Reason.traffic" };
    case "leads":
      return { stage: "conversion", reasonKey: "contribute.import.funnel3Reason.leads" };
    case "sales":
      return { stage: "conversion", reasonKey: "contribute.import.funnel3Reason.sales" };
    case "store_visits":
      return options?.hasStructuredObjectiveEvidence
        ? { stage: "conversion", reasonKey: "contribute.import.funnel3Reason.storeVisits" }
        : { stage: "unknown", reasonKey: "contribute.import.funnel3Reason.storeVisitsNoEvidence" };
    case "app":
      return { stage: "unknown", reasonKey: "contribute.import.funnel3Reason.appUnknown" };
    case "other":
      return { stage: "unknown", reasonKey: "contribute.import.funnel3Reason.otherUnknown" };
    default:
      return { stage: "unknown", reasonKey: "contribute.import.funnel3Reason.noObjective" };
  }
}

export type EcommerceFunnelStage5 = "conocimiento" | "consideracion" | "compra" | "recompra" | "fidelizacion";

export interface EcommerceFunnelResult {
  // null means "deliberately omitted" — the approved brief explicitly
  // permits this for Leads ("omit 5-stage classification if taxonomy
  // cannot represent it cleanly") and for anything with no ecommerce-
  // lifecycle meaning at all (store_visits/app/other/no objective).
  stage: EcommerceFunnelStage5 | null;
  reasonKey: string;
}

// Lifecycle evidence a caller may have available, corroborating a
// Recompra/Fidelización classification. ALL of these already exist as
// real, pre-existing taxonomy values or plain row data — nothing new
// is invented. Per the approved brief, this evidence is REQUIRED
// before ever returning "recompra" or "fidelizacion": "Purchase alone
// NEVER means Recompra. Purchase volume NEVER means Fidelización."
export interface EcommerceLifecycleEvidence {
  // Real audience_strategies.internal_key already resolved for this
  // row, if any (e.g. "remarketing", "customer_list").
  audienceStrategyKey?: string | null;
  // Real (existing, unrelated to this module) funnel_stages.internal_key
  // already resolved for this row, if any (e.g. "remarketing",
  // "retention") — used ONLY as a corroborating signal here, never
  // written to.
  funnelStageKey?: string | null;
  // The row's own campaign name, scanned for an explicit lifecycle
  // keyword (repeat purchase, retention, loyalty, etc.) — never used
  // to infer Sales itself, only to corroborate Recompra/Fidelización
  // once Sales is already the classified objective.
  campaignName?: string | null;
}

const RECOMPRA_AUDIENCE_KEYS = new Set(["remarketing", "customer_list"]);
const RECOMPRA_FUNNEL_STAGE_KEYS = new Set(["remarketing", "retention"]);
const RECOMPRA_NAME_PATTERN = /recompra|repeat purchase|repurchase|existing customer|past purchaser|cliente existente/i;

const FIDELIZACION_FUNNEL_STAGE_KEYS = new Set(["retention"]);
const FIDELIZACION_NAME_PATTERN = /fidelizaci[oó]n|loyalty|programa de lealtad|retenci[oó]n/i;

function hasFidelizacionEvidence(evidence: EcommerceLifecycleEvidence): boolean {
  if (evidence.funnelStageKey && FIDELIZACION_FUNNEL_STAGE_KEYS.has(evidence.funnelStageKey)) return true;
  if (evidence.campaignName && FIDELIZACION_NAME_PATTERN.test(evidence.campaignName)) return true;
  return false;
}

function hasRecompraEvidence(evidence: EcommerceLifecycleEvidence): boolean {
  if (evidence.audienceStrategyKey && RECOMPRA_AUDIENCE_KEYS.has(evidence.audienceStrategyKey)) return true;
  if (evidence.funnelStageKey && RECOMPRA_FUNNEL_STAGE_KEYS.has(evidence.funnelStageKey)) return true;
  if (evidence.campaignName && RECOMPRA_NAME_PATTERN.test(evidence.campaignName)) return true;
  return false;
}

// §9 of the approved brief.
export function derive5StageEcommerceFunnel(
  objectiveKey: string | null,
  evidence: EcommerceLifecycleEvidence = {}
): EcommerceFunnelResult {
  switch (objectiveKey) {
    case "awareness":
    case "reach":
    case "video_views":
      return { stage: "conocimiento", reasonKey: "contribute.import.funnel5Reason.conocimiento" };
    case "engagement":
    case "traffic":
      return { stage: "consideracion", reasonKey: "contribute.import.funnel5Reason.consideracion" };
    case "leads":
      // Explicit brief instruction: do NOT blindly label Compra, and
      // the current 5-stage taxonomy has no clean "pre-purchase
      // conversion" bucket distinct from Compra — omit rather than
      // force an inaccurate label.
      return { stage: null, reasonKey: "contribute.import.funnel5Reason.leadsOmitted" };
    case "sales": {
      // Fidelización checked first — a dedicated loyalty/retention
      // signal is more specific than a generic remarketing/repeat-
      // purchase one, and the brief requires EXPLICIT loyalty evidence
      // for it, never purchase volume.
      if (hasFidelizacionEvidence(evidence)) {
        return { stage: "fidelizacion", reasonKey: "contribute.import.funnel5Reason.fidelizacion" };
      }
      if (hasRecompraEvidence(evidence)) {
        return { stage: "recompra", reasonKey: "contribute.import.funnel5Reason.recompra" };
      }
      // No explicit evidence beyond the purchase/sale objective itself
      // — the safe, conservative default is Compra, never Recompra or
      // Fidelización ("Purchase alone NEVER means Recompra").
      return { stage: "compra", reasonKey: "contribute.import.funnel5Reason.compraDefault" };
    }
    default:
      // store_visits / app / other / no objective at all: no clean
      // ecommerce-lifecycle meaning — omit rather than invent one.
      return { stage: null, reasonKey: "contribute.import.funnel5Reason.notApplicable" };
  }
}
