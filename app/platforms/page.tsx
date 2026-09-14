"use client";
import { PlaceholderPage } from "@/components/dashboard/PlaceholderPage";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export default function PlatformsPage() {
  const { t } = useTranslation();
  return (
    <PlaceholderPage
      title={t("stubPages.platformsTitle")}
      description={t("stubPages.platformsDesc")}
      plannedPhase={t("stubPages.phase6")}
    />
  );
}
