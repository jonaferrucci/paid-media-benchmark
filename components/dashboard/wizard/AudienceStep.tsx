"use client";

import { AUDIENCE_STRATEGIES } from "@/lib/mock/taxonomies";
import { AudienceStrategy } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface AudienceStepProps {
  onSelect: (audience: AudienceStrategy) => void;
}

export function AudienceStep({ onSelect }: AudienceStepProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-2xl px-4">
      <h2 className="mb-4 text-center font-display text-lg font-semibold text-ink-900">
        {t("wizard.questionAudience")}
      </h2>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {AUDIENCE_STRATEGIES.map((a) => (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            className="rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-primary hover:shadow-sm"
          >
            <p className="text-sm font-semibold text-ink-900">{t(`audiences.${a.id}`)}</p>
            <p className="mt-0.5 text-xs text-ink-600">{t(`audienceDesc.${a.id}`)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
