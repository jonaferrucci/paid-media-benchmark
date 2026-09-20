"use client";

import { useTranslation } from "@/lib/i18n/LanguageContext";
import { BrandArc, BrandFields } from "@/components/brand/BrandGeometry";
import { useSupabaseUser } from "@/lib/supabase/useUser";

// PHASE 26 (§2): "Keep hero compact for returning users." No brand
// redesign — same title/subtitle/artwork for everyone, only the
// spacing/type-scale shrinks once a session is signed in, so a
// returning user reaches their workspace (rendered right below, see
// app/page.tsx) with less scroll. A first-time (signed-out) visitor
// keeps the exact original hero.
export function Hero() {
  const { t } = useTranslation();
  const { user } = useSupabaseUser();
  const compact = !!user;
  return (
    <div className={`relative mx-auto max-w-2xl overflow-hidden px-4 text-center ${compact ? "pb-4 pt-6" : "pb-8 pt-10 sm:pt-14"}`}>
      <BrandFields className="pointer-events-none absolute -top-16 left-1/2 h-64 w-[36rem] -translate-x-1/2" />
      <BrandArc className="pointer-events-none absolute -right-6 top-2 h-28 w-28 opacity-90 sm:h-36 sm:w-36" />
      <h1 className={`relative font-display font-semibold text-ink-900 ${compact ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"}`}>
        {t("hero.title")}
      </h1>
      {!compact && <p className="relative mt-3 text-base text-ink-600">{t("hero.subtitle")}</p>}
      {!compact && <p className="relative mt-1.5 text-xs text-ink-400">{t("hero.supporting")}</p>}
    </div>
  );
}
