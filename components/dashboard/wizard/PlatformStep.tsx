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
//
// PHASE 39.2 (§6/§7): this is the ONLY consumer of PLATFORM_CARDS'
// descriptionKey (confirmed by repo-wide search) — the secondary
// description line it fed into EntityCard's `meta` prop was making
// Home's Finder step feel dense (icon + name + a second, often-
// truncated line). Dropping `meta` here is a Home-only visual
// simplification: PLATFORM_CARDS/descriptionKey themselves are
// untouched, so nothing about the shared platform taxonomy is
// eliminated — only this one screen no longer renders it. Card titles
// already wrap up to 2 lines (EntityCard's own line-clamp-2), so a
// longer name like "DSP / Programmatic" still reads in full at 320px
// instead of being truncated.
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
            selectable
            selected={selectedUiId === card.uiId}
            onSelect={() => onSelect(card.uiId)}
          />
        ))}
      </div>
    </div>
  );
}
