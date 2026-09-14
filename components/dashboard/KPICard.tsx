"use client";

import { useState } from "react";
import { ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, Info } from "lucide-react";
import { KPIResult } from "@/lib/types";
import { formatMetricValue } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface KPICardProps {
  kpi: KPIResult;
  variant?: "primary" | "supporting" | "outcome";
}

export function KPICard({ kpi, variant = "primary" }: KPICardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const isOutcome = variant === "outcome";
  const isSupporting = variant === "supporting";
  const metricLabel = t(`metrics.${kpi.metric}`);

  const cardClasses = isOutcome
    ? "rounded-2xl border border-line border-t-[3px] border-t-coral bg-surface p-4 shadow-sm"
    : isSupporting
    ? "rounded-2xl border border-line bg-surface2 p-3.5"
    : "rounded-2xl border border-line bg-surface p-4 shadow-sm";

  if (kpi.insufficientData) {
    return (
      <div className={cardClasses.replace("border-line", "border-dashed border-line")}>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{metricLabel}</p>
        <p className="mt-3 text-sm text-ink-600">{t("kpi.notEnoughData")}</p>
        <p className="mt-1 text-xs text-ink-400">
          {kpi.sampleSize} / 10 {t("kpi.comparableDatasetsShort")}
        </p>
      </div>
    );
  }

  const movement =
    kpi.previousPeriodMedian !== null
      ? ((kpi.median - kpi.previousPeriodMedian) / kpi.previousPeriodMedian) * 100
      : null;

  const diffFromMedian =
    kpi.yourValue !== null ? ((kpi.yourValue - kpi.median) / kpi.median) * 100 : null;
  const isBelowMedian = diffFromMedian !== null && diffFromMedian < 0;

  function interpretationText(): string {
    if (kpi.direction === "contextual") {
      return t("interpretation.contextual", { metric: metricLabel });
    }
    if (kpi.direction === "lower_is_better") {
      return isBelowMedian
        ? t("interpretation.lowerBetterBelow", { metric: metricLabel })
        : t("interpretation.lowerBetterAbove", { metric: metricLabel });
    }
    return isBelowMedian
      ? t("interpretation.higherBetterBelow", { metric: metricLabel })
      : t("interpretation.higherBetterAbove", { metric: metricLabel });
  }

  const valueTextClass = isSupporting
    ? "font-display text-lg font-semibold text-ink-900"
    : "font-display text-2xl font-semibold text-ink-900";

  return (
    <div className={cardClasses}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{metricLabel}</p>
        <button
          onMouseEnter={() => setShowHelp(true)}
          onMouseLeave={() => setShowHelp(false)}
          onClick={() => setShowHelp((s) => !s)}
          className="relative text-ink-400 hover:text-primary"
          aria-label={metricLabel}
        >
          <Info size={13} />
          {showHelp && (
            <span className="absolute right-0 top-5 z-10 w-48 rounded-xl border border-line bg-surface p-2.5 text-left text-[11px] font-normal normal-case leading-snug text-ink-700 shadow-lg">
              {t(`metricHelp.${kpi.metric}`)}
            </span>
          )}
        </button>
      </div>

      <p className={`tabular mt-2 ${valueTextClass}`}>
        {kpi.yourValue !== null ? formatMetricValue(kpi.yourValue, kpi.unit) : "—"}
      </p>
      <p className="text-xs text-ink-600">{t("kpi.yourResult")}</p>

      <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
        <div>
          <p className="tabular text-sm font-medium text-ink-700">
            {formatMetricValue(kpi.median, kpi.unit)}
          </p>
          <p className="text-xs text-ink-400">{t("kpi.marketMedian")}</p>
        </div>
        {diffFromMedian !== null && kpi.direction !== "contextual" && (
          <div
            className={`flex items-center gap-1 text-xs font-medium ${
              (kpi.direction === "lower_is_better") === isBelowMedian
                ? "text-pistachio"
                : "text-coral"
            }`}
          >
            {isBelowMedian ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
            <span className="tabular">
              {Math.abs(diffFromMedian).toFixed(0)}%{" "}
              {isBelowMedian ? t("kpi.lowerThanMedian") : t("kpi.higherThanMedian")}
            </span>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-400">n = {kpi.sampleSize.toLocaleString()}</p>

      {!isSupporting && (
        <button
          onClick={() => setExpanded((s) => !s)}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-primary"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? t("kpi.hideDetail") : t("kpi.viewDetail")}
        </button>
      )}

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-line pt-3 text-xs text-ink-600">
          <p>
            {t("kpi.typicalRange")}:{" "}
            <span className="tabular font-medium text-ink-900">
              {formatMetricValue(kpi.p25, kpi.unit)} – {formatMetricValue(kpi.p75, kpi.unit)}
            </span>
          </p>
          {kpi.percentile !== null && (
            <p>
              {t("kpi.percentile")}:{" "}
              <span className="tabular font-medium text-ink-900">P{kpi.percentile}</span>
            </p>
          )}
          {movement !== null && (
            <p>
              {Math.abs(movement).toFixed(0)}% {movement > 0 ? "↑" : "↓"} {t("kpi.vsPriorPeriod")}
            </p>
          )}
          <div className="rounded-xl bg-primary-soft p-3 text-ink-700">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              {t("kpi.howToRead")}
            </p>
            <p className="leading-relaxed">{interpretationText()}</p>
          </div>
        </div>
      )}
    </div>
  );
}
