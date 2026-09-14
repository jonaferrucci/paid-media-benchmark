"use client";

import { useMemo, useState } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { AudienceStrategy, CohortFilters, MetricKey } from "@/lib/types";
import { getVerticalAudienceMatrix, getVerticalRanking } from "@/lib/mock/benchmarks";
import { COMPARABLE_METRICS, METRIC_LABELS } from "@/lib/config/objectiveKpis";
import { METRIC_UNIT, METRIC_DIRECTION } from "@/lib/config/metrics";
import { formatMetricValue } from "@/lib/format";
import { AUDIENCE_STRATEGIES } from "@/lib/mock/taxonomies";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface VerticalAudienceMatrixProps {
  filters: CohortFilters;
  onSelectCohort: (verticalId: string, audienceStrategy: AudienceStrategy) => void;
}

const DEFAULT_ROW_COUNT = 10;

export function VerticalAudienceMatrix({ filters, onSelectCohort }: VerticalAudienceMatrixProps) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<MetricKey>("cpm");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const cells = getVerticalAudienceMatrix(filters, metric);
  const ranking = getVerticalRanking(filters);
  const unit = METRIC_UNIT[metric];
  const direction = METRIC_DIRECTION[metric];

  const cellLookup = useMemo(() => {
    const map = new Map<string, (typeof cells)[number]>();
    for (const cell of cells) {
      map.set(`${cell.verticalId}|${cell.audienceStrategy}`, cell);
    }
    return map;
  }, [cells]);

  const filteredByQuery = query
    ? ranking.filter((v) => v.label.toLowerCase().includes(query.toLowerCase()))
    : ranking;
  const rowsToShow = query ? filteredByQuery : showAll ? ranking : ranking.slice(0, DEFAULT_ROW_COUNT);

  const values = cells.filter((c) => c.value !== null).map((c) => c.value as number);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;

  function intensity(value: number) {
    if (max === min) return 0.15;
    const t2 = (value - min) / (max - min);
    const emphasised = direction === "lower_is_better" ? 1 - t2 : t2;
    return 0.12 + emphasised * 0.38;
  }

  const content = (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-sm font-semibold text-ink-900">{t("matrix.title")}</h3>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricKey)}
          className="rounded-full border border-line bg-canvas px-3 py-1 text-xs text-ink-700 outline-none focus-visible:border-primary"
        >
          {COMPARABLE_METRICS.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("matrix.searchPlaceholder")}
            className="w-full rounded-full border border-line bg-canvas py-1.5 pl-8 pr-3 text-xs text-ink-900 outline-none focus-visible:border-primary"
          />
        </div>
        {!query && (
          <button
            onClick={() => setShowAll((s) => !s)}
            className="whitespace-nowrap text-xs font-medium text-primary hover:underline"
          >
            {showAll ? t("matrix.showTop") : t("matrix.viewAll", { count: ranking.length })}
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="p-2 text-left font-medium text-ink-600">{t("finder.vertical")}</th>
              {AUDIENCE_STRATEGIES.map((a) => (
                <th key={a.id} className="p-2 text-center font-medium text-ink-600">
                  {t(`audiences.${a.id}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsToShow.map((vertical) => (
              <tr key={vertical.verticalId} className="border-t border-line">
                <td className="p-2 font-medium text-ink-900">
                  {vertical.label}
                  <span className="tabular ml-1.5 text-[10px] font-normal text-ink-400">
                    n={vertical.sampleSize}
                  </span>
                </td>
                {AUDIENCE_STRATEGIES.map((a) => {
                  const cell = cellLookup.get(`${vertical.verticalId}|${a.id}`);
                  if (!cell || cell.insufficientData || cell.value === null) {
                    return (
                      <td key={a.id} className="p-2 text-center">
                        <span className="text-ink-400">{t("matrix.insufficientData")}</span>
                      </td>
                    );
                  }
                  return (
                    <td key={a.id} className="p-1.5 text-center">
                      <button
                        onClick={() => onSelectCohort(vertical.verticalId, a.id)}
                        className="tabular w-full rounded-xl px-2 py-1.5 font-medium text-ink-900 transition-transform hover:scale-[1.03]"
                        style={{ backgroundColor: `rgba(124,92,255,${intensity(cell.value)})` }}
                        title={`n=${cell.sampleSize}`}
                      >
                        {formatMetricValue(cell.value, unit)}
                        <div className="mt-0.5 text-[10px] font-normal text-ink-600">
                          n={cell.sampleSize}
                        </div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rowsToShow.length === 0 && (
          <p className="p-4 text-center text-xs text-ink-400">
            {t("matrix.noMatches", { query })}
          </p>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-400">{t("matrix.footnote")}</p>
    </div>
  );

  return (
    <div>
      {/* Mobile: collapsed behind a disclosure per Phase 1.3 mobile UX requirement */}
      <div className="md:hidden">
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink-900"
        >
          {t("matrix.exploreToggle")}
          {mobileOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {mobileOpen && <div className="mt-3">{content}</div>}
      </div>
      <div className="hidden md:block">{content}</div>
    </div>
  );
}
