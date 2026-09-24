"use client";

// HISTORICAL BENCHMARKS ARCHITECTURE.
//
// Scoped strictly to ENTRY/QUERY-adjacent presentation of the new
// getHistoricalBenchmark engine call — the live "current" result above
// this section (ResultView/ComparisonDetail) is completely untouched.
//
// Lazy by design (§11): the historical query only runs once the user
// actually opens this disclosure, via the exact same <details onToggle>
// pattern already established for "Refinar comparación"
// (app/benchmark/BenchmarkExplorer.tsx) — a plain "Ver benchmark" never
// pays for N extra period queries nobody asked to see.
//
// No chart library: a small inline SVG, matching this project's
// existing zero-dependency convention (ComparisonDetail's percentile
// track is plain CSS; there is no chart library anywhere else in this
// codebase — see package.json). The chart is purely decorative
// (aria-hidden) — the real, accessible content is the textual period
// list below it, per Cucurucho Data Visualization guidance ("the
// information cannot depend only on the graph") and this feature's own
// §14.
//
// Reuses, never reimplements: formatMetricValue/formatPercentDiff
// (lib/comparison/classify.ts), trendEligibility/computeChange
// (lib/media/trend.ts — the exact same "how many real points justify a
// trend claim" and "period-over-period change" primitives already used
// for media intelligence), and formatHistoricalPeriodLabel
// (lib/benchmark/historicalLabels.ts).

import { useState } from "react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { formatMetricValue } from "@/lib/comparison/classify";
import { computeChange, trendEligibility } from "@/lib/media/trend";
import { formatHistoricalPeriodLabel } from "@/lib/benchmark/historicalLabels";
import { runHistoricalBenchmarkQuery, type HistoricalBenchmarkResponse, type HistoricalPeriodResponse } from "./historicalActions";
import type { BenchmarkFormInput } from "./actions";

const CHART_WIDTH = 300;
const CHART_HEIGHT = 96;
const CHART_PADDING_Y = 12;

function periodDetailKey(status: HistoricalPeriodResponse["status"]): string {
  switch (status) {
    case "insufficient_sample":
      return "benchmarkLive.historicalInsufficientDetail";
    case "no_data":
      return "benchmarkLive.historicalNoDataDetail";
    case "methodology_block":
      return "benchmarkLive.historicalMethodologyBlockDetail";
    case "error":
      return "benchmarkLive.historicalErrorDetail";
    default:
      return "";
  }
}

