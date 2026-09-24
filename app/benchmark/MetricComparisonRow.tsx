"use client";

// CUCURUCHO INTELLIGENCE 2 (§14 — expandable metric detail without
// duplicating BenchmarkExplorer).
//
// Pure extraction from app/benchmark/CampaignExplorer.tsx's own
// CampaignRow/STATUS_ICON/ACCENT_BORDER — zero visual or behavioral
// change for CampaignExplorer.tsx, which now imports these from here
// instead of defining them locally. Campaign Explorer's real-campaign
// market comparison (app/account/contributions/[id]/ContributionDetail.tsx)
// needs the exact same per-metric row (status pill, classification
// chip, expandable ComparisonDetail) that the manual "compare a
// hypothetical campaign" tool already has — this is the ONE place that
// row now lives, so a future change to it (e.g. a new status icon)
// never has to be made twice.
import { ChevronDown, ChevronUp, Info, ShieldAlert, AlertCircle } from "lucide-react";
import { ComparisonDetail, LABEL_STYLE, LABEL_ICON } from "./ComparisonDetail";
import { classifyPerformance, formatMetricValue, formatPercentDiff, computePercentDiff, isContextualPosition, resolveClassificationLabelKey } from "@/lib/comparison/classify";
import type { CampaignMetricSummary } from "@/lib/comparison/campaign";
import type { BenchmarkResponse } from "./actions";

export interface CampaignResultRow extends CampaignMetricSummary {
  response: BenchmarkResponse;
  userValue: number;
}

// Distinct icon per non-success status, so insufficient-sample,
// no-data, and methodology-block read as visually different states,
// not one generic gray pill — Phase 11.1 item E/G. No new data is
// invented; this only clarifies which real status is which.
export const STATUS_ICON: Record<string, typeof Info> = {
  insufficient_sample: Info,
  no_data: Info,
  methodology_block: ShieldAlert,
  error: AlertCircle,
};

export const ACCENT_BORDER: Record<string, string> = {
  muy_competitivo: "border-l-pistachio",
  competitivo: "border-l-primary",
  por_debajo_del_benchmark: "border-l-vanilla",
  requiere_atencion: "border-l-caution",
  por_debajo_del_rango: "border-l-line",
  dentro_del_rango: "border-l-line",
  por_encima_del_rango: "border-l-line",
};

export function MetricComparisonRow({
  row, t, expanded, onToggle, platformLabel, objectiveLabel, verticalLabel, countryLabel,
}: {
  row: CampaignResultRow;
  t: (key: string, vars?: Record<string, string | number>) => string;
  expanded: boolean;
  onToggle: () => void;
  platformLabel: string;
  objectiveLabel: string;
  verticalLabel: string;
  countryLabel: string;
}) {
  const { response, userValue, classification, status } = row;
  const median = response.statistics.median;
  const percentDiff = median !== null ? computePercentDiff(userValue, median) : null;
  const contextual = classification !== null && isContextualPosition(classification);
  const ClassIcon = classification !== null ? LABEL_ICON[classification] : null;
  const StatusIcon = STATUS_ICON[status] ?? Info;
  const accent = status === "success" && classification !== null ? ACCENT_BORDER[classification] : "border-l-line";

  return (
    <div className={`overflow-hidden rounded-xl border border-l-4 border-line ${accent} transition-colors`}>
      <button onClick={onToggle} aria-expanded={status === "success" ? expanded : undefined} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface2/60">
        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-24 shrink-0 font-display text-sm font-semibold text-ink-900">{row.metric.toUpperCase()}</span>
          <span className="text-sm text-ink-700">
            {t("benchmarkLive.yourResult")}: {formatMetricValue(userValue, response.unit)}
          </span>
          {status === "success" && median !== null && (
            <span className="text-sm text-ink-600">{t("benchmarkLive.vsMedian")}: {formatMetricValue(median, response.unit)}</span>
          )}
          {status === "success" && !contextual && percentDiff !== null && (
            <span className="text-sm font-semibold text-ink-700">{formatPercentDiff(percentDiff)}</span>
          )}
          {status === "success" && classification !== null && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${LABEL_STYLE[classification]}`}>
              {ClassIcon && <ClassIcon size={11} aria-hidden="true" />}
              {t(`benchmarkLive.labels.${resolveClassificationLabelKey(response.benchmarkDirection, classification)}`)}
            </span>
          )}
          {status !== "success" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-0.5 text-xs font-medium text-ink-600">
              <StatusIcon size={11} aria-hidden="true" />
              {t(`benchmarkLive.statusShort.${status}`)}
            </span>
          )}
          {status === "success" && (
            <span className="text-xs text-ink-400">n = {response.sampleSize}</span>
          )}
        </div>
        {status === "success" && (expanded ? <ChevronUp size={16} className="text-ink-400" aria-hidden="true" /> : <ChevronDown size={16} className="text-ink-400" aria-hidden="true" />)}
      </button>

      {expanded && status === "success" && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <ComparisonDetail
            response={response}
            userValue={userValue}
            t={t}
            platformLabel={platformLabel}
            objectiveLabel={objectiveLabel}
            verticalLabel={verticalLabel}
            countryLabel={countryLabel}
          />
        </div>
      )}
    </div>
  );
}
