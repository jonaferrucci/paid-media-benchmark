"use client";

import { CheckCircle2, AlertTriangle, AlertCircle, Circle } from "lucide-react";
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

// Non-color-only signal (Phase 11 item J / C): a distinct icon per
// classification tier, so the state is never communicated by color
// alone. Purely presentational — never affects classification logic.
export const LABEL_ICON: Record<string, typeof CheckCircle2> = {
  muy_competitivo: CheckCircle2,
  competitivo: CheckCircle2,
  por_debajo_del_benchmark: AlertTriangle,
  requiere_atencion: AlertCircle,
  por_debajo_del_rango: Circle,
  dentro_del_rango: Circle,
  por_encima_del_rango: Circle,
};

// Full, static Tailwind class strings (not runtime-concatenated —
// Tailwind's compiler only detects literal class strings present in
// source, so building "bg-x/40" via template interpolation would
// silently produce no CSS at all).
const CARD_TINT: Record<string, string> = {
  muy_competitivo: "bg-pistachio-soft/40",
  competitivo: "bg-primary-soft/40",
  por_debajo_del_benchmark: "bg-vanilla-soft/40",
  requiere_atencion: "bg-caution-soft/40",
  por_debajo_del_rango: "bg-surface2",
  dentro_del_rango: "bg-surface2",
  por_encima_del_rango: "bg-surface2",
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
 *
 * Phase 11.1: visual upgrade only (icons, structured insight,
 * clearer percentile track ticks). Zero changes to classification,
 * percentile, or marker-position math — all still delegated entirely
 * to lib/comparison/classify.ts.
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
  const Icon = LABEL_ICON[classification] ?? Circle;

  return (
    <div aria-live="polite">
      {/* C — compact intelligence summary: icon + label together, never
          color alone, plus a semantic surface tint on the whole card
          rather than just the pill. */}
      <div className={`rounded-xl p-4 ${CARD_TINT[classification]}`}>
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
            <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${LABEL_STYLE[classification]}`}>
              <Icon size={12} aria-hidden="true" />
              {t(`benchmarkLive.labels.${classification}`)}
            </span>
          </div>
        </div>
      </div>

      {/* B — upgraded percentile track: explicit tick marks and labels
          for P25/Median/P75 above the bar, "typical range" band
          labeled, user marker visually distinct (dark pin vs. hollow
          benchmark ticks). Still an ordinal/schematic representation
          (fixed 30/50/70% anchor positions for P25/Median/P75) — the
          engine does not calculate a distribution shape or histogram,
          so none is drawn; only the three calculated statistics plus
          the user's relative position are ever shown. */}
      <div className="relative mt-8 pt-6">
        <span className="sr-only">
          {t("benchmarkLive.trackScreenReaderSummary", {
            p25: formatMetricValue(p25, response.unit),
            median: formatMetricValue(median, response.unit),
            p75: formatMetricValue(p75, response.unit),
            value: formatMetricValue(userValue, response.unit),
          })}
        </span>
        <div aria-hidden="true">
          {/* tick labels above the track */}
          <div className="relative h-4 text-[10px] font-medium text-ink-400">
            <span className="absolute -translate-x-1/2" style={{ left: "30%" }}>P25</span>
            <span className="absolute -translate-x-1/2 font-semibold text-ink-600" style={{ left: "50%" }}>{t("benchmarkLive.medianShort")}</span>
            <span className="absolute -translate-x-1/2" style={{ left: "70%" }}>P75</span>
          </div>

          <div className="relative h-2 rounded-full bg-surface2">
            <div className="absolute h-2 rounded-full bg-primary-soft" style={{ left: "30%", width: "40%" }} title={t("benchmarkLive.typicalRangeLabel")} />
            {/* tick marks at P25/P75 */}
            <div className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-ink-400" style={{ left: "30%" }} />
            <div className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-ink-400" style={{ left: "70%" }} />
            {/* median: emphasized, larger */}
            <div
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary shadow"
              style={{ left: "50%" }}
            />
            {/* user marker: distinct dark pin, transitions smoothly */}
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
        </div>
        <div aria-hidden="true" className="mt-1 flex justify-between text-[11px] text-ink-400">
          <span>{formatMetricValue(p25, response.unit)}</span>
          <span>{formatMetricValue(median, response.unit)}</span>
          <span>{formatMetricValue(p75, response.unit)}</span>
        </div>
      </div>

      {/* D — structured insight: OBSERVACIÓN (objective, deterministic
          restatement of the numbers already shown above) then LECTURA
          DEL BENCHMARK (the existing Phase 6 deterministic
          interpretation sentence, unchanged). No new causal claim, no
          recommendation — purely a presentation split of content that
          already existed.

          PHASE 33 (§5): "Cómo leer este resultado" wraps these same
          two paragraphs under one explicit heading — the underlying
          classification/insight logic (lib/comparison/classify.ts) is
          completely untouched; this is a title added above existing,
          already-approved content, never new evaluative text. */}
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-xs font-semibold text-ink-900">{t("benchmarkLive.readingHowToTitle")}</p>
        <div className="mt-3 space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t("benchmarkLive.observationLabel")}</p>
          <p className="mt-1 text-sm text-ink-700">
            {contextual || percentDiff === null
              ? t("benchmarkLive.observationContextual", {
                  metric: response.metric.toUpperCase(),
                  value: formatMetricValue(userValue, response.unit),
                })
              : t(percentDiff >= 0 ? "benchmarkLive.observationAbove" : "benchmarkLive.observationBelow", {
                  metric: response.metric.toUpperCase(),
                  value: formatMetricValue(userValue, response.unit),
                  absDiff: Math.abs(percentDiff).toFixed(1).replace(".", ","),
                })}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t("benchmarkLive.readingLabel")}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">
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
        </div>
      </div>
    </div>
  );
}
