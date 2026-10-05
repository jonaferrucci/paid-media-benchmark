"use client";

import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { CohortQueryStatus } from "@/lib/benchmark/resultStatus";
import type { CoverageTaxonomyOption } from "@/lib/benchmark/coverage";
import { COVERAGE_STATUS_STYLE } from "./statusStyle";
import { translateTaxonomyLabel } from "@/lib/i18n/taxonomyLabels";

// CUCURUCHO INTELLIGENCE 4 — COVERAGE MAP V1 (CUCURUCHO INTELLIGENCE 4.1
// — COVERAGE MAP UX POLISH updated this file's cell rendering; see the
// §3/§4 comments below).
//
// Pure presentation: renders the CoverageGrid lib/benchmark/coverage.ts
// returns as a desktop table (rows = Verticals, columns = Metrics) and,
// separately, as mobile stacked cards (one per Vertical). Cells render a
// STATUS CHIP ONLY — never a numeric value, sample count, or dataset/
// campaign/owner identity, per the locked spec's privacy lock. The
// horizontal scroll (when the metric-column count makes the table wider
// than the viewport) is contained to the table's own wrapper only — the
// page itself never scrolls horizontally.
//
// INTELLIGENCE 4.1 (§3/§4): cells no longer render a persistent CTA —
// that text used to repeat under every single cell, which is exactly
// the "administrative grid" noise the polish pass exists to remove. A
// cell now communicates status only (metric is already the column
// header on desktop, or the row label on mobile) and becomes an
// interactive control: clicking/activating it selects that cell, and
// the caller (CoverageExplorer.tsx) renders the one contextual action
// panel for whichever cell is currently selected. This component knows
// nothing about /benchmark or /contribute destinations any more — that
// now lives once, in CoverageCellPanel.tsx.
export interface CoverageCellData {
  vertical: string;
  metric: string;
  status: CohortQueryStatus;
}

export interface SelectedCoverageCellKey {
  vertical: string;
  metric: string;
}

function StatusChip({ status }: { status: CohortQueryStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${COVERAGE_STATUS_STYLE[status]}`}>
      {t(`coverageMap.status.${status}`)}
    </span>
  );
}

function isSameCell(a: SelectedCoverageCellKey | null, vertical: string, metric: string): boolean {
  return !!a && a.vertical === vertical && a.metric === metric;
}

export function CoverageGrid({
  verticals,
  visibleMetrics,
  cells,
  selectedCell,
  onSelectCell,
}: {
  verticals: CoverageTaxonomyOption[];
  visibleMetrics: string[];
  cells: CoverageCellData[];
  selectedCell: SelectedCoverageCellKey | null;
  onSelectCell: (cell: CoverageCellData | null) => void;
}) {
  const { t, locale } = useTranslation();

  // AUTHENTICATED JOURNEY + CONTRIBUTION ONBOARDING POLISH (§5): verticals
  // here carry the same {value: internal_key, label: raw display_label}
  // shape as everywhere else in Coverage — this is a second, previously
  // unflagged render path for the same leak CoverageExplorer.tsx's own
  // labelFor() fixes for the cell-detail panel.
  function verticalLabel(v: CoverageTaxonomyOption): string {
    return translateTaxonomyLabel("vertical", v.value, v.label, locale);
  }

  const cellByKey = new Map<string, CohortQueryStatus>();
  for (const cell of cells) cellByKey.set(`${cell.vertical}::${cell.metric}`, cell.status);

  function handleActivate(vertical: string, metric: string, status: CohortQueryStatus) {
    onSelectCell(isSameCell(selectedCell, vertical, metric) ? null : { vertical, metric, status });
  }

  return (
    <div>
      {/* Desktop: real table, horizontal scroll contained to this wrapper only. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-line md:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="sticky left-0 z-10 bg-surface px-3 py-2.5 text-xs font-medium text-ink-600">
                {t("coverageMap.verticalColumnHeader")}
              </th>
              {visibleMetrics.map((metric) => (
                <th key={metric} className="px-3 py-2.5 text-xs font-medium uppercase text-ink-600">
                  {metric}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {verticals.map((vertical) => (
              <tr key={vertical.value} className="border-b border-line last:border-b-0">
                <td className="sticky left-0 z-10 bg-canvas px-3 py-2.5 text-sm font-medium text-ink-900">{verticalLabel(vertical)}</td>
                {visibleMetrics.map((metric) => {
                  const status = cellByKey.get(`${vertical.value}::${metric}`);
                  if (!status) return <td key={metric} className="px-3 py-2.5" />;
                  const selected = isSameCell(selectedCell, vertical.value, metric);
                  return (
                    <td key={metric} className="p-0 align-middle">
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => handleActivate(vertical.value, metric, status)}
                        className={`flex w-full items-center justify-center px-3 py-2.5 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${
                          selected ? "bg-primary/10" : "hover:bg-surface2"
                        }`}
                      >
                        <StatusChip status={status} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards, one per Vertical — never a compressed
          version of the desktop table. */}
      <div className="space-y-3 md:hidden">
        {verticals.map((vertical) => (
          <div key={vertical.value} className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
            <p className="font-display text-sm font-semibold text-ink-900">{verticalLabel(vertical)}</p>
            <div className="mt-2 space-y-2">
              {visibleMetrics.map((metric) => {
                const status = cellByKey.get(`${vertical.value}::${metric}`);
                if (!status) return null;
                const selected = isSameCell(selectedCell, vertical.value, metric);
                return (
                  <button
                    key={metric}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleActivate(vertical.value, metric, status)}
                    className={`flex w-full items-center justify-between gap-2 border-t border-line pt-2 text-left first:border-t-0 first:pt-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                      selected ? "bg-primary/5" : ""
                    }`}
                  >
                    <span className="text-xs font-medium uppercase text-ink-600">{metric}</span>
                    <StatusChip status={status} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
