"use client";

import {
  classifyPerformance,
  computeMarkerPosition,
  computePercentDiff,
  formatMetricValue,
  formatPercentDiff,
  getInsightKey,
  isContextualPosition,
} from "@/lib/comparison/classify";
import type { BenchmarkResponse } from "./actions";

export const LABEL_STYLE: Record<string, string> = {
  muy_competitivo: "bg-pistachio-soft text-pistachio",
  competitivo: "bg-primary-soft text-primary",
  por_debajo_del_benchmark: "bg-vanilla-soft text-vanilla",
  requiere_atencion: "bg-caution-soft text-caution",
  por_debajo_del_rango: "bg-surface2 text-ink-600",
  dentro_del_rango: "bg-surface2 text-ink-600",
  por_encima_del_rango: "bg-surface2 text-ink-600",
};

/**
 * Pure(ish) rendering of "user result vs. benchmark" -- delta, label,
 * P25/Median/P75 range bar with the user's marker, and the
 * deterministic insight sentence. Takes an already-known userValue
 * (no internal input state), so it works identically whether the
 * caller is the single-metric flow (Phase 6, input lives in the
 * parent) or a campaign-mode expanded row (Phase 7, value was already
 * entered in the campaign form). This is the ONE place this
 * calculation-to-JSX mapping is written -- do not re-derive it
 * elsewhere.
 */
export function ComparisonDetail({
  response,
  userValue,
  t,
  platformLabel,
  objectiveLabel,
  verticalLabel,
  countryLabel,
}: {
  response: BenchmarkResponse;
  userValue: number;
  t: (key: string, vars?: Record<string, string | number>) => string;
  platformLabel: string;
  objectiveLabel: string;
  verticalLabel: string;
  countryLabel: string;
}) {
  const { p25, median, p75 } = response.statistics;
  if (p25 === null || median === null || p75 === null) return null;

  const stats = { p25, median, p75 };
  const classification = classifyPerformance(userValue, stats, response.benchmarkDirection);
  const percentDiff = computePercentDiff(userValue, median);
  const markerPosition = computeMarkerPosition(userValue, stats);
  const insightKey = getInsightKey(response.benchmarkDirection, classification);
  const contextual = isContextualPosition(classification);

  return (
    <div aria-live="polite">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{t("benchmarkLive.yourResultLabel")}</p>
          <p className="tabular font-display text-xl font-semibold text-ink-900">{formatMetricValue(userValue, response.unit)}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{t("benchmarkLive.marketMedianLabel")}</p>
          <p className="tabular font-display text-xl font-semibold text-ink-700">{formatMetricValue(median, response.unit)}</p>
        </div>
        {!contextual && percentDiff !== null && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{t("benchmarkLive.differenceLabel")}</p>
            <p className="tabular font-display text-xl font-semibold text-ink-900">{formatPercentDiff(percentDiff)}</p>
          </div>
        )}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{t("benchmarkLive.classificationLabel")}</p>
          <span className={`mt-0.5 inline-block rounded-full px-3 py-1 text-xs font-semibold ${LABEL_STYLE[classification]}`}>
            {t(`benchmarkLive.labels.${classification}`)}
          </span>
        </div>
      </div>

      <div className="relative mt-8 pt-3">
        <span className="sr-only">
          {t("benchmarkLive.trackScreenReaderSummary", {
            p25: formatMetricValue(p25, response.unit),
            median: formatMetricValue(median, response.unit),
            p75: formatMetricValue(p75, response.unit),
            value: formatMetricValue(userValue, response.unit),
          })}
        </span>
        <div className="relative h-2 rounded-full bg-surface2" aria-hidden="true">
          <div className="absolute h-2 rounded-full bg-primary-soft" style={{ left: "30%", width: "40%" }} />
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary shadow"
            style={{ left: "50%" }}
            title="Median"
          />
          <div
            className="absolute -top-3 flex -translate-x-1/2 flex-col items-center transition-[left] duration-300 ease-out"
            style={{ left: `${markerPosition}%` }}
          >
            <span className="whitespace-nowrap rounded-full bg-ink-900 px-2 py-0.5 text-[10px] font-medium text-white">
              {t("benchmarkLive.yourResultMarker")}
            </span>
            <span className="h-5 w-0.5 bg-ink-900" />
          </div>
        </div>
        <div aria-hidden="true" className="mt-1 flex justify-between text-[11px] text-ink-400">
          <span>P25: {formatMetricValue(p25, response.unit)}</span>
          <span>{t("benchmarkLive.marketMedianLabel")}: {formatMetricValue(median, response.unit)}</span>
          <span>P75: {formatMetricValue(p75, response.unit)}</span>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-ink-700">
        {t(`benchmarkLive.insight.${insightKey}`, {
          metric: response.metric.toUpperCase(),
          platform: platformLabel,
          objective: objectiveLabel,
          vertical: verticalLabel,
          country: countryLabel,
          absDiff: percentDiff !== null ? Math.abs(percentDiff).toFixed(1).replace(".", ",") : "",
        })}
      </p>
    </div>
  );
}
