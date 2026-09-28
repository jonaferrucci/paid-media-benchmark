"use client";

// CUCURUCHO INTELLIGENCE 3 — Multi-Campaign Comparison matrix.
//
// Deliberately its OWN component, not a forced extension of
// MetricComparisonRow (app/benchmark/MetricComparisonRow.tsx) — that
// component's API and layout are shaped around exactly one user value
// per metric, and stretching it to 2-5 values per row would make its
// props/layout substantially more complex for every one of its
// existing single-campaign callers (CampaignExplorer.tsx,
// ContributionDetail.tsx). This file reuses that module's already-
// exported building blocks instead (STATUS_ICON, ACCENT_BORDER) plus
// lib/comparison/classify.ts's formatting/classification functions —
// never a second, independent classification or formatting
// implementation.
//
// No winner/best/worst/ranking/score anywhere in this file: each cell
// shows its own campaign's real value and, where comparable, its own
// classification against the market — never a comparison BETWEEN the
// selected campaigns themselves.

import Link from "next/link";
import { ArrowRight, Info, ShieldAlert } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { DERIVED_METRIC_LABELS, type DerivedMetricKey } from "@/lib/contribute/coverage";
import { formatMetricValue, resolveClassificationLabelKey, type PerformanceLabel, type ContextualPosition } from "@/lib/comparison/classify";
import { LABEL_STYLE, LABEL_ICON } from "@/app/benchmark/ComparisonDetail";
import { STATUS_ICON } from "@/app/benchmark/MetricComparisonRow";
import type { BenchmarkResponse } from "@/lib/benchmark/responseShape";

export interface ComparisonMatrixCampaign {
  id: string;
  campaignName: string | null;
  platformLabel: string;
  objectiveLabel: string;
  verticalLabel: string;
  countryLabel: string;
  currency: string;
  validationStatus: string;
  startDate: string;
  endDate: string;
  hasFullCohort: boolean;
}

interface MatrixCell {
  campaignId: string;
  value: number | null;
  currency: string;
  response?: BenchmarkResponse;
  classification: PerformanceLabel | ContextualPosition | null;
}

interface MarketContextEntry {
  cohortKey: string;
  platformLabel: string;
  objectiveLabel: string;
  verticalLabel: string;
  countryLabel: string;
  response: BenchmarkResponse;
}

export interface ComparisonMatrixRow {
  metric: string;
  unit: string;
  benchmarkDirection: "lower_is_better" | "higher_is_better" | "contextual";
  cells: MatrixCell[];
  currencyMixed: boolean;
  marketContexts: MarketContextEntry[];
  isReach: boolean;
  multipleCohorts: boolean;
}

// Same neutral pill treatment already used twice in this codebase
// (app/account/contributions/ContributionsList.tsx and
// [id]/ContributionDetail.tsx's own STATUS_STYLE) — kept as a third,
// local copy rather than refactoring those untouched files, per "avoid
// changes to files not justified by this feature."
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-vanilla-soft text-vanilla",
  valid: "bg-pistachio-soft text-pistachio",
  flagged: "bg-caution-soft text-caution",
  excluded: "bg-surface2 text-ink-400",
  deleted: "bg-surface2 text-ink-400",
  superseded: "bg-surface2 text-ink-400",
};

function MarketContextChip({
  ctx,
  t,
  showCohortLabel,
}: {
  ctx: MarketContextEntry;
  t: (key: string, vars?: Record<string, string | number>) => string;
  showCohortLabel: boolean;
}) {
  const { response } = ctx;
  if (response.status !== "success") {
    const StatusIcon = STATUS_ICON[response.status] ?? Info;
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
        <StatusIcon size={11} aria-hidden="true" />
        {t(`benchmarkLive.statusShort.${response.status}`)}
      </span>
    );
  }
  const { p25, median, p75 } = response.statistics;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full bg-surface2 px-2.5 py-1 text-[11px] text-ink-700">
      {showCohortLabel && (
        <span className="font-medium text-ink-800">
          {ctx.platformLabel} · {ctx.objectiveLabel} · {ctx.countryLabel}:
        </span>
      )}
      <span>
        {t("contributions.compare.marketMedian")} {formatMetricValue(median!, response.unit)}
      </span>
      <span className="text-ink-400">
        (P25 {formatMetricValue(p25!, response.unit)} — P75 {formatMetricValue(p75!, response.unit)}, n={response.sampleSize})
      </span>
    </span>
  );
}

