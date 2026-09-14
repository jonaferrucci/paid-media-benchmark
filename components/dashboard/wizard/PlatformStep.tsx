"use client";

import { Check } from "lucide-react";
import { PLATFORM_CARDS } from "@/lib/mock/taxonomies";
import { PlatformLogo } from "@/components/dashboard/PlatformLogo";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface PlatformStepProps {
  selectedUiId: string | null;
  onSelect: (uiId: string) => void;
}

export function PlatformStep({ selectedUiId, onSelect }: PlatformStepProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-2xl px-4">
      <h2 className="mb-4 text-center font-display text-lg font-semibold text-ink-900">
        {t("wizard.questionPlatform")}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PLATFORM_CARDS.map((card) => {
          const isSelected = selectedUiId === card.uiId;
          return (
            <button
              key={card.uiId}
              onClick={() => onSelect(card.uiId)}
              className={`group relative flex flex-col items-start gap-2 rounded-[20px] border bg-surface p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                isSelected ? "border-primary ring-2 ring-primary/30" : "border-line"
              }`}
            >
              {isSelected && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                  <Check size={12} />
                </span>
              )}
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface2">
                <PlatformLogo uiId={card.uiId} size={22} />
              </span>
              <span className="text-sm font-semibold text-ink-900">{card.label}</span>
              <span className="text-xs text-ink-600">{t(card.descriptionKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
