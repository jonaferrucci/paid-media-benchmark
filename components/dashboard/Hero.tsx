"use client";

import { useTranslation } from "@/lib/i18n/LanguageContext";

export function Hero() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-10 text-center sm:pt-14">
      <h1 className="font-display text-3xl font-semibold text-ink-900 sm:text-4xl">
        {t("hero.title")}
      </h1>
      <p className="mt-3 text-base text-ink-600">{t("hero.subtitle")}</p>
      <p className="mt-1.5 text-xs text-ink-400">{t("hero.supporting")}</p>
    </div>
  );
}
