"use client";

import { useTranslation } from "@/lib/i18n/LanguageContext";
import { BrandArc, BrandFields } from "@/components/brand/BrandGeometry";

export function Hero() {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto max-w-2xl overflow-hidden px-4 pb-8 pt-10 text-center sm:pt-14">
      <BrandFields className="pointer-events-none absolute -top-16 left-1/2 h-64 w-[36rem] -translate-x-1/2" />
      <BrandArc className="pointer-events-none absolute -right-6 top-2 h-28 w-28 opacity-90 sm:h-36 sm:w-36" />
      <h1 className="relative font-display text-3xl font-semibold text-ink-900 sm:text-4xl">
        {t("hero.title")}
      </h1>
      <p className="relative mt-3 text-base text-ink-600">{t("hero.subtitle")}</p>
      <p className="relative mt-1.5 text-xs text-ink-400">{t("hero.supporting")}</p>
    </div>
  );
}