export function HistoricalBenchmarkSection({ input }: { input: BenchmarkFormInput }) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<HistoricalBenchmarkResponse | null>(null);

  async function handleToggle(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen && !loaded && !loading) {
      setLoading(true);
      const result = await runHistoricalBenchmarkQuery(input);
      setData(result);
      setLoading(false);
      setLoaded(true);
    }
  }

  function handleRetry() {
    setLoaded(false);
    setData(null);
    void handleToggle(true);
  }

  const periods = data?.periods ?? [];
  const successPeriods = periods.filter((p) => p.status === "success" && p.median !== null);
  const eligibility = trendEligibility(successPeriods.length);

  // Y scale from the success periods' own P25/P75 range (never from
  // periods with no real value) — padded slightly so the line/whiskers
  // never touch the chart's edge.
  let yMin = 0;
  let yMax = 1;
  if (successPeriods.length > 0) {
    const lows = successPeriods.map((p) => p.p25 ?? p.median!);
    const highs = successPeriods.map((p) => p.p75 ?? p.median!);
    yMin = Math.min(...lows);
    yMax = Math.max(...highs);
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
  }
  const usableHeight = CHART_HEIGHT - CHART_PADDING_Y * 2;
  function toY(value: number): number {
    const ratio = (value - yMin) / (yMax - yMin);
    return CHART_HEIGHT - CHART_PADDING_Y - ratio * usableHeight;
  }
  function toX(index: number): number {
    if (periods.length <= 1) return CHART_WIDTH / 2;
    return (index / (periods.length - 1)) * CHART_WIDTH;
  }

  // One <polyline> per run of CONSECUTIVE success periods — a gap
  // (insufficient/no_data/methodology_block/error) breaks the line
  // rather than being silently bridged. No interpolation, ever.
  const lineSegments: string[] = [];
  let currentSegment: string[] = [];
  periods.forEach((p, i) => {
    if (p.status === "success" && p.median !== null) {
      currentSegment.push(`${toX(i)},${toY(p.median)}`);
    } else if (currentSegment.length > 0) {
      lineSegments.push(currentSegment.join(" "));
      currentSegment = [];
    }
  });
  if (currentSegment.length > 0) lineSegments.push(currentSegment.join(" "));

  // Descriptive median delta (§9) — only between the two chronologically
  // CONSECUTIVE periods MOST RECENT in time that are BOTH comparable
  // (status "success"). computeChange is the exact same period-over-
  // period primitive already used for media intelligence snapshots
  // (lib/media/trend.ts) — never a new formula, and never framed as
  // "mejoró"/"empeoró".
  //
  // FINAL REGRESSION HARDENING FIX: this used to only ever look at the
  // literal last two array slots (periods[length-1]/[length-2]) and give
  // up entirely — showing NO delta — the instant either of those two
  // wasn't "success", even when an earlier adjacent success/success pair
  // existed. Example: Q1 success, Q2 no_data, Q3 success — the old code
  // correctly refused to compare Q2->Q3 (Q2 isn't success), but it also
  // never considered Q1 at all. Per §7's own example that's the right
  // call there (Q1/Q2 aren't a success/success pair either), but with a
  // 4th period — Q1 success, Q2 success, Q3 no_data, Q4 no_data — the
  // old code stopped at Q4 (not success) and showed no delta, even
  // though Q1->Q2 is a real, chronologically adjacent, fully comparable
  // pair. Now it scans backward from the most recent period for the
  // LATEST adjacent pair that is success/success — since
  // generateHistoricalPeriods always produces gapless, chronologically
  // contiguous boundaries (verified in scripts/test-historical-
  // benchmarks.mts), adjacent array indices are exactly "chronologically
  // consecutive periods", so this never bridges over a real calendar gap
  // — it only ever widens which adjacent PAIR (not which non-adjacent
  // periods) is eligible.
  let delta: { percent: number | null; increased: boolean } | null = null;
  for (let i = periods.length - 1; i >= 1; i--) {
    const current = periods[i];
    const previous = periods[i - 1];
    if (current.status === "success" && previous.status === "success" && current.median !== null && previous.median !== null) {
      const change = computeChange(previous.median, current.median);
      delta = { percent: change.percent, increased: change.absolute >= 0 };
      break;
    }
  }

  return (
    <details
      className="mt-6 border-t border-line pt-5"
      open={open}
      onToggle={(e) => handleToggle((e.target as HTMLDetailsElement).open)}
    >
      <summary aria-expanded={open} className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-500 hover:text-primary">
        {t("benchmarkLive.historicalTitle")}
      </summary>

      <div className="mt-3">
        {loading && <p className="text-xs text-ink-500">{t("benchmarkLive.historicalLoading")}</p>}

        {!loading && data?.status === "error" && (
          <div className="rounded-xl border border-caution/30 bg-caution-soft p-3 text-center">
            <p className="text-xs text-ink-700">{t("benchmarkLive.historicalError")}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-900 hover:border-primary hover:text-primary"
            >
              {t("benchmarkLive.retryCta")}
            </button>
          </div>
        )}

        {!loading && data && data.status === "success" && (
          <>
            <p className="text-[11px] text-ink-500">{t("benchmarkLive.historicalSubtitle", { n: periods.length })}</p>

            {eligibility === "trend" && lineSegments.length > 0 && (
              <div className="mt-2">
                <svg
                  aria-hidden="true"
                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  preserveAspectRatio="none"
                  className="h-24 w-full"
                >
                  {periods.map((p, i) =>
                    p.status !== "success" ? (
                      <line
                        key={`gap-${p.periodKey}`}
                        x1={toX(i)}
                        x2={toX(i)}
                        y1={CHART_HEIGHT - 6}
                        y2={CHART_HEIGHT - 2}
                        className="stroke-ink-300"
                        strokeWidth={2}
                        strokeLinecap="round"
                      />
                    ) : null
                  )}
                  {lineSegments.map((points, i) => (
                    <polyline key={i} points={points} fill="none" className="stroke-primary" strokeWidth={2} />
                  ))}
                  {periods.map((p, i) =>
                    p.status === "success" && p.median !== null ? (
                      <g key={p.periodKey}>
                        {p.p25 !== null && p.p75 !== null && (
                          <line
                            x1={toX(i)}
                            x2={toX(i)}
                            y1={toY(p.p75)}
                            y2={toY(p.p25)}
                            className="stroke-primary/30"
                            strokeWidth={3}
                          />
                        )}
                        <circle cx={toX(i)} cy={toY(p.median)} r={3} className="fill-primary" />
                      </g>
                    ) : null
                  )}
                </svg>
                <p className="sr-only">{t("benchmarkLive.historicalChartSrHint")}</p>
              </div>
            )}

            {eligibility !== "trend" && (
              <p className="mt-2 text-xs text-ink-500">{t("benchmarkLive.historicalNotEnoughPeriods")}</p>
            )}

            {delta && delta.percent !== null && (
              <p className="mt-2 text-xs text-ink-700">
                {/* Same "replace('.', ',')" decimal convention already
                    used by ComparisonDetail's absDiff — one consistent
                    number format across this page, not a new one.
                    Magnitude only: "aumentó"/"disminuyó" already carries
                    the direction, so the number itself is never signed
                    here (never "+7.8%" alongside "aumentó"). */}
                {t(delta.increased ? "benchmarkLive.historicalDeltaUp" : "benchmarkLive.historicalDeltaDown", {
                  percent: Math.abs(delta.percent).toFixed(1).replace(".", ","),
                })}
              </p>
            )}

            {/* Textual fallback (§14) — the REAL accessible content,
                never dependent on the chart above rendering or being
                perceived: every period, its real state, and its real
                numbers when it has any. */}
            <ul className="mt-3 space-y-1.5">
              {periods.map((p) => (
                <li key={p.periodKey} className="flex items-baseline justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
                  <span className="font-medium text-ink-900">{formatHistoricalPeriodLabel(p.periodKey, locale)}</span>
                  {p.status === "success" && p.median !== null ? (
                    <span className="text-right text-ink-700">
                      {t("benchmarkLive.medianShort")} {formatMetricValue(p.median, data.unit)}
                      {p.p25 !== null && p.p75 !== null && (
                        <span className="text-ink-500">
                          {" "}
                          (P25 {formatMetricValue(p.p25, data.unit)} · P75 {formatMetricValue(p.p75, data.unit)})
                        </span>
                      )}
                      <span className="text-ink-400"> · n={p.metricSampleSize}</span>
                    </span>
                  ) : (
                    <span className="text-right text-ink-400">{t(periodDetailKey(p.status), { n: p.cohortSampleSize })}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
