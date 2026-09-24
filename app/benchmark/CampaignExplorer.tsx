"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { ContributionTaxonomies } from "@/lib/contribute/taxonomies";
import { runBenchmarkQueryBatch, type BenchmarkFormInput } from "./actions";
import { Select } from "./Select";
import { classifyPerformance, resolveClassificationLabelKey } from "@/lib/comparison/classify";
import { computeCampaignAggregate } from "@/lib/comparison/campaign";
import { DiagnosticSection } from "./DiagnosticSection";
import { SaveComparisonButton } from "@/app/comparisons/SaveComparisonButton";
import type { SavedComparison } from "@/app/comparisons/actions";
import type { RelaxableDimension } from "@/lib/benchmark/cohortRules";
import { SINGLE_METRIC_OPTIONS } from "@/lib/benchmark/singleMetricOptions";
// CUCURUCHO INTELLIGENCE 2 (§14): CampaignRow/STATUS_ICON/ACCENT_BORDER
// and the CampaignResultRow type now live in MetricComparisonRow.tsx —
// pure extraction, zero behavior change — so Campaign Explorer's real-
// campaign market comparison (ContributionDetail.tsx) can reuse the
// exact same row instead of a second, independently-maintained copy.
import { MetricComparisonRow, type CampaignResultRow } from "./MetricComparisonRow";

// PHASE 34 (§4 Metric Registry audit): this used to be its own,
// separately-maintained list (Phase 7) — a real, demonstrated drift
// from lib/benchmark/singleMetricOptions.ts's list (this file already
// had cpa/roas before the single-metric dropdown did; it was still
// missing cpe/acos/tacos after Phase 34 audited and approved them).
// Unified onto that one shared source of truth rather than reconciling
// two independently-maintained arrays by hand every time either
// changes. CVR (Conversion Rate) remains excluded for the same
// original reason: its denominator ("Relevant Traffic") isn't defined
// as a single approved raw metric — see lib/metrics/derive.ts — and
// CPL remains excluded per that shared file's own documented reason
// (no canonical lead_count semantic distinct from conversions).
const CAMPAIGN_METRICS: readonly string[] = SINGLE_METRIC_OPTIONS;

interface CohortDraft {
  platform: string;
  objective: string;
  vertical: string;
  country: string;
  audienceStrategy: string;
  funnelStage: string;
  businessModel: string;
  spendBand: string;
  durationBand: string;
  timeWindow: string;
}

const DEFAULT_COHORT: CohortDraft = {
  platform: "",
  objective: "",
  vertical: "",
  country: "",
  audienceStrategy: "",
  funnelStage: "",
  businessModel: "",
  spendBand: "",
  durationBand: "",
  timeWindow: "last_12_months",
};

interface MetricRow {
  metric: string;
  value: string;
}

