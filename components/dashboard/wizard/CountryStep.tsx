"use client";

import { useState } from "react";
import { COUNTRIES } from "@/lib/mock/taxonomies";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface CountryStepProps {
  onSelect: (countryId: string) => void;
}

const PRIORITY_COUNTRY_IDS = ["AR", "MX", "UY", "BR", "CL", "CO"];

export function CountryStep({ onSelect }: CountryStepProps) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  const shown = showAll ? COUNTRIES : COUNTRIES.filter((c) => PRIORITY_COUNTRY_IDS.includes(c.id));

  return (
    <div className="mx-auto max-w-2xl px-4">
      <h2 className="mb-4 text-center font-display text-lg font-semibold text-ink-900">
        {t("wizard.questionCountry")}
      </h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {shown.map((country) => (
          <button
            key={country.id}
            onClick={() => onSelect(country.id)}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface px-3 py-3.5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
          >
            <span className="text-2xl leading-none">{country.flag}</span>
            <span className="text-xs font-medium text-ink-900">{t(`countries.${country.id}`)}</span>
          </button>
        ))}
      </div>
      {!showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mx-auto mt-4 block text-xs font-medium text-primary hover:underline"
        >
          {t("wizard.viewAllCountries")}
        </button>
      )}
    </div>
  );
}
