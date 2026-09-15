"use client";

import { Activity } from "lucide-react";
import { runDiagnostics } from "@/lib/diagnostics/evaluate";
import type { MetricComparisonInput } from "@/lib/diagnostics/types";
import { computePercentDiff, isContextualPosition, type ContextualPosition, type PerformanceLabel } from "@/lib/comparison/classify";
import { LABEL_STYLE } from "./ComparisonDetail";
import type { BenchmarkResponse } from "./actions";

interface CampaignResultRowLike {
  metric: string;
  status: string;
  classification: string | null;
  response: BenchmarkResponse;
  userValue: number;
}

// Maps a classification tier to a left-accent border color, reusing the
// exact same semantic colors as LABEL_STYLE (ComparisonDetail) — purely
// a visual echo of an already-computed classification, never a new
// interpretation of severity.
const ACCENT_BORDER: Record<string, string> = {
  muy_competitivo: "border-l-pistachio",
  competitivo: "border-l-primary",
  por_debajo_del_benchmark: "border-l-vanilla",
  requiere_atencion: "border-l-caution",
};

/**
 * Phase 8: sits underneath the existing Phase 7 campaign summary, never
 * replacing it. Renders nothing at all when no rule matches -- per
 * item 8, there is no empty-state banner here; the Phase 6/7 metric
 * insights above already cover that case on their own.
 * Phase 11: visual refinement only — icon, accent border, pill-style
 * evidence chips. No change to rule matching, priority, or copy.
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

  const accent = ACCENT_BORDER[result.primary.worstClassification] ?? "border-l-primary";

  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Activity size={16} className="text-primary" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{t("diagnostics.title")}</p>
      </div>

      <div className={`mt-3 rounded-xl border-l-4 ${accent} bg-surface2 p-4`}>
        <p className="text-xs font-medium text-ink-500">{t("diagnostics.primaryLabel")}</p>
        <p className="mt-1 font-display text-base font-semibold text-ink-900">
          {t(`diagnostics.${result.primary.rule.observationKey}`)}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">
          {t(`diagnostics.${result.primary.rule.interpretationKey}`)}
        </p>

        <div className="mt-3">
          <details className="group">
            <summary className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-ink-500 hover:text-primary">
              {t("diagnostics.evidenceTitle")}
              <span className="transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {result.primary.evidence.map((e) => (
                <span key={e.metric} className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-600 shadow-sm">
                  {e.metric.toUpperCase()} · {t("diagnostics.evidenceSampleSize", { n: e.sampleSize })}
                </span>
              ))}
            </div>
          </details>
        </div>
      </div>

      {result.secondary.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{t("diagnostics.secondaryTitle")}</p>
          <div className="mt-2 space-y-2">
            {result.secondary.map((m) => (
              <div key={m.rule.id} className="flex items-start gap-2 text-sm text-ink-700">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${LABEL_STYLE[m.worstClassification]?.split(" ")[0] ?? "bg-primary-soft"}`} aria-hidden="true" />
                {t(`diagnostics.${m.rule.observationKey}`)}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
