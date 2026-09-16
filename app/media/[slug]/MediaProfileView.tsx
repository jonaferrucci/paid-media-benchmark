"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, TrendingUp, Tag, BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { MediaProfile } from "@/lib/media/catalog";
import { AddMetricSnapshotForm, AddRateCardForm } from "./ContributionForms";
import { freshnessLabel } from "@/lib/media/trend";

function formatPrice(price: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("es-AR").format(price)}`;
}

function RateCardGroupCard({ group }: { group: MediaProfile["rateCardGroups"][number] }) {
  const { t } = useTranslation();
  const [historyOpen, setHistoryOpen] = useState(false);
  const { current, previous, change, history, isPendingOnly, pendingCount, format } = group;

  // Item 1: an outlet whose only submissions are pending never shows a
  // price as fact — a calm, honest "sin precio verificado" state
  // instead (Cucurucho Product UI.md "Empty states": explain what's
  // missing, never fabricate data to look populated).
  if (!current) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-canvas px-3 py-2.5">
        <p className="text-sm font-medium text-ink-800">{format?.display_label ?? "—"}</p>
        <p className="mt-0.5 text-xs text-ink-500">
          {isPendingOnly || pendingCount > 0 ? t("media.pendingOnlyPrice") : t("media.noVerifiedPrice")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-canvas px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink-800">{format?.display_label ?? "—"}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-400">{t("media.listPriceLabel")}</p>
        </div>
        <div className="text-right">
          <p className="tabular text-sm font-semibold text-ink-900">
            {formatPrice(current.price, current.currency)}
            <span className="ml-1 text-xs font-normal text-ink-500">/ {t(`media.pricingUnit.${current.pricingUnit}`)}</span>
          </p>
          {change !== null && previous !== null ? (
            <p className="tabular mt-0.5 text-xs text-ink-500">
              {change.absolute >= 0 ? "+" : ""}
              {formatPrice(change.absolute, current.currency)}
              {change.percent !== null && ` (${change.percent >= 0 ? "+" : ""}${change.percent.toFixed(1)}%)`}
              {" "}{t("media.vsPrevious")}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-400">{t("media.noPreviousCompatiblePrice")}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-400">
        <span>{t("media.validFrom")} {current.validFrom}</span>
        {current.validTo && <span>{t("media.validUntil")} {current.validTo}</span>}
        <span>{t("media.sourceLabel")}: {current.source}</span>
        <span>{t(`media.rateCardStatus.${current.status}`)}</span>
        {pendingCount > 0 && <span className="text-vanilla">{t("media.pendingReviewCount", { n: pendingCount })}</span>}
      </div>
      {history.length > 1 && (
        <>
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            {historyOpen ? t("media.hideHistory") : t("media.viewHistory", { n: history.length })}
            {historyOpen ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
          </button>
          {historyOpen && (
            <ul className="mt-1.5 space-y-1 border-t border-line pt-1.5">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-600">
                  <span className="tabular">{formatPrice(h.price, h.currency)}</span>
                  <span>{h.validFrom}{h.validTo ? ` – ${h.validTo}` : ""}</span>
                  <span className="text-ink-400">{t(`media.rateCardStatus.${h.status}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function formatValue(value: number, unitType: string): string {
  if (unitType === "rate") return `${value}`;
  return new Intl.NumberFormat("es-AR").format(value);
}

export function MediaProfileView({ profile }: { profile: MediaProfile }) {
  const { t, locale } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const { platform, category, countries, latestMetrics, rateCardGroups, metricDefinitions, formats } = profile;

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-56">
        <main className="mx-auto max-w-4xl px-4 py-6 md:px-8">
          <Link href="/platforms" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-primary">
            <ArrowLeft size={13} aria-hidden="true" /> {t("media.backToCatalog")}
          </Link>

          {/* Overview */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            <div className="h-1 bg-brandGradient" aria-hidden="true" />
            <div className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-semibold text-ink-900">{platform.display_label}</h1>
              {platform.status === "pending" && (
                <span className="rounded-full bg-vanilla-soft px-2 py-0.5 text-[10px] font-medium text-vanilla">{t("media.statusPending")}</span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-600">{category?.display_label ?? "—"}</p>
            {countries.length > 0 && (
              <p className="mt-1 text-xs text-ink-500">
                {countries.map((c) => c?.display_label).filter(Boolean).join(", ")}
              </p>
            )}
            {platform.is_global && <p className="mt-1 text-xs text-ink-500">{t("media.globalAvailability")}</p>}
            </div>
          </div>

          {/* Public metrics */}
          <section className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-brandLavender" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold text-ink-900">{t("media.publicMetricsTitle")}</h2>
            </div>
            <p className="mt-1 text-[11px] text-ink-400">{t("media.publicMetricsDisclaimer")}</p>
            {latestMetrics.length === 0 ? (
              <p className="mt-2 text-xs text-ink-500">{t("media.noPublicMetricsYet")}</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {latestMetrics.map((m) => (
                  <div key={m.definition!.id} className="rounded-xl border border-line bg-canvas p-3">
                    <p className="text-[11px] uppercase tracking-wide text-ink-500">{m.definition!.display_label}</p>
                    <p className="tabular mt-1 font-display text-lg font-semibold text-ink-900">{formatValue(m.latest.value, m.definition!.unit_type)}</p>
                    {m.change !== null && (
                      <p className="tabular mt-0.5 text-xs text-ink-500">
                        {m.change.absolute >= 0 ? "+" : ""}{formatValue(m.change.absolute, m.definition!.unit_type)}
                        {m.change.percent !== null && ` (${m.change.percent >= 0 ? "+" : ""}${m.change.percent.toFixed(1)}%)`}
                        {" "}{t("media.vsPrevious")}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-ink-400">{freshnessLabel(m.latest.observed_at, new Date(), locale)} · {m.latest.source}</p>
                    {m.eligibility === "trend" && (
                      <p className="mt-1 text-[10px] text-ink-400">{t("media.historyAvailable", { n: m.history.length })}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AddMetricSnapshotForm platformId={platform.id} metricDefinitions={metricDefinitions} />
              <Link href="/contribute/public-metrics" className="mt-2 text-xs font-medium text-primary hover:underline">
                {t("media.importMetricsCta")}
              </Link>
            </div>
          </section>
          <section className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Tag size={15} className="text-brandPeach" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold text-ink-900">{t("media.commercialTitle")}</h2>
            </div>
            <p className="mt-1 text-[11px] text-ink-400">{t("media.commercialDisclaimer")}</p>
            {rateCardGroups.length === 0 ? (
              <p className="mt-2 text-xs text-ink-500">{t("media.noRateCardsYet")}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {rateCardGroups.map((group) => (
                  <RateCardGroupCard key={`${group.identity.mediaFormatId}-${group.identity.propertyId ?? ""}-${group.identity.currency}-${group.identity.pricingUnit}`} group={group} />
                ))}
              </div>
            )}
            <AddRateCardForm platformId={platform.id} formats={formats} />
            <Link href="/contribute/rate-cards" className="mt-2 block text-xs font-medium text-primary hover:underline">
              {t("media.importRateCardsCta")}
            </Link>
          </section>

          {/* Benchmark availability */}
          <section className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <BarChart3 size={15} className="text-brandMint" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold text-ink-900">{t("media.benchmarkTitle")}</h2>
            </div>
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-dashed border-line bg-canvas p-3">
              <Info size={14} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
              <div>
                <p className="text-xs text-ink-700">{t("media.noBenchmarkYet")}</p>
                <Link href="/contribute" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                  {t("media.ctaContribute")}
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
