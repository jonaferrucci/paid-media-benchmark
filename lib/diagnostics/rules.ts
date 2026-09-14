import type { DiagnosticRule } from "./types";

// -----------------------------------------------------------------------
// BLOCKED RULES -- not implemented, documented only (Phase 8 item 5).
// Do not create dead executable code for these; they exist here purely
// as a record of what was considered and why it's unreachable.
//
// R3-proposal "Engagement fine, conversion lagging" (CTR + CVR):
//   BLOCKED -- CVR methodology not yet defined (Phase 3 decision: no
//   single approved "Relevant Traffic" denominator exists).
// R5-proposal "Conversion cost fine, return lagging" (CVR + ROAS):
//   BLOCKED -- same reason.
// -----------------------------------------------------------------------

// Severity ranking for PerformanceLabel -- higher number = less
// favorable / more severe deviation. Used only for Priority 1 ranking
// in evaluate.ts; never used to invent a numeric "score" shown to the
// user.
export const SEVERITY_RANK: Record<string, number> = {
  requiere_atencion: 4,
  por_debajo_del_benchmark: 3,
  competitivo: 2,
  muy_competitivo: 1,
};

const UNFAVORABLE = new Set(["por_debajo_del_benchmark", "requiere_atencion"]);
const FAVORABLE = new Set(["competitivo", "muy_competitivo"]);

export const RULES: DiagnosticRule[] = [
  {
    id: "r1_click_efficiency_gap",
    requiredMetrics: ["ctr", "cpc"],
    category: "interaccion",
    matches: (ctr, cpc) => UNFAVORABLE.has(ctr) && UNFAVORABLE.has(cpc),
    observationKey: "r1_observation",
    interpretationKey: "r1_interpretation",
    order: 1,
  },
  {
    id: "r2_delivery_cost_pressure",
    requiredMetrics: ["cpm", "ctr"],
    category: "entrega",
    matches: (cpm, ctr) => UNFAVORABLE.has(cpm) && FAVORABLE.has(ctr),
    observationKey: "r2_observation",
    interpretationKey: "r2_interpretation",
    order: 2,
  },
  {
    id: "r3_conversion_cost_gap",
    requiredMetrics: ["cpc", "cpa"],
    category: "conversion",
    matches: (cpc, cpa) => FAVORABLE.has(cpc) && UNFAVORABLE.has(cpa),
    observationKey: "r3_observation",
    interpretationKey: "r3_interpretation",
    order: 3,
  },
  {
    id: "r4_return_gap_competitive_cpa",
    requiredMetrics: ["cpa", "roas"],
    category: "rentabilidad",
    matches: (cpa, roas) => FAVORABLE.has(cpa) && UNFAVORABLE.has(roas),
    observationKey: "r4_observation",
    interpretationKey: "r4_interpretation",
    order: 4,
  },
];

// Priority 3 tie-break -- business proximity to outcome. Only consulted
// after severity (Priority 1) and evidence (Priority 2) are tied; must
// never override a clearly stronger statistical deviation.
export const CATEGORY_PROXIMITY_RANK: Record<string, number> = {
  rentabilidad: 4,
  conversion: 3,
  interaccion: 2,
  entrega: 1,
};
