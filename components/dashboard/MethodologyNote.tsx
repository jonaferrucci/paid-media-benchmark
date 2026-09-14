"use client";

import { useTranslation } from "@/lib/i18n/LanguageContext";

export function MethodologyNote() {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-line bg-surface2 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
        {t("methodology.title")}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{t("methodology.body")}</p>
    </section>
  );
}
