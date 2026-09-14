import { isContextualPosition, type ContextualPosition, type PerformanceLabel } from "./classify";

export interface CampaignMetricSummary {
  metric: string;
  status: "success" | "insufficient_sample" | "no_data" | "methodology_block" | "error";
  classification: PerformanceLabel | ContextualPosition | null;
}

export interface CampaignAggregate {
  directionalTotal: number;
  competitiveOrBetterCount: number;
}

/**
 * "Competitive or better" = classification is `competitivo` or
 * `muy_competitivo` — i.e. at or above the median in the favorable
 * direction. Deliberately excludes contextual metrics (Reach,
 * Frequency) from both the numerator and denominator, per Phase 7
 * item 7 — they never contribute to a directional count. Also
 * excludes any metric that isn't in a `success` state, since there is
 * no classification to count for insufficient/no-data/blocked/error
 * results. This is a pure count, never a score, never a percentage
 * presented as a rating — see 06 (Campaign Summary) for the required
 * framing ("X de Y métricas...", not "your campaign scored X%").
 */
export function computeCampaignAggregate(results: CampaignMetricSummary[]): CampaignAggregate {
  let directionalTotal = 0;
  let competitiveOrBetterCount = 0;

  for (const r of results) {
    if (r.status !== "success" || r.classification === null) continue;
    if (isContextualPosition(r.classification)) continue;
    directionalTotal += 1;
    if (r.classification === "competitivo" || r.classification === "muy_competitivo") {
      competitiveOrBetterCount += 1;
    }
  }

  return { directionalTotal, competitiveOrBetterCount };
}
