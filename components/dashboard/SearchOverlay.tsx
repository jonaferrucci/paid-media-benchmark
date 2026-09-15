"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { CohortFilters } from "@/lib/types";

interface SearchOverlayProps {
  onClose: () => void;
  onApply: (partial: Partial<CohortFilters>) => void;
}

export function SearchOverlay({ onClose, onApply }: SearchOverlayProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const suggestions: { label: string; apply: Partial<CohortFilters> }[] = [
    { label: "Meta Ads", apply: { platform: "meta_ads" } },
    { label: "Beauty & Personal Care", apply: { verticalId: "beauty_personal_care" } },
    { label: "Automotive", apply: { verticalId: "automotive" } },
    { label: t("audiences.broad"), apply: { audienceStrategy: "broad" } },
    { label: t("audiences.remarketing"), apply: { audienceStrategy: "remarketing" } },
    { label: t("objectives.traffic"), apply: { objective: "traffic" } },
    { label: t("objectives.video_views"), apply: { objective: "video_views" } },
  ];

  const filtered = query
    ? suggestions.filter((s) => s.label.toLowerCase().includes(query.toLowerCase()))
    : suggestions;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-24">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surfaceElevated p-4 shadow-lg">
        <div className="flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-2.5">
          <Search size={15} className="text-ink-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            className="flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
          />
          <button onClick={onClose} className="text-ink-400 hover:text-ink-900">
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {filtered.map((s) => (
            <button
              key={s.label}
              onClick={() => {
                onApply(s.apply);
                onClose();
              }}
              className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-primary/50 hover:text-primary"
            >
              {s.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-1 py-2 text-xs text-ink-400">{t("matrix.noMatches", { query })}</p>
          )}
        </div>
      </div>
    </div>
  );
}
