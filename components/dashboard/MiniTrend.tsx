"use client";

import { ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { getKpiResults } from "@/lib/mock/benchmarks";
import type { CohortFilters } from "@/lib/types";

// A representative cohort, consistent with the other homepage
// discovery modules (GlobalInsights/FeaturedModules use the same
// Meta Ads / Beauty & Personal Care / Argentina combination). Mock
// data, same architecture as the rest of the homepage per Phase 13
// scope -- not connected to the real engine in this phase.
const SNAPSHOT_FILTERS: CohortFilters = {
  platform: "meta_ads",
  country: "AR",
  timeWindow: "last_12_months",
  verticalId: "beauty_personal_care",
  objective: "traffic",
  audienceStrategy: "broad",
  funnelStage: null,
  minAge: null,
  maxAge: null,
  campaignType: null,
  spendBand: null,
  durationBand: null,
};

interface MiniTrendProps {
  onViewBenchmark?: () => void;
}

// "Benchmark Snapshot" / "Vista rápida" -- Phase 13 section 10.
// Reuses the same P25/Median/P75 track visual language established in
// the real benchmark result (ComparisonDetail), without duplicating
// that component -- this is a lighter, homepage-scale version with no
// user-value marker, since there's no user input here yet.
export function MiniTrend({ onViewBenchmark }: MiniTrendProps) {
  const { t } = useTranslation();
  const [result] = getKpiResults(SNAPSHOT_FILTERS, ["cpm"]);

  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="h-1 bg-brandGradient" aria-hidden="true" />
      <div className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{t("market.snapshotTitle")}</p>

        <div className="mt-3 flex items-baseline gap-2">
          <p className="tabular font-display text-3xl font-semibold text-ink-900">
            USD {result.median.toFixed(2)}
          </p>
          <p className="text-sm text-ink-500">CPM</p>
        </div>

        <div className="relative mt-6 pt-5">
          <div aria-hidden="true" className="relative h-3 text-[10px] font-medium text-ink-400">
            <span className="absolute -translate-x-1/2" style={{ left: "20%" }}>P25</span>
            <span className="absolute -translate-x-1/2 font-semibold text-ink-600" style={{ left: "50%" }}>
              {t("benchmarkLive.medianShort")}
            </span>
            <span className="absolute -translate-x-1/2" style={{ left: "80%" }}>P75</span>
          </div>
          <div className="relative h-2 rounded-full bg-surface2" aria-hidden="true">
            <div className="absolute h-2 rounded-full bg-primary-soft" style={{ left: "20%", width: "60%" }} />
            <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary shadow" style={{ left: "50%" }} />
          </div>
          <div aria-hidden="true" className="mt-1 flex justify-between text-[11px] text-ink-400">
            <span>USD {result.p25.toFixed(2)}</span>
            <span>USD {result.p75.toFixed(2)}</span>
          </div>
        </div>

        <p className="mt-4 text-xs text-ink-500">
          Meta Ads · Beauty & Personal Care · Argentina
        </p>
        <p className="mt-1 text-[11px] text-ink-400">
          {t("benchmarkLive.sampleSizeProminent", { n: result.sampleSize })}
        </p>

        {onViewBenchmark && (
          <button
            onClick={onViewBenchmark}
            className="mt-4 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {t("wizard.viewBenchmark")} <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
