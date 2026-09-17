"use client";

import { PLATFORM_CARDS } from "@/lib/mock/taxonomies";
import { EntityCard } from "@/components/ui/EntityCard";
import { EntityAvatar } from "@/components/ui/EntityAvatar";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface PlatformStepProps {
  selectedUiId: string | null;
  onSelect: (uiId: string) => void;
}

// Phase 20C item G: onto the shared EntityCard pattern (item B) so
// benchmark platform selection, media catalog, and planner opportunity
// cards all read as the same "kind of thing" — same avatar chip, same
// selection affordance — rather than three independently-styled grids.
export function PlatformStep({ selectedUiId, onSelect }: PlatformStepProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-4xl px-4">
      <h2 className="mb-4 text-center font-display text-lg font-semibold text-ink-900">
        {t("wizard.questionPlatform")}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {PLATFORM_CARDS.map((card) => (
          <EntityCard
            key={card.uiId}
            avatar={<EntityAvatar label={card.label} platformUiId={card.uiId} size={40} />}
            title={card.label}
            meta={t(card.descriptionKey)}
            selectable
            selected={selectedUiId === card.uiId}
            onSelect={() => onSelect(card.uiId)}
          />
        ))}
      </div>
    </div>
  );
}
