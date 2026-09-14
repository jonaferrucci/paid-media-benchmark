"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { VERTICALS } from "@/lib/mock/taxonomies";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface VerticalStepProps {
  onSelect: (verticalId: string) => void;
}

const COMMON_VERTICAL_IDS = [
  "beauty_personal_care",
  "fashion_apparel",
  "home_kitchen",
  "automotive",
  "financial_services",
  "food_beverage",
];

export function VerticalStep({ onSelect }: VerticalStepProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const commonVerticals = VERTICALS.filter((v) => COMMON_VERTICAL_IDS.includes(v.id));
  const filtered = query
    ? VERTICALS.filter((v) => v.label.toLowerCase().includes(query.toLowerCase()))
    : showAll
    ? VERTICALS
    : commonVerticals;

  return (
    <div className="mx-auto max-w-2xl px-4">
      <h2 className="mb-4 text-center font-display text-lg font-semibold text-ink-900">
        {t("wizard.questionVertical")}
      </h2>

      <div className="relative mx-auto mb-4 max-w-sm">
        <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("wizard.searchCategory")}
          className="w-full rounded-full border border-line bg-surface py-2.5 pl-9 pr-4 text-sm text-ink-900 outline-none focus-visible:border-primary"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {filtered.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            className="rounded-xl border border-line bg-surface px-3 py-3 text-sm font-medium text-ink-900 transition-colors hover:border-primary hover:text-primary"
          >
            {v.label}
          </button>
        ))}
      </div>

      {!query && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mx-auto mt-4 block text-xs font-medium text-primary hover:underline"
        >
          {t("wizard.viewAllCategories")}
        </button>
      )}
    </div>
  );
}
