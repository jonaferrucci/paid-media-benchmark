"use client";

import { runDiagnostics } from "@/lib/diagnostics/evaluate";
import type { MetricComparisonInput } from "@/lib/diagnostics/types";
import { computePercentDiff, isContextualPosition, type ContextualPosition, type PerformanceLabel } from "@/lib/comparison/classify";
import type { BenchmarkResponse } from "./actions";

interface CampaignResultRowLike {
  metric: string;
  status: string;
  classification: string | null;
  response: BenchmarkResponse;
  userValue: number;
}

/**
 * Phase 8: sits underneath the existing Phase 7 campaign summary, never
 * replacing it. Renders nothing at all when no rule matches -- per
 * item 8, there is no empty-state banner here; the Phase 6/7 metric
 * insights above already cover that case on their own.
 */
export function DiagnosticSection({
  rows,
  t,
}: {
  rows: CampaignResultRowLike[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const inputs: MetricComparisonInput[] = rows
    .filter((r) => r.status === "success" && r.classification !== null && !isContextualPosition(r.classification as PerformanceLabel | ContextualPosition))
    .map((r) => {
      const median = r.response.statistics.median;
      return {
        metric: r.metric,
        status: "success" as const,
        classification: r.classification as MetricComparisonInput["classification"],
        percentDiff: median !== null ? computePercentDiff(r.userValue, median) : null,
        sampleSize: r.response.sampleSize,
      };
    });

  const result = runDiagnostics(inputs);
  if (!result.primary) return null;

  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{t("diagnostics.title")}</p>

      <p className="mt-3 text-xs font-medium text-ink-500">{t("diagnostics.primaryLabel")}</p>
      <p className="mt-1 font-display text-base font-semibold text-ink-900">
        {t(`diagnostics.${result.primary.rule.observationKey}`)}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-700">
        {t(`diagnostics.${result.primary.rule.interpretationKey}`)}
      </p>

      <div className="mt-3 rounded-xl bg-surface2 p-3 text-xs text-ink-600">
        <p className="font-medium text-ink-700">{t("diagnostics.evidenceTitle")}</p>
        {result.primary.evidence.map((e) => (
          <p key={e.metric} className="mt-0.5">
            {e.metric.toUpperCase()} — {t("diagnostics.evidenceSampleSize", { n: e.sampleSize })}
          </p>
        ))}
      </div>

      {result.secondary.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{t("diagnostics.secondaryTitle")}</p>
          <div className="mt-2 space-y-2">
            {result.secondary.map((m) => (
              <div key={m.rule.id} className="text-sm text-ink-700">
                {t(`diagnostics.${m.rule.observationKey}`)}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
