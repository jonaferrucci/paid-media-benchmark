"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { RawMetricInputs } from "@/lib/metrics/derive";
import { DERIVED_METRIC_LABELS, type DerivedMetricKey } from "@/lib/contribute/coverage";
// PHASE 35 (§8): the one existing, canonical value formatter — never a
// second one written for this new "Resultados comparables" section.
import { formatMetricValue } from "@/lib/comparison/classify";
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
  // PHASE 35 (§8): the real unit_type this same engine call already
  // read — carried through so this component never needs its own
  // per-metric unit guess.
  unit: string;
}

// PHASE 32 (§2/§3/§4): the campaign → benchmark activation. `context`
// mirrors exactly the cohort fields the campaign itself already has
// (never invented) and reuses the Phase 30 Home->/benchmark prefill
// param naming; `compareOptions` is the campaign's own real,
// already-eligible metrics (see page.tsx — never a fabricated one) with
// the value Cucurucho already knows, so the user never re-types it.
export interface BenchmarkCompareOption {
  metric: DerivedMetricKey | "reach";
  userValue: number;
  unit: string;
  spendBand?: string;
  durationBand?: string;
}

export interface BenchmarkActivation {
  context: {
    platform: string | null;
    objective: string | null;
    vertical: string | null;
    country: string | null;
    audienceStrategy: string | null;
    funnelStage: string | null;
    businessModel: string | null;
  };
  compareOptions: BenchmarkCompareOption[];
}

const METRIC_LABELS_WITH_REACH: Record<DerivedMetricKey | "reach", string> = {
  ...DERIVED_METRIC_LABELS,
  reach: "Reach",
};

