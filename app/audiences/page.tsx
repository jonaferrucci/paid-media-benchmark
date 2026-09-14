"use client";
import { PlaceholderPage } from "@/components/dashboard/PlaceholderPage";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export default function AudiencesPage() {
  const { t } = useTranslation();
  return (
    <PlaceholderPage
      title={t("stubPages.audiencesTitle")}
      description={t("stubPages.audiencesDesc")}
      plannedPhase={t("stubPages.phase6")}
    />
  );
}
