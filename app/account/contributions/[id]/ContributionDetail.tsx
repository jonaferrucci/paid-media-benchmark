"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { RawMetricInputs } from "@/lib/metrics/derive";
import { DERIVED_METRIC_LABELS, type DerivedMetricKey } from "@/lib/contribute/coverage";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-vanilla-soft text-vanilla",
  valid: "bg-pistachio-soft text-pistachio",
  flagged: "bg-caution-soft text-caution",
  excluded: "bg-surface2 text-ink-400",
  deleted: "bg-surface2 text-ink-400",
};

// Reuses the exact same field-label keys app/contribute/ContributeLanding.tsx
// already defines for the review step — never a second, differently
// worded label set for the same canonical fields.
const RAW_FIELD_LABEL_KEYS: Partial<Record<keyof RawMetricInputs, string>> = {
  ad_spend: "contribute.field.adSpend",
  impressions: "contribute.field.impressions",
  reach: "contribute.field.reach",
  video_views: "contribute.field.videoViews",
  engagements: "contribute.field.engagements",
  conversions: "contribute.field.conversions",
  attributed_revenue: "contribute.field.attributedRevenue",
  total_revenue: "contribute.field.totalRevenue",
};

export interface BenchmarkReadinessEntry {
  metric: DerivedMetricKey;
  sufficientData: boolean;
  cohortSampleSize: number;
}

export interface ContributionDetailDataset {
  id: string;
  startDate: string;
  endDate: string;
  validationStatus: string;
  createdAt: string;
  dataSource: string;
  currency: string;
  platformLabel: string;
  objectiveLabel: string;
  verticalLabel: string;
  countryLabel: string;
}

export function ContributionDetail({
  dataset, raw, derivedKeys, readiness,
}: {
  dataset: ContributionDetailDataset;
  raw: RawMetricInputs;
  derivedKeys: DerivedMetricKey[];
  readiness: BenchmarkReadinessEntry[];
}) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);

  const importedEntries = (Object.keys(raw) as (keyof RawMetricInputs)[]).filter((k) => k !== "ad_spend" && raw[k] !== undefined);

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
              {dataset.platformLabel} · {dataset.objectiveLabel}
            </h1>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[dataset.validationStatus] ?? ""}`}>
              {t(`contributions.status.${dataset.validationStatus}`)}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.detailContextTitle")}</p>
            <p className="mt-1.5 text-sm text-ink-800">
              {dataset.platformLabel} · {dataset.objectiveLabel} · {dataset.verticalLabel} · {dataset.countryLabel}
            </p>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.detailPeriodTitle")}</p>
            <p className="mt-1.5 text-sm text-ink-800">{dataset.startDate} — {dataset.endDate} · {dataset.currency}</p>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.sourceLabel")}</p>
            <p className="mt-1.5 text-sm text-ink-800">
              {t(`contributions.source.${dataset.dataSource}`)} · {t("contributions.importedOn", { date: new Date(dataset.createdAt).toLocaleDateString() })}
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.metricsImportedTitle")}</p>
            {importedEntries.length === 0 ? (
              <p className="mt-1.5 text-sm text-ink-500">{t("contributions.noMetricsImported")}</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {raw.ad_spend !== undefined && (
                  <span className="rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-medium text-ink-700">
                    {t(RAW_FIELD_LABEL_KEYS.ad_spend!)}: {raw.ad_spend}
                  </span>
                )}
                {importedEntries.map((k) => (
                  <span key={k} className="rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-medium text-ink-700">
                    {t(RAW_FIELD_LABEL_KEYS[k]!)}: {raw[k]}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.metricsDerivedTitle")}</p>
            {derivedKeys.length === 0 ? (
              <p className="mt-1.5 text-sm text-ink-500">{t("contributions.noMetricsImported")}</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {derivedKeys.map((m) => (
                  <span key={m} className="rounded-full bg-pistachio-soft px-2.5 py-1 text-[11px] font-medium text-pistachio">
                    {DERIVED_METRIC_LABELS[m]}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* §6: own-data-ready vs. market-sample-insufficient — an
              explicit, never-conflated distinction. */}
          {derivedKeys.length > 0 && (
            <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.benchmarkReadinessTitle")}</p>
              {readiness.length === 0 ? (
                <p className="mt-1.5 text-sm text-ink-500">{t("contributions.benchmarkReadinessNone")}</p>
              ) : (
                <ul className="mt-1.5 space-y-1.5 text-sm text-ink-700">
                  {readiness.map((entry) => (
                    <li key={entry.metric}>
                      {entry.sufficientData
                        ? t("contributions.benchmarkReadinessAvailable", { metric: DERIVED_METRIC_LABELS[entry.metric] })
                        : (
                          // §6: the two DIFFERENT problems, both stated
                          // explicitly — never conflated into one vague
                          // "no data" message. This campaign's own data
                          // already supports the metric (it's in
                          // derivedKeys); what's missing is a large
                          // enough market cohort to compare against.
                          <>
                            {t("contributions.benchmarkReadinessOwnDataOk", { metric: DERIVED_METRIC_LABELS[entry.metric] })}{" "}
                            {t("contributions.benchmarkReadinessCohortInsufficient", { metric: DERIVED_METRIC_LABELS[entry.metric] })}
                          </>
                        )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
