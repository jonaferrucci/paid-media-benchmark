"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { CohortQueryStatus } from "@/lib/benchmark/resultStatus";
import { COVERAGE_STATUS_STYLE } from "./statusStyle";

// CUCURUCHO INTELLIGENCE 4.1 — COVERAGE MAP UX POLISH (§4).
//
// The compact selected-cell panel — the "simplest accessible
// implementation" the spec explicitly allows, over a popover/side panel.
// Renders below the matrix once a cell is selected. Destination
// behavior is UNCHANGED from V1: AVAILABLE (success) still links to
// /benchmark via the exact existing prefill contract; LIMITED
// (insufficient_sample) / NONE (no_data) still link plainly to
// /contribute; METHODOLOGY_BLOCK still gets an explanation only, never
// an arbitrary contribution CTA. This logic used to live inline in
// every single cell (CoverageGrid.tsx's old CellAction) — it now
// renders ONCE, only for the one selected cell, which is the whole
// point of this polish pass (§3: "remove repeated cell CTA").
function buildBenchmarkHref(platform: string, objective: string, vertical: string, country: string, metric: string): string {
  const params = new URLSearchParams({
    prefillPlatform: platform,
    prefillObjective: objective,
    prefillVertical: vertical,
    prefillCountry: country,
    prefillMetric: metric,
    prefillTimeWindow: "last_12_months",
  });
  return `/benchmark?${params.toString()}`;
}

export interface SelectedCoverageCell {
  vertical: string; // internal_key
  verticalLabel: string;
  metric: string;
  status: CohortQueryStatus;
}

export function CoverageCellPanel({
  cell,
  platform,
  platformLabel,
  objective,
  objectiveLabel,
  country,
  countryLabel,
  onClose,
}: {
  cell: SelectedCoverageCell;
  platform: string;
  platformLabel: string;
  objective: string;
  objectiveLabel: string;
  country: string;
  countryLabel: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm" role="region" aria-label={`${cell.verticalLabel} · ${cell.metric.toUpperCase()}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-semibold text-ink-900">
            {cell.verticalLabel} · {cell.metric.toUpperCase()}
          </p>
          <span className={`mt-1.5 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${COVERAGE_STATUS_STYLE[cell.status]}`}>
            {t(`coverageMap.status.${cell.status}`)}
          </span>
          <p className="mt-1.5 text-xs text-ink-500">
            {platformLabel} · {objectiveLabel} · {countryLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("coverageMap.closeCellDetail")}
          className="rounded-full p-1 text-ink-400 hover:bg-surface2 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3">
        {cell.status === "success" && (
          <Link
            href={buildBenchmarkHref(platform, objective, cell.vertical, country, cell.metric)}
            className="inline-block rounded-full bg-primary px-4 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            {t("benchmarkLive.getBenchmark")}
          </Link>
        )}
        {cell.status === "methodology_block" && <p className="text-xs text-ink-500">{t("coverageMap.methodologyBlockHint")}</p>}
        {(cell.status === "insufficient_sample" || cell.status === "no_data") && (
          <Link
            href="/contribute"
            className="inline-block rounded-full border border-line bg-canvas px-4 py-2 text-xs font-medium text-ink-900 hover:border-primary hover:text-primary"
          >
            {t("nav.contributeData")}
          </Link>
        )}
      </div>
    </div>
  );
}
