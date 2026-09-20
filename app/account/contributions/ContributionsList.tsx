"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { calculateDerivedMetrics, type RawMetricInputs } from "@/lib/metrics/derive";
import { DERIVED_METRIC_LABELS, type DerivedMetricKey } from "@/lib/contribute/coverage";
import { flagSuspectedDuplicates } from "@/lib/contribute/dataQuality";

interface ContributionRow {
  id: string;
  start_date: string;
  end_date: string;
  validation_status: string;
  created_at: string;
  data_source: string;
  platforms: { internal_key: string; display_label: string } | null;
  objectives: { display_label: string; internal_key: string } | null;
  verticals: { display_label: string; internal_key: string } | null;
  countries: { display_label: string; iso_code: string } | null;
  dataset_metric_values: { raw_numeric_value: number; metrics: { internal_key: string } | null }[] | null;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-vanilla-soft text-vanilla",
  valid: "bg-pistachio-soft text-pistachio",
  flagged: "bg-caution-soft text-caution",
  excluded: "bg-surface2 text-ink-400",
  deleted: "bg-surface2 text-ink-400",
};

const RAW_METRIC_KEYS = new Set<keyof RawMetricInputs>([
  "ad_spend", "impressions", "reach", "clicks", "video_views", "engagements", "conversions", "attributed_revenue", "total_revenue",
]);

function rawInputsFor(row: ContributionRow): RawMetricInputs {
  const raw: RawMetricInputs = {};
  for (const value of row.dataset_metric_values ?? []) {
    const key = value.metrics?.internal_key;
    if (key && RAW_METRIC_KEYS.has(key as keyof RawMetricInputs)) {
      (raw as Record<string, number>)[key] = value.raw_numeric_value;
    }
  }
  return raw;
}

export function ContributionsList({ datasets }: { datasets: ContributionRow[] }) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);

  // PHASE 26 (§17): internal-only diagnostic — a small, honest "revisar"
  // note, never a user-facing score. Computed client-side over the same
  // rows already fetched (no extra query).
  const suspectedDuplicateIds = flagSuspectedDuplicates(
    datasets.map((d) => ({
      id: d.id,
      platformKey: d.platforms?.internal_key ?? null,
      objectiveKey: d.objectives?.internal_key ?? null,
      verticalKey: d.verticals?.internal_key ?? null,
      countryKey: d.countries?.iso_code ?? null,
      startDate: d.start_date,
      endDate: d.end_date,
      adSpend: rawInputsFor(d).ad_spend ?? null,
      raw: rawInputsFor(d),
    }))
  );

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
              {datasets.map((d) => {
                const derivedMetrics = Object.keys(calculateDerivedMetrics(rawInputsFor(d))) as DerivedMetricKey[];
                return (
                  <Link
                    key={d.id}
                    href={`/account/contributions/${d.id}`}
                    className="block rounded-2xl border border-line bg-surface p-4 shadow-sm transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-900">
                          {d.platforms?.display_label} · {d.objectives?.display_label}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-600">
                          {d.verticals?.display_label} · {d.countries?.display_label}
                        </p>
                        <p className="mt-1 text-xs text-ink-400">
                          {d.start_date} — {d.end_date}
                        </p>
                        {/* §10: source + import date — real, already-stored
                            fields that were fetched but never shown before. */}
                        <p className="mt-1 text-[11px] text-ink-400">
                          {t("contributions.sourceLabel")}: {t(`contributions.source.${d.data_source}`)} ·{" "}
                          {t("contributions.importedOn", { date: new Date(d.created_at).toLocaleDateString() })}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[d.validation_status] ?? ""}`}>
                        {t(`contributions.status.${d.validation_status}`)}
                      </span>
                    </div>
                    {/* §10/§16: which benchmark-ready metrics this campaign
                        actually supports — the same formula-derived truth
                        as the home workspace's Data Coverage section. */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {derivedMetrics.length === 0 ? (
                        <span className="text-[11px] text-ink-400">{t("contributions.noMetricsImported")}</span>
                      ) : (
                        derivedMetrics.map((m) => (
                          <span key={m} className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-medium text-ink-600">
                            {DERIVED_METRIC_LABELS[m]}
                          </span>
                        ))
                      )}
                      {suspectedDuplicateIds.has(d.id) && (
                        <span className="ml-auto flex items-center gap-1 text-[11px] text-caution" title={t("contributions.qualityDuplicateNote")}>
                          <AlertTriangle size={11} aria-hidden="true" /> {t("contributions.qualityDuplicateNote")}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
