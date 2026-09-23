"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { calculateDerivedMetrics, type RawMetricInputs } from "@/lib/metrics/derive";
import { DERIVED_METRIC_LABELS, type DerivedMetricKey } from "@/lib/contribute/coverage";
import { flagSuspectedDuplicates } from "@/lib/contribute/dataQuality";
import { EXPORT_PROFILE_LABEL_KEYS, type ExportProfileId } from "@/lib/import/platformExports";
import { computeImportBatchStatus, IMPORT_BATCH_STATUS_STYLE, tallyRealCampaignCountByBatch, resolveBatchDisplayCount } from "@/lib/contribute/importBatchStatus";

interface ContributionRow {
  id: string;
  start_date: string;
  end_date: string;
  validation_status: string;
  created_at: string;
  data_source: string;
  // PHASE 25 (§4): identity/provenance only — never a benchmark cohort
  // dimension, see migration 0018's own column comment.
  campaign_name: string | null;
  // PHASE 27 (§4): used only to tally each batch's REAL linked-campaign
  // count below — never rendered on the campaign card itself.
  import_batch_id: string | null;
  platforms: { internal_key: string; display_label: string } | null;
  objectives: { display_label: string; internal_key: string } | null;
  verticals: { display_label: string; internal_key: string } | null;
  countries: { display_label: string; iso_code: string } | null;
  campaign_types: { display_label: string } | null;
  dataset_metric_values: { raw_numeric_value: number; metrics: { internal_key: string } | null }[] | null;
}

// PHASE 25 (§7/§16): the real import_batches row — a compact "what did
// I import" history, replacing the guesswork Phase 26's
// groupRecentImports had to do before this table existed. That helper
// (lib/contribute/coverage.ts) is untouched, but is no longer used by
// the homepage workspace either — lib/contribute/workspaceActions.ts's
// "Recent imports" now also reads these same real batches.
interface ImportBatchRow {
  id: string;
  data_source: string;
  source_filename: string | null;
  export_profile: string | null;
  row_count: number;
  success_count: number;
  skipped_count: number;
  review_count: number;
  created_at: string;
  platforms: { display_label: string } | null;
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

export function ContributionsList({ datasets, batches = [] }: { datasets: ContributionRow[]; batches?: ImportBatchRow[] }) {
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

  // PHASE 28: success_count is now finalized for real (migration 0019
  // + app/contribute/bulk-actions.ts's error-checked update), so the
  // stored count is primary — this tally is only the defensive
  // fallback lib/contribute/importBatchStatus.ts's resolveBatchDisplayCount
  // uses for a legacy batch (created before this fix) or one whose
  // finalize somehow still failed. See that module for the centralized
  // logic — previously duplicated across this file, workspaceActions.ts,
  // and ImportBatchDetail.tsx (Phase 27 §17 follow-up).
  const realCampaignCountByBatch = tallyRealCampaignCountByBatch(datasets);

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

          {/* PHASE 25 (§7): compact import history — one line per real
              upload, never a giant table. Example: "Meta Ads / Hudson
              Campaign Report / 18 Sep 2026 / 3 campaigns imported."
              Hidden entirely for an account with no bulk imports yet
              (manual single-entry contributions never create a batch,
              per migration 0018's own comment). */}
          {batches.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.importHistoryTitle")}</h2>
              <div className="mt-2 space-y-1.5">
                {batches.map((b) => {
                  // PHASE 28: stored success_count is primary now that
                  // it's correctly finalized; the real tally is only a
                  // defensive fallback (see importBatchStatus.ts).
                  const displayCount = resolveBatchDisplayCount(b.success_count, realCampaignCountByBatch.get(b.id));
                  const status = computeImportBatchStatus({ ...b, success_count: displayCount });
                  const profileLabel = b.export_profile && EXPORT_PROFILE_LABEL_KEYS[b.export_profile as ExportProfileId]
                    ? t(EXPORT_PROFILE_LABEL_KEYS[b.export_profile as ExportProfileId])
                    : null;
                  return (
                    <Link
                      key={b.id}
                      href={`/account/contributions/imports/${b.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs transition-colors hover:border-primary/40"
                    >
                      <p className="text-ink-700">
                        {b.platforms?.display_label ?? t("contributions.unknownPlatform")}
                        {" · "}
                        {b.source_filename ?? profileLabel ?? t("contributions.unknownSource")}
                        {" · "}
                        {new Date(b.created_at).toLocaleDateString()}
                        {" · "}
                        {t("contributions.importHistoryCampaignsImported", { n: displayCount })}
                      </p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${IMPORT_BATCH_STATUS_STYLE[status]}`}>
                        {t(`contributions.batchStatus.${status}`)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {datasets.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
              <p className="text-sm text-ink-600">{t("contributions.empty")}</p>
            </div>
          ) : (
            <div className="mt-6 space-y-2">
              {datasets.map((d) => {
                const derivedMetrics = Object.keys(calculateDerivedMetrics(rawInputsFor(d))) as DerivedMetricKey[];
                return (
                  <Link
                    key={d.id}
                    href={`/account/contributions/${d.id}`}
                    className="block rounded-2xl border border-line bg-surface p-3.5 shadow-sm transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {/* PHASE 25 (§4/§14/§15): the real campaign name
                            leads the card when the source export
                            provided one; otherwise a plain, honest
                            "Unnamed campaign" label — never fabricated
                            from platform/objective, which are still
                            shown on the line right below regardless. */}
                        <p className="truncate text-sm font-medium text-ink-900">
                          {d.campaign_name ?? t("contributions.unnamedCampaign")}
                        </p>
                        {/* PHASE 35 (§5/§6): "Mis campañas" card — exactly
                            the fields the phase spec names (platform,
                            objective, country, period, status) plus the
                            comparable-metrics row below. Vertical,
                            campaign type, source and import date are real
                            and useful, but secondary/technical — moved
                            to the detail page's own context/details
                            sections rather than shown here, so this list
                            stays a fast scan instead of a metadata dump. */}
                        <p className="mt-0.5 text-xs text-ink-600">
                          {d.platforms?.display_label} · {d.objectives?.display_label} · {d.countries?.display_label}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-400">
                          {d.start_date} — {d.end_date}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[d.validation_status] ?? ""}`}>
                        {t(`contributions.status.${d.validation_status}`)}
                      </span>
                    </div>
                    {/* §10/§16: which benchmark-ready metrics this campaign
                        actually supports — the same formula-derived truth
                        as the home workspace's Data Coverage section. */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
                    {/* PHASE 35 (§5/§18): a plain, always-visible "next
                        action" affordance — the whole card is already the
                        link, this just makes that obvious on scan/mobile
                        instead of relying on an implicit hover cue. */}
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-primary">
                      {t("contributions.viewCampaignCta")} <ArrowRight size={11} aria-hidden="true" />
                    </p>
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
