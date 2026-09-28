"use client";

import { WifiOff } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";

// Same shape/pattern as app/benchmark/TaxonomyLoadError.tsx (shown when
// taxonomy loading fails server-side — see lib/benchmark/coverage.ts's
// own hasError flag), with its own accurate, translated copy rather than
// reusing that component's /benchmark-specific hardcoded text. Never
// renders any Supabase error message, code, or technical detail — those
// are logged server-side only (see coverage.ts).
export function CoverageTaxonomyLoadError() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
      <WifiOff size={22} className="mx-auto text-ink-400" aria-hidden="true" />
      <p className="mt-3 font-display text-base font-semibold text-ink-900">{t("coverageMap.taxonomyErrorTitle")}</p>
      <p className="mt-2 text-sm text-ink-600">{t("coverageMap.taxonomyErrorBody")}</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        {t("coverageMap.retryCta")}
      </button>
    </div>
  );
}
