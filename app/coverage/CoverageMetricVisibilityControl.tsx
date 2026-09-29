"use client";

import { useTranslation } from "@/lib/i18n/LanguageContext";

// CUCURUCHO INTELLIGENCE 4.1 — COVERAGE MAP UX POLISH (§1).
//
// Presentation-state ONLY: toggling a metric here changes which columns
// (desktop) / rows-per-card (mobile) are rendered from the SAME already-
// fetched CoverageGrid response — it never triggers a new database
// query (the server action already returns every metric in Coverage's
// canonical universe for the selected Platform+Objective+Country, see
// app/coverage/actions.ts). No new metric methodology, no per-objective
// compatibility invented here — see CoverageExplorer.tsx's own comment
// on why the default subset is a neutral choice, not an objective-
// derived one (no canonical objective<->metric compatibility mapping
// exists anywhere in this codebase; platform_metrics/
// media_category_metrics are keyed by platform/media category, not by
// objective).
export function CoverageMetricVisibilityControl({
  allMetrics,
  visibleMetrics,
  onToggle,
}: {
  allMetrics: string[];
  visibleMetrics: Set<string>;
  onToggle: (metric: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-ink-600">{t("coverageMap.metricsControlLabel")}</span>
      {allMetrics.map((metric) => {
        const active = visibleMetrics.has(metric);
        return (
          <button
            key={metric}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(metric)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase transition-colors ${
              active ? "border-primary bg-primary/10 text-primary" : "border-line bg-canvas text-ink-500 hover:border-primary hover:text-primary"
            }`}
          >
            {metric}
          </button>
        );
      })}
    </div>
  );
}
