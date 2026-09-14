"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { CohortFilters } from "@/lib/types";
import { VerticalComparisonChart } from "@/components/dashboard/VerticalComparisonChart";
import { AudienceComparisonChart } from "@/components/dashboard/AudienceComparisonChart";
import { MetricTrendChart } from "@/components/dashboard/MetricTrendChart";
import { seededRandom, randomInRange } from "@/lib/mock/random";
import { formatMetricValue } from "@/lib/format";

const DEFAULT_MARKET_FILTERS: CohortFilters = {
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

const PLATFORM_IDS = ["meta_ads", "google_ads", "tiktok_ads", "pinterest_ads", "dsp_programmatic"] as const;
const PLATFORM_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  tiktok_ads: "TikTok Ads",
  pinterest_ads: "Pinterest Ads",
  dsp_programmatic: "DSP / Programmatic",
};

function PlatformCpmRanking() {
  const data = PLATFORM_IDS.map((id) => {
    const rand = seededRandom(`market-platform-cpm-${id}`);
    return { label: PLATFORM_LABELS[id], value: randomInRange(rand, 2.0, 9.0) };
  }).sort((a, b) => a.value - b.value);

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 8, bottom: 0 }}>
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
            tickFormatter={(v) => formatMetricValue(v, "currency")}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--color-text-primary)" }}
            axisLine={false}
            tickLine={false}
            width={110}
          />
          <Tooltip
            formatter={(v: number) => formatMetricValue(v, "currency")}
            contentStyle={{
              fontSize: 12,
              borderRadius: 12,
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text-primary)",
            }}
          />
          <Bar dataKey="value" fill="var(--color-primary)" radius={[0, 8, 8, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExploreMarket() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pb-16">
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold text-ink-900">{t("market.overviewTitle")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-ink-600">{t("market.overviewSubtitle")}</p>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="font-display text-sm font-semibold text-ink-900">{t("market.platformsSection")}</h2>
        <div className="mt-3">
          <PlatformCpmRanking />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 font-display text-sm font-semibold text-ink-900">{t("market.verticalsSection")}</h2>
          <VerticalComparisonChart filters={DEFAULT_MARKET_FILTERS} />
        </div>
        <div>
          <h2 className="mb-2 font-display text-sm font-semibold text-ink-900">{t("market.audiencesSection")}</h2>
          <AudienceComparisonChart filters={DEFAULT_MARKET_FILTERS} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold text-ink-900">{t("market.trendsSection")}</h2>
        <MetricTrendChart filters={DEFAULT_MARKET_FILTERS} />
      </section>
    </div>
  );
}
