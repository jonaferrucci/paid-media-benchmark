"use client";

import { ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { CohortFilters } from "@/lib/types";
import { seededRandom, randomInRange } from "@/lib/mock/random";

interface GlobalInsightsProps {
  onExplore: (partial: Partial<CohortFilters>) => void;
}

export function GlobalInsights({ onExplore }: GlobalInsightsProps) {
  const { t } = useTranslation();

  const cpm = randomInRange(seededRandom("insight-cpm"), 2.9, 3.6);
  const cpv = randomInRange(seededRandom("insight-cpv"), 0.02, 0.045);
  const ctr = randomInRange(seededRandom("insight-ctr"), 1.6, 2.0);
  const cpc = randomInRange(seededRandom("insight-cpc"), 0.15, 0.22);

  const cards = [
    {
      title: t("market.card1Title"),
      body: (
        <>
          <p className="text-xs text-ink-600">Meta Ads</p>
          <p className="mt-1 font-display text-xl font-semibold text-ink-900">
            {t("market.medianCpm")}: USD {cpm.toFixed(2)}
          </p>
          <p className="mt-1 text-[11px] text-ink-400">{t("market.card1Context")}</p>
        </>
      ),
      cta: t("market.explore"),
      accent: "primary" as const,
      onClick: () => onExplore({ platform: "meta_ads", verticalId: "beauty_personal_care", country: "AR" }),
    },
    {
      title: t("market.card2Title"),
      body: (
        <>
          <p className="text-xs text-ink-600">{t("market.card2Platforms")}</p>
          <p className="mt-1 font-display text-xl font-semibold text-ink-900">
            {t("market.medianCpv")}: USD {cpv.toFixed(3)}
          </p>
        </>
      ),
      cta: t("market.card2Cta"),
      accent: "coral" as const,
      onClick: () => onExplore({ objective: "video_views" }),
    },
    {
      title: t("market.card3Title"),
      body: (
        <>
          <p className="text-xs text-ink-600">Beauty & Personal Care</p>
          <p className="mt-1 font-display text-xl font-semibold text-ink-900">
            {t("market.medianCtr")}: {ctr.toFixed(2)}%
          </p>
          <p className="mt-1 text-[11px] font-medium text-pistachio">+18% {t("market.card3Vs")}</p>
        </>
      ),
      cta: t("market.explore"),
      accent: "pistachio" as const,
      onClick: () => onExplore({ verticalId: "beauty_personal_care" }),
    },
    {
      title: t("market.card4Title"),
      body: (
        <>
          <p className="text-xs text-ink-600">{t("audiences.broad")}</p>
          <p className="mt-1 font-display text-xl font-semibold text-ink-900">
            {t("market.medianCpc")}: USD {cpc.toFixed(2)}
          </p>
        </>
      ),
      cta: t("market.explore"),
      accent: "vanilla" as const,
      onClick: () => onExplore({ audienceStrategy: "broad" }),
    },
  ];

  const accentBorder: Record<string, string> = {
    primary: "border-t-primary",
    coral: "border-t-coral",
    pistachio: "border-t-pistachio",
    vanilla: "border-t-vanilla",
  };

  return (
    <section className="mx-auto max-w-4xl px-4">
      <h2 className="mb-3 text-center font-display text-base font-semibold text-ink-900">
        {t("market.sectionTitle")}
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.title}
            className={`w-64 shrink-0 rounded-2xl border border-line border-t-[3px] ${accentBorder[card.accent]} bg-surface p-4 shadow-sm sm:w-auto`}
          >
            <p className="text-xs font-medium text-ink-900">{card.title}</p>
            <div className="mt-2">{card.body}</div>
            <button
              onClick={card.onClick}
              className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {card.cta} <ArrowRight size={12} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