export function CampaignExplorer({ taxonomies, initialSaved }: { taxonomies: ContributionTaxonomies; initialSaved?: SavedComparison | null }) {
  const { t } = useTranslation();
  const [cohort, setCohort] = useState<CohortDraft>(DEFAULT_COHORT);
  const [rows, setRows] = useState<MetricRow[]>([{ metric: "cpm", value: "" }]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CampaignResultRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Phase 14 reopen flow: BenchmarkExplorer already fetched the saved
  // comparison and switched mode to "campaign" — this just restores
  // this component's own local state from it and re-runs the current
  // engine (never trusts any persisted result value as truth).
  useEffect(() => {
    if (!initialSaved || initialSaved.comparisonType !== "campaign") return;
    const restoredCohort: CohortDraft = {
      platform: initialSaved.platform,
      objective: initialSaved.objective,
      vertical: initialSaved.vertical,
      country: initialSaved.country,
      audienceStrategy: initialSaved.audienceStrategy ?? "",
      funnelStage: initialSaved.funnelStage ?? "",
      businessModel: initialSaved.businessModel ?? "",
      spendBand: initialSaved.spendBand ?? "",
      durationBand: initialSaved.durationBand ?? "",
      timeWindow: initialSaved.timeWindow ?? DEFAULT_COHORT.timeWindow,
    };
    const restoredRows: MetricRow[] = initialSaved.campaignRows?.length
      ? initialSaved.campaignRows.map((r) => ({ metric: r.metric, value: r.value }))
      : [{ metric: "cpm", value: "" }];
    setCohort(restoredCohort);
    setRows(restoredRows);
    handleCompare(restoredCohort, restoredRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSaved]);

  function updateCohort<K extends keyof CohortDraft>(key: K, value: CohortDraft[K]) {
    setCohort((c) => ({ ...c, [key]: value }));
    setResults(null);
  }

  function updateRow(index: number, patch: Partial<MetricRow>) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const unused = CAMPAIGN_METRICS.find((m) => !rows.some((r) => r.metric === m)) ?? CAMPAIGN_METRICS[0];
    setRows((r) => [...r, { metric: unused, value: "" }]);
  }

  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index));
  }

  const canSubmit =
    cohort.platform && cohort.objective && cohort.vertical && cohort.country &&
    rows.length > 0 &&
    rows.every((r) => {
      const n = Number(r.value);
      // Input validation (Phase 7 item 13): reject NaN/Infinity/empty;
      // zero is a valid value for metrics where it's mathematically
      // sensible (e.g. a CPA of 0 conversions cost isn't meaningful,
      // but we don't second-guess the user's raw entry here — the
      // engine/classification layer already treats each value on its
      // own terms).
      return r.value.trim() !== "" && Number.isFinite(n);
    });

  async function handleCompare(overrideCohort?: CohortDraft, overrideRows?: MetricRow[]) {
    const effectiveCohort = overrideCohort ?? cohort;
    const effectiveRows = overrideRows ?? rows;
    const effectiveCanSubmit =
      effectiveCohort.platform && effectiveCohort.objective && effectiveCohort.vertical && effectiveCohort.country &&
      effectiveRows.length > 0 &&
      effectiveRows.every((r) => {
        const n = Number(r.value);
        return r.value.trim() !== "" && Number.isFinite(n);
      });
    if (!effectiveCanSubmit) return;
    setLoading(true);
    setExpanded(null);

    const baseInput: BenchmarkFormInput = {
      metric: effectiveRows[0].metric,
      platform: effectiveCohort.platform,
      objective: effectiveCohort.objective,
      vertical: effectiveCohort.vertical,
      country: effectiveCohort.country,
      audienceStrategy: effectiveCohort.audienceStrategy || null,
      funnelStage: effectiveCohort.funnelStage || null,
      businessModel: effectiveCohort.businessModel || null,
      spendBand: effectiveCohort.spendBand || null,
      durationBand: effectiveCohort.durationBand || null,
      timeWindow: effectiveCohort.timeWindow,
      relaxedDimensions: [] as RelaxableDimension[],
    };

    // Reuses the existing multi-metric batch path (Phase 5/6) — each
    // metric still gets its own independent engine call, its own
    // sample size, its own sufficiency check. No parallel comparison
    // logic, no combined/pooled datasets, per Phase 7 item 2/5.
    const responses = await runBenchmarkQueryBatch(baseInput, effectiveRows.map((r) => r.metric));

    const rowResults: CampaignResultRow[] = responses.map((response, i) => {
      const userValue = Number(effectiveRows[i].value);
      const { p25, median, p75 } = response.statistics;
      const classification =
        response.status === "success" && p25 !== null && median !== null && p75 !== null
          ? classifyPerformance(userValue, { p25, median, p75 }, response.benchmarkDirection)
          : null;
      return { metric: response.metric, status: response.status, classification, response, userValue };
    });

    setResults(rowResults);
    setLoading(false);
  }

  const aggregate = results ? computeCampaignAggregate(results) : null;

  const platformLabel = taxonomies.platforms.find((p) => p.internal_key === cohort.platform)?.display_label ?? cohort.platform;
  const objectiveLabel = taxonomies.objectives.find((o) => o.internal_key === cohort.objective)?.display_label ?? cohort.objective;
  const verticalLabel = taxonomies.verticals.find((v) => v.internal_key === cohort.vertical)?.display_label ?? cohort.vertical;
  const countryLabel = taxonomies.countries.find((c) => c.iso_code === cohort.country)?.display_label ?? cohort.country;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select label={t("contribute.platform")} value={cohort.platform} onChange={(v) => updateCohort("platform", v)} allowEmpty required
            options={taxonomies.platforms.map((p) => ({ value: p.internal_key, label: p.display_label }))} />
          <Select label={t("contribute.objective")} value={cohort.objective} onChange={(v) => updateCohort("objective", v)} allowEmpty required
            options={taxonomies.objectives.map((o) => ({ value: o.internal_key, label: o.display_label }))} />
          <Select label={t("contribute.vertical")} value={cohort.vertical} onChange={(v) => updateCohort("vertical", v)} allowEmpty required
            options={taxonomies.verticals.map((v) => ({ value: v.internal_key, label: v.display_label }))} />
          <Select label={t("contribute.country")} value={cohort.country} onChange={(v) => updateCohort("country", v)} allowEmpty required
            options={taxonomies.countries.map((c) => ({ value: c.iso_code, label: c.display_label }))} />
          <Select label={t("contribute.audienceStrategy")} value={cohort.audienceStrategy} onChange={(v) => updateCohort("audienceStrategy", v)} allowEmpty
            options={taxonomies.audienceStrategies.map((a) => ({ value: a.internal_key, label: a.display_label }))} />
          <Select label={t("contribute.funnelStage")} value={cohort.funnelStage} onChange={(v) => updateCohort("funnelStage", v)} allowEmpty
            options={taxonomies.funnelStages.map((f) => ({ value: f.internal_key, label: f.display_label }))} />
          <Select label={t("contribute.businessModel")} value={cohort.businessModel} onChange={(v) => updateCohort("businessModel", v)} allowEmpty
            options={taxonomies.businessModels.map((b) => ({ value: b.internal_key, label: b.display_label }))} />
          <Select label={t("finder.spendRange")} value={cohort.spendBand} onChange={(v) => updateCohort("spendBand", v)} allowEmpty
            options={[
              { value: "under_500", label: "< USD 500" }, { value: "500_2000", label: "USD 500-2,000" },
              { value: "2000_10000", label: "USD 2,000-10,000" }, { value: "10000_50000", label: "USD 10,000-50,000" },
              { value: "50000_100000", label: "USD 50,000-100,000" }, { value: "100000_plus", label: "USD 100,000+" },
            ]} />
          <Select label={t("finder.duration")} value={cohort.durationBand} onChange={(v) => updateCohort("durationBand", v)} allowEmpty
            options={[
              { value: "1_7", label: "1-7" }, { value: "8_14", label: "8-14" }, { value: "15_30", label: "15-30" },
              { value: "31_60", label: "31-60" }, { value: "61_90", label: "61-90" }, { value: "91_180", label: "91-180" },
              { value: "181_365", label: "181-365" }, { value: "365_plus", label: "365+" },
            ]} />
        </div>

        <div className="mt-5 space-y-2">
          <p className="text-xs font-medium text-ink-600">{t("benchmarkLive.campaignMetrics")}</p>
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <div className="w-28 shrink-0 sm:w-32">
                <Select label="" value={row.metric} onChange={(v) => updateRow(i, { metric: v })}
                  options={CAMPAIGN_METRICS.map((m) => ({ value: m, label: m.toUpperCase() }))} />
              </div>
              <input
                type="number"
                step="0.01"
                value={row.value}
                onChange={(e) => updateRow(i, { value: e.target.value })}
                placeholder={t("benchmarkLive.yourResultPlaceholder")}
                className="min-w-[120px] flex-1 rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
              />
              {rows.length > 1 && (
                <button onClick={() => removeRow(i)} className="rounded-full p-2 text-ink-400 hover:text-caution" aria-label={t("benchmarkLive.removeMetric")}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          <button onClick={addRow} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Plus size={14} aria-hidden="true" /> {t("benchmarkLive.addMetric")}
          </button>
        </div>

        <button
          onClick={() => handleCompare()}
          disabled={!canSubmit || loading}
          aria-busy={loading}
          className="mt-5 w-full rounded-full bg-brandGradient py-2.5 text-sm font-semibold text-[#23232B] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#23232B]/30 border-t-[#23232B]" aria-hidden="true" />
              {t("benchmarkLive.loading")}
            </span>
          ) : (
            t("benchmarkLive.compareCampaignButton")
          )}
        </button>
      </section>

      {results && aggregate && (
        <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          <div className="h-1 bg-brandGradient" aria-hidden="true" />
          <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{t("benchmarkLive.campaignSummaryTitle")}</p>

          <div className="mt-3 space-y-2">
            {results.map((row) => (
              <MetricComparisonRow
                key={row.metric}
                row={row}
                t={t}
                expanded={expanded === row.metric}
                onToggle={() => setExpanded(expanded === row.metric ? null : row.metric)}
                platformLabel={platformLabel}
                objectiveLabel={objectiveLabel}
                verticalLabel={verticalLabel}
                countryLabel={countryLabel}
              />
            ))}
          </div>

          {aggregate.directionalTotal > 0 && (
            <p className="mt-4 rounded-xl bg-primary-soft px-3 py-2 text-sm font-medium text-primary">
              {t("benchmarkLive.campaignAggregate", { n: aggregate.competitiveOrBetterCount, total: aggregate.directionalTotal })}
            </p>
          )}

          <CampaignInsight results={results} t={t} />

          {results.some((r) => r.status === "success") && (
            <div className="mt-4 border-t border-line pt-4">
              <SaveComparisonButton
                defaultName={`${t("comparisons.typeCampaign")} ${platformLabel} · ${countryLabel}`}
                buildPayload={() => ({
                  comparisonType: "campaign",
                  platform: cohort.platform,
                  objective: cohort.objective,
                  vertical: cohort.vertical,
                  country: cohort.country,
                  audienceStrategy: cohort.audienceStrategy || null,
                  funnelStage: cohort.funnelStage || null,
                  businessModel: cohort.businessModel || null,
                  spendBand: cohort.spendBand || null,
                  durationBand: cohort.durationBand || null,
                  timeWindow: cohort.timeWindow || null,
                  campaignRows: rows,
                })}
              />
            </div>
          )}
          </div>
        </section>
      )}

      {results && <DiagnosticSection rows={results} t={t} />}
    </div>
  );
}