// Builds the exact same /benchmark?prefill... URL shape the Home
// discovery flow and the import-done screen already use (Phase 26/28/
// 30) — one single mechanism, extended here rather than duplicated.
// spendBand/durationBand are only ever attached alongside the Reach
// metric itself (the one metric that requires them) — never applied as
// a silent extra filter on any other metric's comparison.
function buildBenchmarkHref(context: BenchmarkActivation["context"], option?: BenchmarkCompareOption): string {
  const params = new URLSearchParams();
  if (context.platform) params.set("prefillPlatform", context.platform);
  if (context.objective) params.set("prefillObjective", context.objective);
  if (context.vertical) params.set("prefillVertical", context.vertical);
  if (context.country) params.set("prefillCountry", context.country);
  if (context.audienceStrategy) params.set("prefillAudienceStrategy", context.audienceStrategy);
  if (context.funnelStage) params.set("prefillFunnelStage", context.funnelStage);
  if (context.businessModel) params.set("prefillBusinessModel", context.businessModel);
  if (option) {
    params.set("prefillMetric", option.metric);
    params.set("prefillUserValue", String(option.userValue));
    if (option.spendBand) params.set("prefillSpendBand", option.spendBand);
    if (option.durationBand) params.set("prefillDurationBand", option.durationBand);
  }
  const qs = params.toString();
  return qs ? `/benchmark?${qs}` : "/benchmark";
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
  dataset, raw, derivedKeys, readiness, benchmarkActivation,
}: {
  dataset: ContributionDetailDataset;
  raw: RawMetricInputs;
  derivedKeys: DerivedMetricKey[];
  readiness: BenchmarkReadinessEntry[];
  benchmarkActivation: BenchmarkActivation;
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
  // PHASE 35 (§7): the secondary "Detalles de la campaña" disclosure —
  // closed by default so technical/import metadata never competes with
  // identity/status/comparable-results for attention, reusing the same
  // button+aria-expanded+chevron pattern app/benchmark/CampaignExplorer.tsx's
  // MetricRow already uses, never a new UI dependency.
  const [detailsOpen, setDetailsOpen] = useState(false);

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
                title when the source export provided one; otherwise a
                plain, honest "Unnamed campaign" label — never
                fabricated from platform/objective, which the Context
                block right below already always shows. */}
            <h1 className="font-display text-xl font-semibold text-ink-900">
              {dataset.campaignName ?? t("contributions.unnamedCampaign")}
            </h1>
          </div>
          {/* PHASE 28 (§7/§15): "the campaign was imported" and "this
              campaign is approved for benchmark aggregation" are
              different facts — a single status pill conflated them
              before this phase (Phase 27's "Importada" wording). This
              row always shows the import succeeded (this page only
              ever renders for a row that exists, i.e. was persisted)
              plus a separately-labeled benchmark-eligibility pill, so
              neither one is ever read as standing in for the other. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-ink-500">
              <Check size={12} className="text-pistachio" aria-hidden="true" /> {t("contributions.importCompleted")}
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[dataset.validationStatus] ?? ""}`}>
              {t("contributions.benchmarkStatusLabel")}: {t(`contributions.status.${dataset.validationStatus}`)}
            </span>
          </div>

          {/* PHASE 32/35 (C — Comparable metrics / primary action):
              "Resultados comparables" is the dominant next action ONLY
              for a validation_status === "valid" campaign — a pending
              or excluded one gets an honest explanation instead, plus a
              plainly-secondary, non-committal link to the general
              benchmark finder that never implies this campaign is
              already part of the aggregate. Never rendered for
              flagged/deleted (out of this phase's scope; the existing
              status pill above already covers those). */}
          {dataset.validationStatus === "valid" && (
            <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.comparableResultsTitle")}</p>
              {benchmarkActivation.compareOptions.length === 0 ? (
                // PHASE 35: a valid campaign whose own metrics simply
                // aren't comparable against the market right now (e.g.
                // insufficient cohort for every one of them) previously
                // fell through to a generic, misleadingly-primary
                // "Comparar con benchmark" button with nothing behind
                // it. Now it gets the same honest, already-existing
                // "nothing ready yet" copy the readiness section below
                // uses, plus the same secondary explore link pending/
                // excluded campaigns get — never a fake primary CTA.
                <>
                  <p className="mt-1.5 text-sm text-ink-500">{t("contributions.benchmarkReadinessNone")}</p>
                  <a
                    href={buildBenchmarkHref(benchmarkActivation.context)}
                    className="mt-2 inline-block text-xs font-medium text-ink-500 hover:text-primary hover:underline"
                  >
                    {t("contributions.exploreBenchmarkCta")}
                  </a>
                </>
              ) : (
                // §8: one row per comparable metric — real label, real
                // already-computed value (formatMetricValue + the
                // engine's own real unit_type, never a second
                // formatter or a hardcoded unit guess), and the same
                // per-metric Comparar action the old chip row linked to.
                <div className="mt-2 divide-y divide-line">
                  {benchmarkActivation.compareOptions.map((option) => (
                    <div key={option.metric} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink-900">{METRIC_LABELS_WITH_REACH[option.metric]}</p>
                        <p className="tabular text-sm text-ink-700">{formatMetricValue(option.userValue, option.unit)}</p>
                      </div>
                      <a
                        href={buildBenchmarkHref(benchmarkActivation.context, option)}
                        className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                      >
                        {t("contributions.compareBenchmarkCta")}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {(dataset.validationStatus === "pending" || dataset.validationStatus === "excluded") && (
            <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
              <p className="text-sm text-ink-700">
                {dataset.validationStatus === "pending"
                  ? t("contributions.pendingBenchmarkExplanation")
                  : t("contributions.excludedBenchmarkExplanation")}
              </p>
              <a
                href={buildBenchmarkHref(benchmarkActivation.context)}
                className="mt-2 inline-block text-xs font-medium text-ink-500 hover:text-primary hover:underline"
              >
                {t("contributions.exploreBenchmarkCta")}
              </a>
            </div>
          )}

          {/* D — Context: always visible, compact. Kept separate from
              the collapsible technical details below (§7) — this is
              the campaign's real identity, not import metadata. */}
          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.detailContextTitle")}</p>
            <p className="mt-1.5 text-sm text-ink-800">
              {dataset.platformLabel} · {dataset.objectiveLabel} · {dataset.verticalLabel} · {dataset.countryLabel}
              {dataset.campaignTypeLabel ? ` · ${dataset.campaignTypeLabel}` : ""}
            </p>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.detailPeriodTitle")}</p>
            <p className="mt-1.5 text-sm text-ink-800">{dataset.startDate} — {dataset.endDate} · {dataset.currency}</p>
          </div>

          {/* E — Technical details: source/import provenance, raw
              imported values, every calculated metric (not just the
              comparable ones above), and the readiness explanation —
              real, previously always-visible sections, now grouped
              under one collapsible, closed-by-default disclosure so
              they never compete with identity/status/comparable
              results for attention (§7). Keyboard-accessible: a real
              <button> with aria-expanded, same pattern already used by
              app/benchmark/CampaignExplorer.tsx's MetricRow (§19). */}
          <div className="mt-4 rounded-2xl border border-line bg-surface">
            <button
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.detailsSectionTitle")}</span>
              {detailsOpen ? <ChevronUp size={16} className="text-ink-400" aria-hidden="true" /> : <ChevronDown size={16} className="text-ink-400" aria-hidden="true" />}
            </button>
            {detailsOpen && (
              <div className="border-t border-line p-4 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.sourceLabel")}</p>
                <p className="mt-1.5 text-sm text-ink-800">
                  {t(`contributions.source.${dataset.dataSource}`)} · {t("contributions.importedOn", { date: new Date(dataset.createdAt).toLocaleDateString() })}
                  {/* PHASE 25 (§8/§15): human-usable provenance — the file
                      name as the user named it, and/or the recognized
                      export family — never a raw internal profile id. Only
                      ever present for a bulk import (see migration 0018's
                      own comment: a manual entry has no batch). */}
                  {dataset.sourceFilename ? ` · ${dataset.sourceFilename}` : dataset.exportProfileLabelKey ? ` · ${t(dataset.exportProfileLabelKey)}` : ""}
                </p>

                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.metricsImportedTitle")}</p>
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

                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.metricsDerivedTitle")}</p>
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

                {/* §6: own-data-ready vs. market-sample-insufficient — an
                    explicit, never-conflated distinction. */}
                {derivedKeys.length > 0 && (
                  <>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contributions.benchmarkReadinessTitle")}</p>
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
                  </>
                )}
              </div>
            )}
          </div>

          {/* F — PHASE 25 (§16): owner-safe delete, reusing the existing
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
