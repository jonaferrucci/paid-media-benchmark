"use client";

import { ReachBenchmark } from "@/lib/types";
import { formatCount, formatSampleSize } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface ReachCardProps {
  reach: ReachBenchmark;
}

export function ReachCard({ reach }: ReachCardProps) {
  const { t } = useTranslation();

  if (reach.insufficientData) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
          {t("reach.title")}
        </p>
        <p className="mt-3 text-sm text-ink-600">{t("kpi.notEnoughDataBody")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{t("reach.title")}</p>
      <p className="tabular mt-2 font-display text-2xl font-semibold text-ink-900">
        {formatCount(reach.yourReach)}
      </p>
      <p className="text-xs text-ink-600">{t("reach.uniqueUsers")}</p>

      <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-ink-600">
        <p>
          {t("reach.comparableCohort")}:{" "}
          <span className="font-medium text-ink-900">{reach.spendBandLabel}</span>
        </p>
        <p>
          {t("reach.duration")}:{" "}
          <span className="font-medium text-ink-900">{reach.durationBandLabel}</span>
        </p>
        <p>
          {t("reach.frequency")}:{" "}
          <span className="tabular font-medium text-ink-900">{reach.frequency.toFixed(1)}x</span>
        </p>
        <p>
          {t("reach.medianReach")}:{" "}
          <span className="tabular font-medium text-ink-900">
            {formatCount(reach.cohortMedianReach)}
          </span>
        </p>
      </div>

      <p className="mt-2 text-xs text-ink-400">
        n = {formatSampleSize(reach.sampleSize)} · {t("reach.notRanked")}
      </p>
    </div>
  );
}