// Deterministic, grouped-by-classification campaign insight — no free
// text generation, no causal claims, no recommendations (Phase 7 item
// 11). Only lists metrics; never assigns a score.
function CampaignInsight({ results, t }: { results: CampaignResultRow[]; t: (key: string, vars?: Record<string, string | number>) => string }) {
  // Phase 38: grouped by the RESOLVED (direction-aware) label key, not
  // the raw classification — two metrics can share a classification
  // enum value (e.g. "muy_competitivo") while meaning opposite real
  // positions (well below vs. well above the median) depending on
  // each metric's own benchmarkDirection, so grouping by classification
  // alone could silently merge metrics under the wrong label.
  const groups = new Map<string, string[]>();
  for (const r of results) {
    if (r.status !== "success" || r.classification === null) continue;
    const key = resolveClassificationLabelKey(r.response.benchmarkDirection, r.classification);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r.metric.toUpperCase());
  }
  if (groups.size === 0) return null;

  return (
    <div className="mt-4 space-y-1 text-sm text-ink-700">
      {Array.from(groups.entries()).map(([labelKey, metrics]) => (
        <p key={labelKey}>
          <span className="font-semibold">{metrics.join(", ")}</span>: {t(`benchmarkLive.labels.${labelKey}`).toLowerCase()}
        </p>
      ))}
    </div>
  );
}
