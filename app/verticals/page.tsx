"use client";
import { PlaceholderPage } from "@/components/dashboard/PlaceholderPage";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export default function VerticalsPage() {
  const { t } = useTranslation();
  return (
    <PlaceholderPage
      title={t("stubPages.verticalsTitle")}
      description={t("stubPages.verticalsDesc")}
      plannedPhase={t("stubPages.phase6")}
    />
  );
}
