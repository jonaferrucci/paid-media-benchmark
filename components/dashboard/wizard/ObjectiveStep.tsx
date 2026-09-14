"use client";

import { Eye, Sparkles, MousePointerClick, PlayCircle, Heart, ClipboardList, ShoppingCart } from "lucide-react";
import { OBJECTIVE_CARDS } from "@/lib/mock/taxonomies";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface ObjectiveStepProps {
  onSelect: (uiKey: string) => void;
}

const ICONS: Record<string, typeof Eye> = {
  reach: Eye,
  awareness: Sparkles,
  traffic: MousePointerClick,
  video_views: PlayCircle,
  engagement: Heart,
  leads: ClipboardList,
  sales: ShoppingCart,
};

export function ObjectiveStep({ onSelect }: ObjectiveStepProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-2xl px-4">
      <h2 className="mb-4 text-center font-display text-lg font-semibold text-ink-900">
        {t("wizard.questionObjective")}
      </h2>
      <div className="flex flex-wrap justify-center gap-2.5">
        {OBJECTIVE_CARDS.map((card) => {
          const Icon = ICONS[card.uiKey];
          return (
            <button
              key={card.uiKey}
              onClick={() => onSelect(card.uiKey)}
              className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-900 transition-colors hover:border-primary hover:text-primary"
            >
              <Icon size={15} />
              {t(`objectivesWizard.${card.uiKey}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
