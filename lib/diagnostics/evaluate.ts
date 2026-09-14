import { RULES, SEVERITY_RANK, CATEGORY_PROXIMITY_RANK } from "./rules";
import type { DiagnosticResult, MatchedPattern, MetricComparisonInput } from "./types";

/**
 * Matches every rule whose two required metrics are both `success`
 * with a directional classification, and whose condition function
 * returns true. Never partially evaluates a rule -- if either
 * required metric is missing or not `success`, the rule is skipped
 * entirely (Phase 8 item 8).
 */
export function matchRules(inputs: MetricComparisonInput[]): MatchedPattern[] {
  const byMetric = new Map(inputs.map((i) => [i.metric, i]));
  const matched: MatchedPattern[] = [];

  for (const rule of RULES) {
    const [metricA, metricB] = rule.requiredMetrics;
    const a = byMetric.get(metricA);
    const b = byMetric.get(metricB);

    if (!a || !b) continue;
    if (a.status !== "success" || b.status !== "success") continue;
    if (a.classification === null || b.classification === null) continue;
    if (!rule.matches(a.classification, b.classification)) continue;

    const evidence = [
      { metric: a.metric, sampleSize: a.sampleSize },
      { metric: b.metric, sampleSize: b.sampleSize },
    ];

    // Worst (least favorable) classification among the two required
    // metrics drives Priority 1 severity ranking.
    const aRank = SEVERITY_RANK[a.classification];
    const bRank = SEVERITY_RANK[b.classification];
    const worstClassification = aRank >= bRank ? a.classification : b.classification;
    const worstPercentDiff = aRank >= bRank ? a.percentDiff : b.percentDiff;

    // Priority 2 evidence: minimum sample size across the two required
    // metrics -- the weakest link, never a pooled/summed count.
    const minSampleSize = Math.min(a.sampleSize, b.sampleSize);

    matched.push({ rule, evidence, worstClassification, worstPercentDiff, minSampleSize });
  }

  return matched;
}

/**
 * Orders matched patterns using the approved 4-step priority ladder.
 * Every comparator is deterministic and derived only from data the
 * benchmark engine already returned -- no invented score anywhere.
 */
export function prioritize(matched: MatchedPattern[]): DiagnosticResult {
  if (matched.length === 0) return { primary: null, secondary: [] };

  const sorted = [...matched].sort((x, y) => {
    // Priority 1a: severity of the worst classification (higher = more severe).
    const severityDiff = SEVERITY_RANK[y.worstClassification] - SEVERITY_RANK[x.worstClassification];
    if (severityDiff !== 0) return severityDiff;

    // Priority 1b: magnitude of deviation, when severity tier is tied.
    const xAbs = x.worstPercentDiff !== null ? Math.abs(x.worstPercentDiff) : 0;
    const yAbs = y.worstPercentDiff !== null ? Math.abs(y.worstPercentDiff) : 0;
    if (yAbs !== xAbs) return yAbs - xAbs;

    // Priority 2: evidence strength -- more supporting metrics first
    // (both current rules use exactly 2, so this mainly future-proofs
    // for rules with more required metrics), then larger minimum
    // sample size (the weakest-link sample, never pooled).
    const evidenceCountDiff = y.evidence.length - x.evidence.length;
    if (evidenceCountDiff !== 0) return evidenceCountDiff;
    if (y.minSampleSize !== x.minSampleSize) return y.minSampleSize - x.minSampleSize;

    // Priority 3: business proximity to outcome -- only as a tie-break
    // after severity and evidence are both equal.
    const proximityDiff = CATEGORY_PROXIMITY_RANK[y.rule.category] - CATEGORY_PROXIMITY_RANK[x.rule.category];
    if (proximityDiff !== 0) return proximityDiff;

    // Priority 4: fixed, explicit rule order -- never relies on
    // array/object iteration order.
    return x.rule.order - y.rule.order;
  });

  return { primary: sorted[0], secondary: sorted.slice(1) };
}

export function runDiagnostics(inputs: MetricComparisonInput[]): DiagnosticResult {
  return prioritize(matchRules(inputs));
}
