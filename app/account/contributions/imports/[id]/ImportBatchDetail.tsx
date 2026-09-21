"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { computeImportBatchStatus, IMPORT_BATCH_STATUS_STYLE } from "@/lib/contribute/importBatchStatus";

// PHASE 25 — §17: a small, honest import-batch detail view. Never a
// complex administration screen — just what the spec asks for: source,
// file, platform, date, counts, and the campaigns this batch produced.

export interface ImportBatchDetailData {
  id: string;
  platformLabel: string | null;
  dataSource: string;
  sourceFilename: string | null;
  exportProfileLabelKey: string | null;
  rowCount: number;
  successCount: number;
  skippedCount: number;
  reviewCount: number;
  createdAt: string;
}

export interface ImportBatchCampaignRow {
  id: string;
  campaignName: string | null;
  startDate: string;
  endDate: string;
  objectiveLabel: string;
}

export function ImportBatchDetail({ batch, campaigns }: { batch: ImportBatchDetailData; campaigns: ImportBatchCampaignRow[] }) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  // PHASE 27 (§4): `campaigns` below is already a real query against
  // performance_datasets.import_batch_id — its length is ground truth,
  // preferred over batch.successCount (see ContributionsList.tsx's own
  // comment on why that stored counter can understate a real import).
  const displayCount = campaigns.length > 0 ? campaigns.length : batch.successCount;
  const status = computeImportBatchStatus({
    row_count: batch.rowCount,
    success_count: displayCount,
    skipped_count: batch.skippedCount,
    review_count: batch.reviewCount,
  });

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="mx-auto max-w-2xl px-4 py-8 md:px-8">
          <Link href="/account/contributions" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-600 hover:text-primary">
            <ArrowLeft size={13} aria-hidden="true" /> {t("contributions.detailBackToList")}
          </Link>

          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-xl font-semibold text-ink-900">
              {batch.platformLabel ?? t("contributions.unknownPlatform")}
            </h1>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${IMPORT_BATCH_STATUS_STYLE[status]}`}>
              {t(`contributions.batchStatus.${status}`)}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.sourceLabel")}</p>
            <p className="mt-1.5 text-sm text-ink-800">
              {t(`contributions.source.${batch.dataSource}`)}
              {batch.sourceFilename ? ` · ${batch.sourceFilename}` : batch.exportProfileLabelKey ? ` · ${t(batch.exportProfileLabelKey)}` : ""}
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.importDateLabel")}</p>
            <p className="mt-1.5 text-sm text-ink-800">{new Date(batch.createdAt).toLocaleDateString()}</p>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.importHistoryTitle")}</p>
            <div className="mt-1.5 flex flex-wrap gap-3 text-sm text-ink-800">
              <span>{t("contributions.importHistoryCampaignsImported", { n: displayCount })}</span>
              {batch.skippedCount > 0 && <span className="text-ink-500">{t("contribute.import.confirmSkippedDuplicates", { n: batch.skippedCount })}</span>}
              {batch.reviewCount > 0 && <span className="text-ink-500">{t("contribute.import.confirmSkipped", { n: batch.reviewCount })}</span>}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.detailContextTitle")}</p>
            {campaigns.length === 0 ? (
              <p className="mt-1.5 text-sm text-ink-500">{t("contributions.noMetricsImported")}</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {campaigns.map((c) => (
                  <Link
                    key={c.id}
                    href={`/account/contributions/${c.id}`}
                    className="block rounded-xl border border-line px-3 py-2 text-xs hover:border-primary/40"
                  >
                    <p className="font-medium text-ink-900">{c.campaignName ?? t("contributions.unnamedCampaign")}</p>
                    <p className="mt-0.5 text-ink-500">{c.objectiveLabel} · {c.startDate} — {c.endDate}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
