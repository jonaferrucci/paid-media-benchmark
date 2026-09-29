"use client";

import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { CohortQueryStatus } from "@/lib/benchmark/resultStatus";
import { COVERAGE_STATUS_STYLE } from "./statusStyle";

// CUCURUCHO INTELLIGENCE 4.1 — COVERAGE MAP UX POLISH (§2).
//
// A compact, visually secondary legend explaining the four EXISTING
// canonical statuses — no numbers, no ranking semantics, no fifth
// status. Reuses the exact same coverageMap.status.* translation keys
// and COVERAGE_STATUS_STYLE colors the matrix cells already use, so the
// legend can never drift from what a cell actually shows.
const LEGEND_ORDER: CohortQueryStatus[] = ["success", "insufficient_sample", "no_data", "methodology_block"];

export function CoverageStatusLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
      <span className="font-medium text-ink-600">{t("coverageMap.legendLabel")}</span>
      {LEGEND_ORDER.map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${COVERAGE_STATUS_STYLE[status]}`}>
            {t(`coverageMap.status.${status}`)}
          </span>
        </span>
      ))}
    </div>
  );
}
