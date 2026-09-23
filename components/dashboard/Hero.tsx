"use client";

import { Layers, Percent, Eye } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { BrandArc, BrandFields } from "@/components/brand/BrandGeometry";
import { useSupabaseUser } from "@/lib/supabase/useUser";

// PHASE 26 (§2): "Keep hero compact for returning users." No brand
// redesign — same title/subtitle/artwork for everyone, only the
// spacing/type-scale shrinks once a session is signed in, so a
// returning user reaches their workspace (rendered right below, see
// app/page.tsx) with less scroll. A first-time (signed-out) visitor
// keeps the exact original hero.
//
// PHASE 39 (§4/§16): copy simplified (see translations.ts's hero.*
// comment) and a compact, 3-point, non-numeric value-proposition row
// added below the subtitle — purely descriptive of how the product
// works (comparable cohorts, P25/Median/P75 ranges, visible sample/
// filters), never a claim, count, or metric that could be mistaken for
// real benchmark data. Only shown on the full (signed-out/first-visit)
// hero, same as subtitle — a returning user's compact hero is
// untouched.
const VALUE_PROPS = [
  { icon: Layers, titleKey: "hero.valueProp1Title", descKey: "hero.valueProp1Desc" },
  { icon: Percent, titleKey: "hero.valueProp2Title", descKey: "hero.valueProp2Desc" },
  { icon: Eye, titleKey: "hero.valueProp3Title", descKey: "hero.valueProp3Desc" },
] as const;

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
      {!compact && (
        <div className="relative mt-6 grid grid-cols-1 gap-2.5 text-left sm:grid-cols-3">
          {VALUE_PROPS.map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey} className="flex items-start gap-2 rounded-xl border border-line/60 bg-surface/60 p-3">
              <Icon size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink-900">{t(titleKey)}</p>
                <p className="text-[11px] text-ink-500">{t(descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
