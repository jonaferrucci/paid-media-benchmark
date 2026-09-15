"use client";

import { ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { CohortFilters } from "@/lib/types";
import { seededRandom, randomInRange } from "@/lib/mock/random";

interface FeaturedModulesProps {
  onQuickBenchmark: (filters: CohortFilters) => void;
}

export function FeaturedModules({ onQuickBenchmark }: FeaturedModulesProps) {
  const { t } = useTranslation();

  const cpm = randomInRange(seededRandom("featured-vertical-cpm"), 2.9, 3.6);
  const cpv = randomInRange(seededRandom("featured-platform-cpv"), 0.02, 0.045);

  const featuredVerticalFilters: CohortFilters = {
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

  const featuredPlatformFilters: CohortFilters = {
    platform: "tiktok_ads",
    country: "AR",
    timeWindow: "last_12_months",
    verticalId: "fashion_apparel",
    objective: "video_views",
    audienceStrategy: "broad",
    funnelStage: null,
    minAge: null,
    maxAge: null,
    campaignType: null,
    spendBand: null,
    durationBand: null,
  };

  return (
    <section className="mx-auto grid max-w-4xl grid-cols-1 gap-3 px-4 sm:grid-cols-2">
      <button
        onClick={() => onQuickBenchmark(featuredVerticalFilters)}
        className="rounded-2xl border border-line bg-surface p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
          {t("market.featuredVerticalTitle")}
        </p>
        <p className="mt-1 font-display text-base font-semibold text-primary">Beauty & Personal Care</p>
        <p className="mt-1 text-xs text-ink-600">Meta Ads · {t("objectives.traffic")} · {t("audiences.broad")}</p>
        <p className="mt-2 text-sm font-medium text-ink-900">{t("market.medianCpm")}: USD {cpm.toFixed(2)}</p>
        <span className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
          {t("wizard.viewBenchmark")} <ArrowRight size={12} />
        </span>
      </button>

      <button
        onClick={() => onQuickBenchmark(featuredPlatformFilters)}
        className="rounded-2xl border border-line bg-surface p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
          {t("market.featuredPlatformTitle")}
        </p>
        <p className="mt-1 font-display text-base font-semibold text-coral">TikTok Ads</p>
        <p className="mt-1 text-xs text-ink-600">{t("objectives.video_views")}</p>
        <p className="mt-2 text-sm font-medium text-ink-900">{t("market.medianCpv")}: USD {cpv.toFixed(3)}</p>
        <span className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
          {t("wizard.viewBenchmark")} <ArrowRight size={12} />
        </span>
      </button>
    </section>
  );
}
