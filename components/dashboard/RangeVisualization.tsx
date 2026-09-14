"use client";

import { KPIResult } from "@/lib/types";
import { formatMetricValue } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface RangeVisualizationProps {
  kpi: KPIResult;
}

export function RangeVisualization({ kpi }: RangeVisualizationProps) {
  const { t } = useTranslation();
  if (kpi.insufficientData || kpi.yourValue === null) return null;

  const min = Math.min(kpi.p25, kpi.yourValue) * 0.92;
  const max = Math.max(kpi.p75, kpi.yourValue) * 1.08;
  const pct = (value: number) => ((value - min) / (max - min)) * 100;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <h3 className="font-display text-sm font-semibold text-ink-900">{t("position.title")}</h3>
      <p className="mt-1 text-xs text-ink-600">
        {t(`metrics.${kpi.metric}`)} · n = {kpi.sampleSize.toLocaleString()}
      </p>

      <div className="relative mt-8 h-2 rounded-full bg-surface2">
        <div
          className="absolute h-2 rounded-full bg-primary-soft"
          style={{ left: `${pct(kpi.p25)}%`, width: `${pct(kpi.p75) - pct(kpi.p25)}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-400"
          style={{ left: `${pct(kpi.median)}%` }}
        />
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-coral shadow"
          style={{ left: `${pct(kpi.yourValue)}%` }}
        />
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-ink-400">
        <span>{t("position.low")}</span>
        <span>{t("position.high")}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-600">
        <span>
          <span className="inline-block h-2 w-2 rounded-full bg-coral" />{" "}
          <span className="font-medium text-ink-900">{t("position.you")}:</span>{" "}
          {formatMetricValue(kpi.yourValue, kpi.unit)}
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-full bg-ink-400" />{" "}
          <span className="font-medium text-ink-900">{t("kpi.marketMedian")}:</span>{" "}
          {formatMetricValue(kpi.median, kpi.unit)}
        </span>
      </div>
    </section>
  );
}