function MetricRowBlock({
  row,
  campaigns,
  t,
}: {
  row: ComparisonMatrixRow;
  campaigns: ComparisonMatrixCampaign[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const label = DERIVED_METRIC_LABELS[row.metric as DerivedMetricKey] ?? row.metric.toUpperCase();

  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <p className="font-display text-sm font-semibold text-ink-900">{label}</p>

      {row.currencyMixed && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-caution">
          <ShieldAlert size={12} aria-hidden="true" />
          {t("contributions.compare.mixedCurrencyNote")}
        </p>
      )}

      <div className="mt-2 space-y-1.5">
        {campaigns.map((c) => {
          const cell = row.cells.find((cell) => cell.campaignId === c.id);
          if (!cell || cell.value === null) {
            return (
              <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-ink-600">{c.campaignName ?? t("contributions.unnamedCampaign")}</span>
                <span className="shrink-0 text-ink-400">{t("contributions.compare.metricUnavailable")}</span>
              </div>
            );
          }
          const ClassIcon = cell.classification !== null ? LABEL_ICON[cell.classification] : null;
          return (
            <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-ink-700">{c.campaignName ?? t("contributions.unnamedCampaign")}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="font-medium text-ink-900">
                  {formatMetricValue(cell.value, row.unit)}
                  {row.currencyMixed && <span className="ml-1 text-[10px] font-normal text-ink-400">{cell.currency}</span>}
                </span>
                {!row.currencyMixed && cell.classification !== null && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${LABEL_STYLE[cell.classification]}`}>
                    {ClassIcon && <ClassIcon size={10} aria-hidden="true" />}
                    {t(`benchmarkLive.labels.${resolveClassificationLabelKey(row.benchmarkDirection, cell.classification)}`)}
                  </span>
                )}
                {!row.currencyMixed && cell.classification === null && cell.response && cell.response.status !== "success" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-medium text-ink-600">
                    {t(`benchmarkLive.statusShort.${cell.response.status}`)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {!row.currencyMixed && row.marketContexts.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
          {row.marketContexts.map((ctx) => (
            <MarketContextChip key={ctx.cohortKey} ctx={ctx} t={t} showCohortLabel={row.multipleCohorts} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ComparisonMatrix({
  campaigns,
  rows,
  ungroupedCampaignIds,
}: {
  campaigns: ComparisonMatrixCampaign[];
  rows: ComparisonMatrixRow[];
  ungroupedCampaignIds: string[];
}) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => {}} />
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="mx-auto max-w-5xl px-4 py-8 md:px-8">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-xl font-semibold text-ink-900">{t("contributions.compare.title")}</h1>
            <Link href="/account/contributions" className="text-xs font-medium text-primary hover:underline">
              {t("contributions.compare.backToList")}
            </Link>
          </div>

          {ungroupedCampaignIds.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-surface2 px-3 py-2 text-xs text-ink-600">
              <Info size={12} aria-hidden="true" />
              {t("contributions.compare.someWithoutCohort")}
            </p>
          )}

          {/* Campaign identity/context header — direct link to each
              campaign's own detail page, plus its real status. No
              aggregate judgment here, just identity. */}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/account/contributions/${c.id}`}
                className="rounded-2xl border border-line bg-surface p-3 shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink-900">{c.campaignName ?? t("contributions.unnamedCampaign")}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[c.validationStatus] ?? ""}`}>
                    {t(`contributions.status.${c.validationStatus}`)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-600">
                  {c.platformLabel} · {c.objectiveLabel} · {c.countryLabel}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  {c.startDate} — {c.endDate} · {c.currency}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-primary">
                  {t("contributions.compare.viewCampaignCta")} <ArrowRight size={10} aria-hidden="true" />
                </p>
              </Link>
            ))}
          </div>

          {/* MOBILE (< md, includes 375px): stacked metric cards. Never
              a compressed N-column table — each metric gets its own
              card listing every selected campaign's value. */}
          <div className="mt-6 space-y-3 md:hidden">
            {rows.map((row) => (
              <MetricRowBlock key={row.metric} row={row} campaigns={campaigns} t={t} />
            ))}
          </div>

          {/* DESKTOP (md+): a real matrix — one row per metric, one
              column per campaign, plus a trailing market-context column.
              overflow-x-auto is scoped to this table's own wrapper, not
              the page — the page itself never scrolls horizontally. */}
          <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface2/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3">{t("contributions.compare.metricColumn")}</th>
                  {campaigns.map((c) => (
                    <th key={c.id} className="px-4 py-3">
                      <span className="block truncate normal-case text-ink-800">{c.campaignName ?? t("contributions.unnamedCampaign")}</span>
                    </th>
                  ))}
                  <th className="px-4 py-3">{t("contributions.compare.marketColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const label = DERIVED_METRIC_LABELS[row.metric as DerivedMetricKey] ?? row.metric.toUpperCase();
                  return (
                    <tr key={row.metric} className="border-b border-line last:border-b-0 align-top">
                      <td className="whitespace-nowrap px-4 py-3 font-display text-sm font-semibold text-ink-900">{label}</td>
                      {campaigns.map((c) => {
                        const cell = row.cells.find((cl) => cl.campaignId === c.id);
                        if (!cell || cell.value === null) {
                          return (
                            <td key={c.id} className="px-4 py-3 text-xs text-ink-400">
                              {t("contributions.compare.metricUnavailable")}
                            </td>
                          );
                        }
                        const ClassIcon = cell.classification !== null ? LABEL_ICON[cell.classification] : null;
                        return (
                          <td key={c.id} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-ink-900">{formatMetricValue(cell.value, row.unit)}</span>
                              {row.currencyMixed && <span className="text-[10px] text-ink-400">{cell.currency}</span>}
                              {!row.currencyMixed && cell.classification !== null && (
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${LABEL_STYLE[cell.classification]}`}>
                                  {ClassIcon && <ClassIcon size={10} aria-hidden="true" />}
                                  {t(`benchmarkLive.labels.${resolveClassificationLabelKey(row.benchmarkDirection, cell.classification)}`)}
                                </span>
                              )}
                              {!row.currencyMixed && cell.classification === null && cell.response && cell.response.status !== "success" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-medium text-ink-600">
                                  {t(`benchmarkLive.statusShort.${cell.response.status}`)}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3">
                        {row.currencyMixed ? (
                          <span className="flex items-center gap-1.5 text-[11px] font-medium text-caution">
                            <ShieldAlert size={12} aria-hidden="true" />
                            {t("contributions.compare.mixedCurrencyNote")}
                          </span>
                        ) : row.marketContexts.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {row.marketContexts.map((ctx) => (
                              <MarketContextChip key={ctx.cohortKey} ctx={ctx} t={t} showCohortLabel={row.multipleCohorts} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-ink-400">{t("contributions.compare.noMarketContext")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
