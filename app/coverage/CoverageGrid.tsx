"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { CohortQueryStatus } from "@/lib/benchmark/resultStatus";
import type { CoverageTaxonomyOption } from "@/lib/benchmark/coverage";

// CUCURUCHO INTELLIGENCE 4 — COVERAGE MAP V1.
//
// Pure presentation: renders the CoverageGrid lib/benchmark/coverage.ts
// returns as a desktop table (rows = Verticals, columns = Metrics) and,
// separately, as mobile stacked cards (one per Vertical). Cells render a
// STATUS CHIP ONLY — never a numeric value, sample count, or dataset/
// campaign/owner identity, per the locked spec's privacy lock. The
// horizontal scroll (when the metric-column count makes the table wider
// than the viewport) is contained to the table's own wrapper only — the
// page itself never scrolls horizontally.
export interface CoverageCellData {
  vertical: string;
  metric: string;
  status: CohortQueryStatus;
}

const STATUS_STYLE: Record<CohortQueryStatus, string> = {
  success: "bg-pistachio-soft text-pistachio",
  insufficient_sample: "bg-vanilla-soft text-vanilla",
  no_data: "border border-dashed border-line bg-surface text-ink-400",
  methodology_block: "bg-caution-soft text-caution",
};

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

function StatusChip({ status }: { status: CohortQueryStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[status]}`}>
      {t(`coverageMap.status.${status}`)}
    </span>
  );
}

function CellAction({
  status,
  platform,
  objective,
  vertical,
  country,
  metric,
}: {
  status: CohortQueryStatus;
  platform: string;
  objective: string;
  vertical: string;
  country: string;
  metric: string;
}) {
  const { t } = useTranslation();

  if (status === "success") {
    return (
      <Link
        href={buildBenchmarkHref(platform, objective, vertical, country, metric)}
        className="mt-1 inline-block text-[11px] font-medium text-primary hover:underline"
      >
        {t("benchmarkLive.getBenchmark")}
      </Link>
    );
  }

  if (status === "methodology_block") {
    return <p className="mt-1 text-[11px] text-ink-400">{t("coverageMap.methodologyBlockHint")}</p>;
  }

  // insufficient_sample and no_data both point to the same next action:
  // contribute more data — never a per-status different destination.
  return (
    <Link href="/contribute" className="mt-1 inline-block text-[11px] font-medium text-primary hover:underline">
      {t("nav.contributeData")}
    </Link>
  );
}

export function CoverageGrid({
  verticals,
  metrics,
  cells,
  platform,
  objective,
  country,
}: {
  verticals: CoverageTaxonomyOption[];
  metrics: string[];
  cells: CoverageCellData[];
  platform: string;
  objective: string;
  country: string;
}) {
  const { t } = useTranslation();

  const cellByKey = new Map<string, CohortQueryStatus>();
  for (const cell of cells) cellByKey.set(`${cell.vertical}::${cell.metric}`, cell.status);

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
              {metrics.map((metric) => (
                <th key={metric} className="px-3 py-2.5 text-xs font-medium uppercase text-ink-600">
                  {metric}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {verticals.map((vertical) => (
              <tr key={vertical.value} className="border-b border-line last:border-b-0">
                <td className="sticky left-0 z-10 bg-canvas px-3 py-2.5 text-sm font-medium text-ink-900">{vertical.label}</td>
                {metrics.map((metric) => {
                  const status = cellByKey.get(`${vertical.value}::${metric}`);
                  if (!status) return <td key={metric} className="px-3 py-2.5" />;
                  return (
                    <td key={metric} className="px-3 py-2.5 align-top">
                      <StatusChip status={status} />
                      <CellAction
                        status={status}
                        platform={platform}
                        objective={objective}
                        country={country}
                        vertical={vertical.value}
                        metric={metric}
                      />
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
            <p className="font-display text-sm font-semibold text-ink-900">{vertical.label}</p>
            <div className="mt-2 space-y-2">
              {metrics.map((metric) => {
                const status = cellByKey.get(`${vertical.value}::${metric}`);
                if (!status) return null;
                return (
                  <div key={metric} className="flex items-center justify-between gap-2 border-t border-line pt-2 first:border-t-0 first:pt-0">
                    <span className="text-xs font-medium uppercase text-ink-600">{metric}</span>
                    <div className="text-right">
                      <StatusChip status={status} />
                      <CellAction
                        status={status}
                        platform={platform}
                        objective={objective}
                        country={country}
                        vertical={vertical.value}
                        metric={metric}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
