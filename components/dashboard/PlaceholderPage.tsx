"use client";

import { useState } from "react";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface PlaceholderPageProps {
  title: string;
  description: string;
  plannedPhase: string;
}

export function PlaceholderPage({ title, description, plannedPhase }: PlaceholderPageProps) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}

      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="px-4 py-6 md:px-8">
          <h1 className="font-display text-xl font-semibold text-ink-900">{title}</h1>
          <p className="mt-1 text-sm text-ink-600">{description}</p>
          <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
            <p className="text-sm text-ink-600">{t("placeholder.notice")}</p>
            <p className="mt-1 text-xs text-ink-400">
              {t("placeholder.planned")}: {plannedPhase}
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
