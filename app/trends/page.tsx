"use client";
import { PlaceholderPage } from "@/components/dashboard/PlaceholderPage";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export default function TrendsPage() {
  const { t } = useTranslation();
  return (
    <PlaceholderPage
      title={t("stubPages.trendsTitle")}
      description={t("stubPages.trendsDesc")}
      plannedPhase={t("stubPages.phase6")}
    />
  );
}
