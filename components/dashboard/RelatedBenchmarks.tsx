"use client";

import { ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { CohortFilters } from "@/lib/types";

interface RelatedBenchmarksProps {
  verticalLabel: string;
  onSelect: (suggestion: Partial<CohortFilters>) => void;
}

export function RelatedBenchmarks({ verticalLabel, onSelect }: RelatedBenchmarksProps) {
  const { t } = useTranslation();

  // Mock suggestions — in a later phase these would come from the real
  // benchmark engine's nearby-cohort ranking, not a fixed list.
  const suggestions: { platform: string; vertical: string; audience: string; apply: Partial<CohortFilters> }[] = [
    {
      platform: "Meta Ads",
      vertical: verticalLabel,
      audience: t("audiences.remarketing"),
      apply: { audienceStrategy: "remarketing" },
    },
    {
      platform: "Meta Ads",
      vertical: verticalLabel,
      audience: t("audiences.interest_based"),
      apply: { audienceStrategy: "interest_based" },
    },
    {
      platform: "Meta Ads",
      vertical: verticalLabel,
      audience: t("objectives.video_views"),
      apply: { objective: "video_views" },
    },
  ];

  return (
    <section>
      <h3 className="mb-3 font-display text-base font-semibold text-ink-900">
        {t("related.title")}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {suggestions.map((s, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(s.apply)}
            className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 text-left shadow-sm transition-colors hover:border-primary/40"
          >
            <div>
              <p className="text-xs text-ink-600">{s.platform}</p>
              <p className="mt-0.5 text-sm font-medium text-ink-900">{s.vertical}</p>
              <p className="mt-0.5 text-xs text-primary">{s.audience}</p>
            </div>
            <ArrowRight size={15} className="shrink-0 text-ink-400" />
          </button>
        ))}
      </div>
    </section>
  );
}
