"use client";

import { useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface ContributionRow {
  id: string;
  start_date: string;
  end_date: string;
  validation_status: string;
  created_at: string;
  platforms: { display_label: string } | null;
  objectives: { display_label: string } | null;
  verticals: { display_label: string } | null;
  countries: { display_label: string } | null;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-vanilla-soft text-vanilla",
  valid: "bg-pistachio-soft text-pistachio",
  flagged: "bg-caution-soft text-caution",
  excluded: "bg-surface2 text-ink-400",
  deleted: "bg-surface2 text-ink-400",
};

export function ContributionsList({ datasets }: { datasets: ContributionRow[] }) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="mx-auto max-w-2xl px-4 py-8 md:px-8">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-xl font-semibold text-ink-900">
              {t("auth.myContributions")}
            </h1>
            <Link
              href="/contribute"
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {t("nav.contributeData")}
            </Link>
          </div>

          {datasets.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
              <p className="text-sm text-ink-600">{t("contributions.empty")}</p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {datasets.map((d) => (
                <div key={d.id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-ink-900">
                        {d.platforms?.display_label} · {d.objectives?.display_label}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-600">
                        {d.verticals?.display_label} · {d.countries?.display_label}
                      </p>
                      <p className="mt-1 text-xs text-ink-400">
                        {d.start_date} — {d.end_date}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[d.validation_status] ?? ""}`}
                    >
                      {t(`contributions.status.${d.validation_status}`)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
