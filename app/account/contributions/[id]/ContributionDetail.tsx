"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { RawMetricInputs } from "@/lib/metrics/derive";
import { DERIVED_METRIC_LABELS, type DerivedMetricKey } from "@/lib/contribute/coverage";
import { deleteContributionAction } from "../actions";

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
  // PHASE 25 (§4/§5/§15): identity/provenance additions — all nullable,
  // so this page renders exactly as before for any pre-Phase-25 or
  // manually-entered campaign that has none of them.
  campaignName: string | null;
  campaignTypeLabel: string | null;
  sourceFilename: string | null;
  exportProfileLabelKey: string | null;
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
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  // PHASE 25 (§16): a plain two-step confirm — never a browser
  // confirm() dialog, and never an irreversible action a single
  // misclick can trigger.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const importedEntries = (Object.keys(raw) as (keyof RawMetricInputs)[]).filter((k) => k !== "ad_spend" && raw[k] !== undefined);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(false);
    const res = await deleteContributionAction(dataset.id);
    setDeleting(false);
    if (res.ok) {
      router.push("/account/contributions");
    } else {
      setDeleteError(true);
      setConfirmingDelete(false);
    }
  }

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
            {/* PHASE 25 (§4/§15): the real campaign name leads the
                title when the source export provided one — falling
                back to the exact same platform/objective heading used
                before this phase for any campaign without one. */}
            <h1 className="font-display text-xl font-semibold text-ink-900">
              {dataset.campaignName ?? `${dataset.platformLabel} · ${dataset.objectiveLabel}`}
            </h1>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[dataset.validationStatus] ?? ""}`}>
              {t(`contributions.status.${dataset.validationStatus}`)}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.detailContextTitle")}</p>
            <p className="mt-1.5 text-sm text-ink-800">
              {dataset.platformLabel} · {dataset.objectiveLabel} · {dataset.verticalLabel} · {dataset.countryLabel}
              {dataset.campaignTypeLabel ? ` · ${dataset.campaignTypeLabel}` : ""}
            </p>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.detailPeriodTitle")}</p>
            <p className="mt-1.5 text-sm text-ink-800">{dataset.startDate} — {dataset.endDate} · {dataset.currency}</p>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.sourceLabel")}</p>
            <p className="mt-1.5 text-sm text-ink-800">
              {t(`contributions.source.${dataset.dataSource}`)} · {t("contributions.importedOn", { date: new Date(dataset.createdAt).toLocaleDateString() })}
              {/* PHASE 25 (§8/§15): human-usable provenance — the file
                  name as the user named it, and/or the recognized
                  export family — never a raw internal profile id. Only
                  ever present for a bulk import (see migration 0018's
                  own comment: a manual entry has no batch). */}
              {dataset.sourceFilename ? ` · ${dataset.sourceFilename}` : dataset.exportProfileLabelKey ? ` · ${t(dataset.exportProfileLabelKey)}` : ""}
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

          {/* PHASE 25 (§16): owner-safe delete, reusing the existing
              DB-level "owners delete own datasets" RLS policy — a
              plain two-step confirm, never a single-click irreversible
              action. */}
          <div className="mt-4 rounded-2xl border border-dashed border-line bg-surface2/30 p-4">
            {!confirmingDelete ? (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-caution hover:opacity-80"
              >
                <Trash2 size={13} aria-hidden="true" /> {t("contributions.deleteAction")}
              </button>
            ) : (
              <div>
                <p className="text-sm font-medium text-ink-900">{t("contributions.deleteConfirmTitle")}</p>
                <p className="mt-1 text-xs text-ink-600">{t("contributions.deleteConfirmBody")}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    aria-busy={deleting}
                    className="rounded-full bg-caution px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {t("contributions.deleteConfirmButton")}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface2"
                  >
                    {t("contributions.deleteCancelButton")}
                  </button>
                </div>
              </div>
            )}
            {deleteError && <p className="mt-2 text-xs text-caution">{t("contributions.deleteFailed")}</p>}
          </div>
        </main>
      </div>
    </div>
  );
}
