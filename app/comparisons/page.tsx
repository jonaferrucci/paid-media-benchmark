"use client";
import { PlaceholderPage } from "@/components/dashboard/PlaceholderPage";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export default function ComparisonsPage() {
  const { t } = useTranslation();
  return (
    <PlaceholderPage
      title={t("stubPages.comparisonsTitle")}
      description={t("stubPages.comparisonsDesc")}
      plannedPhase={t("stubPages.phase7")}
    />
  );
}
